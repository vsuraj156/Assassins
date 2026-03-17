import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { buildTargetChain, goldenGunExpiresAt } from '@/lib/game-engine'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return null
  }
  return session
}

// GET /api/admin/game — list all games
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
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

    const chain = buildTargetChain(teams.map((t) => t.id))
    for (const [teamId, targetId] of chain) {
      await db.from('teams').update({ target_team_id: targetId }).eq('id', teamId)
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

  // action: golden_gun — release to a team
  if (body.action === 'golden_gun') {
    const now = new Date()
    const expires = goldenGunExpiresAt(now)
    const { error } = await db.from('golden_gun_events').insert({
      game_id: body.game_id,
      holder_team_id: body.team_id,
      released_at: now.toISOString(),
      expires_at: expires.toISOString(),
      status: 'active',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, expires_at: expires.toISOString() })
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
