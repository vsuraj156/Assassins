import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

// GET /api/player/target — returns all eligible target populations for the current player
export async function GET() {
  const session = await auth()
  if (!session?.user?.teamId || !session?.user?.playerId || !session?.user?.gameId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const myTeamId = session.user.teamId
  const myPlayerId = session.user.playerId
  const myGameId = session.user.gameId

  const now = new Date().toISOString()

  const [
    { data: myTeam },
    { data: currentPlayer },
    { data: wars },
    { data: goldenGun },
  ] = await Promise.all([
    db.from('teams').select('target_team_id').eq('id', myTeamId).single(),
    db.from('players').select('is_double_0').eq('id', myPlayerId).single(),
    db.from('wars').select('team1_id, team2_id').eq('game_id', myGameId).eq('status', 'active'),
    db.from('golden_gun_events')
      .select('holder_team_id')
      .eq('game_id', myGameId)
      .eq('status', 'active')
      .gt('expires_at', now)
      .single(),
  ])

  const alreadyListed = new Set<string>()

  // 1. Assigned target team
  let targetTeam: { id: string; name: string; status: string } | null = null
  let targetPlayers: { id: string; name: string; photo_url: string | null }[] = []
  if (myTeam?.target_team_id) {
    const [{ data: tt }, { data: tp }] = await Promise.all([
      db.from('teams').select('id, name, status').eq('id', myTeam.target_team_id).single(),
      db.from('players')
        .select('id, name, photo_url')
        .eq('team_id', myTeam.target_team_id)
        .not('status', 'eq', 'terminated'),
    ])
    targetTeam = tt ?? null
    targetPlayers = tp ?? []
    targetPlayers.forEach((p) => alreadyListed.add(p.id))
  }

  // 2. War targets (teams at war with us, excluding assigned target)
  const warTeamIds = [...new Set(
    (wars ?? [])
      .flatMap((w) => [w.team1_id, w.team2_id])
      .filter((id) => id !== myTeamId && id !== myTeam?.target_team_id),
  )]

  const warTargets: { teamName: string; players: { id: string; name: string; photo_url: string | null }[] }[] = []
  for (const teamId of warTeamIds) {
    const [{ data: team }, { data: players }] = await Promise.all([
      db.from('teams').select('name').eq('id', teamId).single(),
      db.from('players').select('id, name, photo_url').eq('team_id', teamId).not('status', 'eq', 'terminated'),
    ])
    if (team && players?.length) {
      players.forEach((p) => alreadyListed.add(p.id))
      warTargets.push({ teamName: team.name, players })
    }
  }

  // 3. Double-0 targets (if current player is a Double-0)
  let double0Targets: { id: string; name: string; photo_url: string | null }[] = []
  if (currentPlayer?.is_double_0) {
    const { data } = await db
      .from('players')
      .select('id, name, photo_url')
      .eq('game_id', myGameId)
      .eq('is_double_0', true)
      .not('status', 'eq', 'terminated')
      .not('team_id', 'eq', myTeamId)
    double0Targets = (data ?? []).filter((p) => p.id !== myPlayerId && !alreadyListed.has(p.id))
    double0Targets.forEach((p) => alreadyListed.add(p.id))
  }

  // 4. Rogue targets (any rogue player not on my team)
  const { data: rogueData } = await db
    .from('players')
    .select('id, name, photo_url')
    .eq('game_id', myGameId)
    .eq('is_rogue', true)
    .not('status', 'eq', 'terminated')
    .not('team_id', 'eq', myTeamId)
  const rogueTargets = (rogueData ?? []).filter((p) => !alreadyListed.has(p.id))
  rogueTargets.forEach((p) => alreadyListed.add(p.id))

  // 5. Exposed/wanted targets (open to everyone, not already listed)
  const { data: openData } = await db
    .from('players')
    .select('id, name, photo_url, status')
    .eq('game_id', myGameId)
    .in('status', ['exposed', 'wanted'])
    .not('team_id', 'eq', myTeamId)
  const openTargets = (openData ?? []).filter((p) => !alreadyListed.has(p.id))
  openTargets.forEach((p) => alreadyListed.add(p.id))

  // 6. Golden gun — all remaining players (if my team holds it)
  const holdsGoldenGun = !!goldenGun && goldenGun.holder_team_id === myTeamId
  let goldenGunTargets: { id: string; name: string; photo_url: string | null }[] = []
  if (holdsGoldenGun) {
    const { data } = await db
      .from('players')
      .select('id, name, photo_url')
      .eq('game_id', myGameId)
      .not('status', 'eq', 'terminated')
      .not('team_id', 'eq', myTeamId)
    goldenGunTargets = (data ?? []).filter((p) => !alreadyListed.has(p.id))
  }

  return NextResponse.json({
    target: { team: targetTeam, players: targetPlayers },
    warTargets,
    double0Targets,
    rogueTargets,
    openTargets,
    holdsGoldenGun,
    goldenGunTargets,
  })
}
