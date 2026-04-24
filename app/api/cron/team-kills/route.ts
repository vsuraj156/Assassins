import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServerClient } from '@/lib/db'
import { sendStatusChangeEmail } from '@/lib/email'
import { killTimerResetTime, isKillTimerPenaltyDue } from '@/lib/game-engine'
import { repairTargetChainIfTeamEliminated } from '@/lib/target-chain'

async function runKillTimerCron() {
  const db = createServerClient()
  const now = Date.now()
  const INITIAL_WINDOW_MS = 48 * 60 * 60 * 1000
  const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000

  const { data: games } = await db
    .from('games')
    .select('id, kill_blackout_hours, start_time, general_amnesty_active')
    .eq('status', 'active')
  if (!games?.length) return

  for (const game of games) {
    if (game.general_amnesty_active) continue

    const { data: teams } = await db
      .from('teams')
      .select('id, last_elimination_at, last_kill_penalty_at')
      .eq('game_id', game.id)
      .eq('status', 'active')

    if (!teams) continue

    for (const team of teams) {
      const referenceMs = team.last_elimination_at
        ? killTimerResetTime(new Date(team.last_elimination_at)).getTime()
        : game.start_time
        ? new Date(game.start_time).getTime()
        : null

      if (!referenceMs) continue

      const lastPenaltyMs = team.last_kill_penalty_at
        ? new Date(team.last_kill_penalty_at).getTime()
        : null

      if (!isKillTimerPenaltyDue(referenceMs, lastPenaltyMs, now, INITIAL_WINDOW_MS, REPEAT_WINDOW_MS)) continue

      const { data: teamPlayers } = await db
        .from('players')
        .select('id, name, user_email, status')
        .eq('team_id', team.id)
        .eq('role', 'player')
        .eq('is_rogue', false)
        .in('status', ['active', 'exposed', 'wanted'])

      if (!teamPlayers || teamPlayers.length === 0) continue

      const active = teamPlayers.filter((p) => p.status === 'active')
      const exposed = teamPlayers.filter((p) => p.status === 'exposed')
      const wanted = teamPlayers.filter((p) => p.status === 'wanted')
      const pool = active.length > 0 ? active : exposed.length > 0 ? exposed : wanted

      const victim = pool[Math.floor(Math.random() * pool.length)]
      const oldStatus = victim.status as string
      const newStatus =
        oldStatus === 'active' ? 'exposed' : oldStatus === 'exposed' ? 'wanted' : 'terminated'

      await db.from('players').update({ status: newStatus }).eq('id', victim.id)
      await db.from('status_history').insert({
        entity_type: 'player',
        entity_id: victim.id,
        old_status: oldStatus,
        new_status: newStatus,
        reason: `Team failed to make a kill within ${game.kill_blackout_hours} hours`,
        reason_code: 'kill_timer_penalty',
        changed_by: null,
      })
      await db
        .from('teams')
        .update({ last_kill_penalty_at: new Date(now).toISOString() })
        .eq('id', team.id)
      await sendStatusChangeEmail(
        victim.user_email,
        victim.name,
        oldStatus,
        newStatus,
        `Your team hasn't made a kill in ${game.kill_blackout_hours} hours`
      )

      if (newStatus === 'terminated') {
        await repairTargetChainIfTeamEliminated(db, team.id)
      }
    }
  }
}

// Runs every hour via external scheduler
export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  waitUntil(runKillTimerCron())
  return NextResponse.json({ accepted: true }, { status: 202 })
}
