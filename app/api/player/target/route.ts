import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

// GET /api/player/target — returns current target team info (server-only)
export async function GET() {
  const session = await auth()
  if (!session?.user?.teamId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()

  // Get this team's target
  const { data: myTeam } = await db
    .from('teams')
    .select('target_team_id')
    .eq('id', session.user.teamId)
    .single()

  if (!myTeam?.target_team_id) {
    return NextResponse.json({ target: null })
  }

  // Get target team's active players (only name + photo — never email)
  const { data: targetPlayers } = await db
    .from('players')
    .select('id, name, photo_url, status, is_double_0, code_name')
    .eq('team_id', myTeam.target_team_id)
    .not('status', 'eq', 'terminated')

  const { data: targetTeam } = await db
    .from('teams')
    .select('id, name, status')
    .eq('id', myTeam.target_team_id)
    .single()

  // Get active wars involving this team
  const { data: wars } = await db
    .from('wars')
    .select('team1_id, team2_id')
    .eq('game_id', session.user.gameId!)
    .eq('status', 'active')

  const warTeamIds = (wars ?? [])
    .flatMap((w) => [w.team1_id, w.team2_id])
    .filter((id) => id !== session.user.teamId && id !== myTeam?.target_team_id)

  let warTargets: { teamName: string; players: { id: string; name: string; photo_url: string | null }[] }[] = []
  for (const teamId of [...new Set(warTeamIds)]) {
    const { data: team } = await db.from('teams').select('name').eq('id', teamId).single()
    const { data: players } = await db
      .from('players')
      .select('id, name, photo_url')
      .eq('team_id', teamId)
      .not('status', 'eq', 'terminated')
    if (team && players?.length) {
      warTargets.push({ teamName: team.name, players })
    }
  }

  // If current player is a Double-0, also return other Double-0s not already listed
  const { data: currentPlayer } = await db
    .from('players')
    .select('is_double_0')
    .eq('id', session.user.playerId!)
    .single()

  // Build set of player IDs already covered by target + war groups
  const alreadyListed = new Set<string>([
    ...(targetPlayers ?? []).map((p) => p.id),
    ...warTargets.flatMap((wt) => wt.players.map((p) => p.id)),
  ])

  let double0Targets: { id: string; name: string; photo_url: string | null }[] = []
  if (currentPlayer?.is_double_0) {
    const { data } = await db
      .from('players')
      .select('id, name, photo_url')
      .eq('game_id', session.user.gameId!)
      .eq('is_double_0', true)
      .not('status', 'eq', 'terminated')
      .not('team_id', 'eq', session.user.teamId)
    double0Targets = (data ?? []).filter((p) => p.id !== session.user.playerId && !alreadyListed.has(p.id))
  }

  return NextResponse.json({ target: { team: targetTeam, players: targetPlayers }, warTargets, double0Targets })
}
