import { NextRequest, NextResponse } from 'next/server'
import { auth, isMultiProfileEmail } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { generateInviteCode } from '@/lib/game-engine'

// POST /api/player/team — create team or join team
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  if (body.action === 'create') {
    const { game_id, team_name, player_name, code_name } = body

    if (!code_name) return NextResponse.json({ error: 'Code name is required' }, { status: 400 })

    // Check game is in signup status
    const { data: game } = await db.from('games').select('status').eq('id', game_id).single()
    if (!game || game.status !== 'signup') {
      return NextResponse.json({ error: 'Game is not open for signup' }, { status: 400 })
    }

    // Check player doesn't already have a team in this game (unless multi-profile is allowed)
    if (!isMultiProfileEmail(session.user.email)) {
      const { data: existingPlayer } = await db
        .from('players')
        .select('id')
        .eq('game_id', game_id)
        .eq('user_email', session.user.email)
        .single()
      if (existingPlayer) {
        return NextResponse.json({ error: 'You are already registered in this game' }, { status: 409 })
      }
    }

    // Generate unique invite code
    let inviteCode = generateInviteCode()
    let attempts = 0
    while (attempts < 10) {
      const { data: existing } = await db.from('teams').select('id').eq('invite_code', inviteCode).single()
      if (!existing) break
      inviteCode = generateInviteCode()
      attempts++
    }

    // Create team
    const { data: team, error: teamError } = await db
      .from('teams')
      .insert({ game_id, name: team_name, invite_code: inviteCode, name_status: 'pending' })
      .select()
      .single()
    if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 })

    // Create player record — captain is Double-0 by default
    const { data: player, error: playerError } = await db
      .from('players')
      .insert({
        game_id,
        team_id: team.id,
        user_email: session.user.email,
        name: player_name,
        role: 'player',
        status: 'active',
        is_double_0: true,
        code_name: code_name ?? null,
        code_name_status: code_name ? 'pending' : 'approved',
      })
      .select()
      .single()
    if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 })

    // Set captain
    await db.from('teams').update({ captain_player_id: player.id }).eq('id', team.id)

    return NextResponse.json({ team: { ...team, captain_player_id: player.id }, player }, { status: 201 })
  }

  if (body.action === 'join') {
    const { invite_code, game_id, player_name, code_name } = body

    if (!code_name) return NextResponse.json({ error: 'Code name is required' }, { status: 400 })

    // Find team by invite code
    const { data: team } = await db
      .from('teams')
      .select('*, players!team_id(id)')
      .eq('invite_code', invite_code.toUpperCase())
      .single()

    if (!team) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
    if (team.game_id !== game_id) return NextResponse.json({ error: 'Invalid invite code for this game' }, { status: 400 })
    if ((team.players?.length ?? 0) >= 6) return NextResponse.json({ error: 'Team is full (max 6 players)' }, { status: 400 })

    // Check player doesn't already have a team in this game (unless multi-profile is allowed)
    if (!isMultiProfileEmail(session.user.email)) {
      const { data: existingPlayer } = await db
        .from('players')
        .select('id')
        .eq('game_id', game_id)
        .eq('user_email', session.user.email)
        .single()
      if (existingPlayer) {
        return NextResponse.json({ error: 'You are already registered in this game' }, { status: 409 })
      }
    }

    const { data: player, error } = await db
      .from('players')
      .insert({
        game_id,
        team_id: team.id,
        user_email: session.user.email,
        name: player_name,
        role: 'player',
        status: 'active',
        code_name: code_name ?? null,
        code_name_status: code_name ? 'pending' : 'approved',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ team, player }, { status: 201 })
  }

  if (body.action === 'set_double_0') {
    // Team captain designates a Double-0
    const { player_id } = body

    const { data: player } = await db.from('players').select('team_id, game_id').eq('id', player_id).single()
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

    // Lock once game has started
    const { data: game } = await db.from('games').select('status').eq('id', player.game_id).single()
    if (game && game.status !== 'signup') {
      return NextResponse.json({ error: 'Double-0 cannot be changed after the game has started' }, { status: 403 })
    }

    // Verify session user is captain of this team
    const { data: team } = await db.from('teams').select('captain_player_id').eq('id', player.team_id).single()
    const { data: sessionPlayer } = await db
      .from('players')
      .select('id')
      .eq('user_email', session.user.email!)
      .eq('team_id', player.team_id)
      .single()

    if (!sessionPlayer || team?.captain_player_id !== sessionPlayer.id) {
      return NextResponse.json({ error: 'Only the team captain can designate the Double-0' }, { status: 403 })
    }

    // Clear existing Double-0 on the team, then set new one
    await db.from('players').update({ is_double_0: false }).eq('team_id', player.team_id)
    await db.from('players').update({ is_double_0: true }).eq('id', player_id)

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
