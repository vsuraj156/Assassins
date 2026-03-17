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

  return NextResponse.json({ target: { team: targetTeam, players: targetPlayers } })
}
