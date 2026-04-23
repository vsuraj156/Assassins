import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServerClient } from '@/lib/db'
import { sendWarActivatedEmail } from '@/lib/email'

async function runWarsCron() {
  const db = createServerClient()
  const now = new Date().toISOString()

  const { data: games } = await db
    .from('games')
    .select('id')
    .eq('status', 'active')
  if (!games?.length) return

  for (const game of games) {
    const { data: activatedWars } = await db
      .from('wars')
      .update({ status: 'active', approved_at: now })
      .eq('game_id', game.id)
      .eq('status', 'pending')
      .select('id, team1_id, team2_id')

    if (!activatedWars?.length) continue

    for (const war of activatedWars) {
      const { data: teams } = await db
        .from('teams')
        .select('id, name, players!team_id(id, name, user_email)')
        .in('id', [war.team1_id, war.team2_id])

      if (!teams || teams.length !== 2) continue

      const [teamA, teamB] = teams
      const teamAPlayers = (teamA.players ?? []) as { id: string; name: string; user_email: string }[]
      const teamBPlayers = (teamB.players ?? []) as { id: string; name: string; user_email: string }[]

      await Promise.all([
        ...teamAPlayers.map((p) => sendWarActivatedEmail(p.user_email, p.name, teamB.name)),
        ...teamBPlayers.map((p) => sendWarActivatedEmail(p.user_email, p.name, teamA.name)),
      ])
    }
  }
}

// Runs at midnight EDT (04:00 UTC) via external scheduler
export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  waitUntil(runWarsCron())
  return NextResponse.json({ accepted: true }, { status: 202 })
}
