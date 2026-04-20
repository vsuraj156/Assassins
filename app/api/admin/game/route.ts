import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { buildTargetChain, goldenGunExpiresAt } from '@/lib/game-engine'
import { sendGameStartTargetEmail, sendGoldenGunEmail } from '@/lib/email'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return null
  }
  return session
}

// GET /api/admin/game — list all games; ?game_id=xxx also returns current golden gun
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const gameId = req.nextUrl.searchParams.get('game_id')

  if (gameId) {
    const now = new Date().toISOString()
    const [{ data: game }, { data: goldenGun }] = await Promise.all([
      db.from('games').select('*').eq('id', gameId).single(),
      db.from('golden_gun_events')
        .select('id, holder_player_id, holder_team_id, released_at, expires_at, returned_at, status, holder:players!holder_player_id(id, name, team_id, teams!team_id(name))')
        .eq('game_id', gameId)
        .eq('status', 'active')
        .gt('expires_at', now)
        .maybeSingle(),
    ])
    return NextResponse.json({ game, currentGun: goldenGun ?? null })
  }

  const { data, error } = await db.from('games').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/game — create game or perform action
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  // action: create
  if (body.action === 'create') {
    const { data, error } = await db
      .from('games')
      .insert({ name: body.name, status: 'signup', kill_blackout_hours: body.kill_blackout_hours ?? 48 })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // action: start — assign target chain and activate
  if (body.action === 'start') {
    const { game_id } = body

    // Check all names are approved
    const { data: pendingTeams } = await db
      .from('teams')
      .select('id')
      .eq('game_id', game_id)
      .eq('name_status', 'pending')
    const { data: pendingNames } = await db
      .from('players')
      .select('id')
      .eq('game_id', game_id)
      .eq('code_name_status', 'pending')

    if ((pendingTeams?.length ?? 0) > 0 || (pendingNames?.length ?? 0) > 0) {
      return NextResponse.json({ error: 'All team names and code names must be approved before starting' }, { status: 400 })
    }

    // Build target chain
    const { data: teams } = await db.from('teams').select('id').eq('game_id', game_id).eq('status', 'active')
    if (!teams || teams.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 active teams to start' }, { status: 400 })
    }

    const { data: teamsWithDetails } = await db
      .from('teams')
      .select('id, name, players(name, user_email)')
      .eq('game_id', game_id)
      .eq('status', 'active')

    const chain = buildTargetChain((teamsWithDetails ?? []).map((t) => t.id))
    const teamById = new Map((teamsWithDetails ?? []).map((t) => [t.id, t]))

    for (const [teamId, targetId] of chain) {
      await db.from('teams').update({ target_team_id: targetId }).eq('id', teamId)
    }

    for (const [teamId, targetId] of chain) {
      const team = teamById.get(teamId)
      const targetTeam = teamById.get(targetId)
      if (!team || !targetTeam) continue
      const targetPlayerNames = ((targetTeam.players ?? []) as { name: string }[]).map((p) => p.name)
      for (const player of (team.players ?? []) as { name: string; user_email: string | null }[]) {
        if (player.user_email) {
          await sendGameStartTargetEmail(player.user_email, player.name, targetTeam.name, targetPlayerNames)
        }
      }
    }

    const { error } = await db
      .from('games')
      .update({ status: 'active', start_time: new Date().toISOString() })
      .eq('id', game_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // action: end
  if (body.action === 'end') {
    const { error } = await db
      .from('games')
      .update({ status: 'ended', end_time: new Date().toISOString() })
      .eq('id', body.game_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // action: golden_gun — register that a player picked up the gun
  if (body.action === 'golden_gun') {
    const { game_id, player_id } = body

    // Block if a gun is already active
    const nowIso = new Date().toISOString()
    const { data: existing } = await db
      .from('golden_gun_events')
      .select('id')
      .eq('game_id', game_id)
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'A golden gun is already active. Mark it returned first.' }, { status: 400 })
    }

    const { data: holder } = await db
      .from('players')
      .select('id, name, team_id, user_email')
      .eq('id', player_id)
      .single()
    if (!holder?.team_id) return NextResponse.json({ error: 'Player not found or has no team' }, { status: 400 })

    const now = new Date()
    const expires = goldenGunExpiresAt(now)
    const { error } = await db.from('golden_gun_events').insert({
      game_id,
      holder_player_id: holder.id,
      holder_team_id: holder.team_id,
      released_at: now.toISOString(),
      expires_at: expires.toISOString(),
      status: 'active',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (holder.user_email) {
      await sendGoldenGunEmail(holder.user_email, holder.name, expires)
    }

    return NextResponse.json({ success: true, expires_at: expires.toISOString() })
  }

  // action: return_golden_gun — mark gun returned
  if (body.action === 'return_golden_gun') {
    const { event_id } = body
    const { error } = await db
      .from('golden_gun_events')
      .update({ status: 'returned', returned_at: new Date().toISOString() })
      .eq('id', event_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // action: update_totem
  if (body.action === 'update_totem') {
    const { error } = await db
      .from('games')
      .update({ totem_description: body.totem_description })
      .eq('id', body.game_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // action: toggle_amnesty — start or end general amnesty, shifting kill timers on end
  if (body.action === 'toggle_amnesty') {
    const { game_id } = body
    const { data: game } = await db
      .from('games')
      .select('general_amnesty_active, amnesty_started_at, start_time')
      .eq('id', game_id)
      .single()
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

    if (!game.general_amnesty_active) {
      await db
        .from('games')
        .update({ general_amnesty_active: true, amnesty_started_at: new Date().toISOString() })
        .eq('id', game_id)
      return NextResponse.json({ success: true, amnesty: true })
    }

    // Ending amnesty: shift all team kill timers forward by the amnesty duration
    const now = new Date()
    const durationMs = game.amnesty_started_at
      ? now.getTime() - new Date(game.amnesty_started_at).getTime()
      : 0

    if (durationMs > 0) {
      const { data: teams } = await db
        .from('teams')
        .select('id, last_elimination_at, last_kill_penalty_at')
        .eq('game_id', game_id)
        .eq('status', 'active')

      for (const team of teams ?? []) {
        const updates: Record<string, string> = {}
        if (team.last_elimination_at) {
          updates.last_elimination_at = new Date(new Date(team.last_elimination_at).getTime() + durationMs).toISOString()
        }
        if (team.last_kill_penalty_at) {
          updates.last_kill_penalty_at = new Date(new Date(team.last_kill_penalty_at).getTime() + durationMs).toISOString()
        }
        if (Object.keys(updates).length > 0) {
          await db.from('teams').update(updates).eq('id', team.id)
        }
      }
    }

    const gameUpdates: Record<string, string | null | boolean> = {
      general_amnesty_active: false,
      amnesty_started_at: null,
    }
    if (game.start_time && durationMs > 0) {
      gameUpdates.start_time = new Date(new Date(game.start_time).getTime() + durationMs).toISOString()
    }
    await db.from('games').update(gameUpdates).eq('id', game_id)
    return NextResponse.json({ success: true, amnesty: false })
  }

  // action: assign_targets (manual override)
  if (body.action === 'assign_targets') {
    // body.assignments: { [teamId]: targetTeamId }
    for (const [teamId, targetId] of Object.entries(body.assignments)) {
      await db.from('teams').update({ target_team_id: targetId }).eq('id', teamId)
    }
    return NextResponse.json({ success: true })
  }

  // action: set_signup
  if (body.action === 'set_signup') {
    const { error } = await db
      .from('games')
      .update({ status: 'signup' })
      .eq('id', body.game_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// PATCH /api/admin/game — update game settings
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { game_id, ...updates } = body
  const db = createServerClient()

  const { data, error } = await db.from('games').update(updates).eq('id', game_id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
