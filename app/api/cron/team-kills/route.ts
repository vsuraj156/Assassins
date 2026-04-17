import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'
import { sendStatusChangeEmail } from '@/lib/email'

// Runs every hour via Vercel Cron
export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  // Get all active games
  const { data: games } = await db.from('games').select('id, kill_blackout_hours, start_time').eq('status', 'active')
  if (!games?.length) return NextResponse.json({ exposed: 0 })

  let exposed = 0

  for (const game of games) {
    const windowMs = game.kill_blackout_hours * 60 * 60 * 1000
    const gameCutoff = new Date(Date.now() - windowMs).toISOString()
    // For teams with no kills, the clock starts from game start_time, not the epoch.
    // Only treat null last_elimination_at as stalled if the game itself started >window ago.
    const gameStartedBeforeCutoff = game.start_time && new Date(game.start_time) < new Date(gameCutoff)

    // Teams that haven't killed in the required window (or never killed if game is old enough)
    const filterExpr = gameStartedBeforeCutoff
      ? `last_elimination_at.is.null,last_elimination_at.lt.${gameCutoff}`
      : `last_elimination_at.lt.${gameCutoff}`

    const { data: stalledTeams } = await db
      .from('teams')
      .select('id')
      .eq('game_id', game.id)
      .eq('status', 'active')
      .or(filterExpr)

    if (!stalledTeams) continue

    for (const team of stalledTeams) {
      // Pick a random active player on this team who isn't already exposed
      const { data: activePlayers } = await db
        .from('players')
        .select('id, name, user_email, status')
        .eq('team_id', team.id)
        .eq('status', 'active')

      if (!activePlayers || activePlayers.length === 0) continue

      // Random pick
      const victim = activePlayers[Math.floor(Math.random() * activePlayers.length)]

      await db.from('players').update({ status: 'exposed' }).eq('id', victim.id)

      await db.from('status_history').insert({
        entity_type: 'player',
        entity_id: victim.id,
        old_status: 'active',
        new_status: 'exposed',
        reason: `Team failed to make a kill within ${game.kill_blackout_hours} hours`,
        changed_by: null,
      })

      await sendStatusChangeEmail(
        victim.user_email,
        victim.name,
        'active',
        'exposed',
        `Your team hasn't made a kill in ${game.kill_blackout_hours} hours`
      )

      exposed++
    }
  }

  return NextResponse.json({ exposed })
}
