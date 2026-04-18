import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { isKillValid, eliminationPoints } from '@/lib/game-engine'
import { sendKillClaimEmail } from '@/lib/email'

// POST /api/player/elimination — submit a kill claim
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.playerId || !session.user.teamId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { target_player_id, notes } = body
  const db = createServerClient()

  // Load killer info
  const { data: killer } = await db
    .from('players')
    .select('id, name, game_id, team_id, status, is_double_0, is_rogue')
    .eq('id', session.user.playerId)
    .single()

  if (!killer) return NextResponse.json({ error: 'Killer not found' }, { status: 404 })
  if (killer.status === 'terminated') return NextResponse.json({ error: 'You are terminated' }, { status: 403 })

  // Load target info
  const { data: target } = await db
    .from('players')
    .select('id, name, user_email, team_id, status, is_double_0, is_rogue')
    .eq('id', target_player_id)
    .single()

  if (!target) return NextResponse.json({ error: 'Target not found' }, { status: 404 })
  if (target.status === 'terminated') return NextResponse.json({ error: 'Target is already terminated' }, { status: 400 })

  // Load killer's team assigned target
  const { data: killerTeam } = await db
    .from('teams')
    .select('target_team_id')
    .eq('id', killer.team_id)
    .single()

  // Load active wars
  const { data: activeWars } = await db
    .from('wars')
    .select('team1_id, team2_id, status')
    .eq('game_id', killer.game_id)
    .eq('status', 'active')

  // Check golden gun
  const now = new Date().toISOString()
  const { data: goldenGun } = await db
    .from('golden_gun_events')
    .select('holder_team_id')
    .eq('game_id', killer.game_id)
    .eq('status', 'active')
    .gt('expires_at', now)
    .single()

  const validationResult = isKillValid({
    killerTeamId: killer.team_id!,
    targetTeamId: target.team_id!,
    targetStatus: target.status as import('@/types/game').PlayerStatus,
    assignedTargetTeamId: killerTeam?.target_team_id ?? null,
    activeWars: activeWars ?? [],
    killerIsDouble0: killer.is_double_0,
    targetIsDouble0: target.is_double_0,
    killerIsRogue: killer.is_rogue,
    targetIsRogue: target.is_rogue,
    goldenGunActive: !!goldenGun,
    goldenGunHolderTeamId: goldenGun?.holder_team_id ?? null,
  })

  if (!validationResult.valid) {
    return NextResponse.json({ error: validationResult.reason }, { status: 400 })
  }

  const points = eliminationPoints(target.is_double_0)

  const { data, error } = await db
    .from('eliminations')
    .insert({
      game_id: killer.game_id,
      killer_id: killer.id,
      target_id: target.id,
      killer_team_id: killer.team_id,
      target_team_id: target.team_id,
      is_double_0: target.is_double_0,
      points,
      status: 'pending',
      notes: notes ?? null,
      timestamp: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the target that a claim was filed against them
  if (target.user_email) {
    await sendKillClaimEmail(target.user_email, target.name, killer?.name ?? 'Someone')
  }

  return NextResponse.json(data, { status: 201 })
}

// GET /api/player/elimination — get player's submitted eliminations
export async function GET() {
  const session = await auth()
  if (!session?.user?.playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const { data, error } = await db
    .from('eliminations')
    .select('*, target:players!target_id(id, name, photo_url)')
    .eq('killer_id', session.user.playerId)
    .order('timestamp', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
