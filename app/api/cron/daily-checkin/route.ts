import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'
import { isExposedPenaltyDue, nextStatusAfterMissedCheckin } from '@/lib/game-engine'
import { sendStatusChangeEmail } from '@/lib/email'
import { repairTargetChainIfTeamEliminated } from '@/lib/target-chain'
import { PlayerStatus } from '@/types/game'

// Runs at 11:59 PM daily via Vercel Cron
export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  // Get all active games
  const { data: games } = await db
    .from('games')
    .select('id, general_amnesty_active')
    .eq('status', 'active')
  if (!games?.length) return NextResponse.json({ processed: 0 })

  let processed = 0

  for (const game of games) {
    if (game.general_amnesty_active) continue

    // Auto-approve still-pending check-ins so a slow admin review doesn't penalize a player.
    const { data: pending } = await db
      .from('checkins')
      .select('id')
      .eq('game_id', game.id)
      .eq('meal_date', today)
      .eq('status', 'pending')
    if (pending?.length) {
      await db
        .from('checkins')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .in('id', pending.map((c) => c.id))
    }

    // Get all eligible players (active, exposed, wanted)
    const { data: players } = await db
      .from('players')
      .select('id, status, name, user_email, team_id')
      .eq('game_id', game.id)
      .in('status', ['active', 'exposed', 'wanted'])

    if (!players) continue

    // Get all approved checkins for today
    const { data: checkins } = await db
      .from('checkins')
      .select('player_id')
      .eq('game_id', game.id)
      .eq('meal_date', today)
      .eq('status', 'approved')

    const checkedInPlayerIds = new Set(checkins?.map((c) => c.player_id) ?? [])

    // Rule 2b: find when each currently-exposed player became exposed
    const exposedPlayerIds = players.filter(p => p.status === 'exposed').map(p => p.id)
    const exposedSinceMap = new Map<string, Date>()
    if (exposedPlayerIds.length > 0) {
      const { data: history } = await db
        .from('status_history')
        .select('entity_id, created_at')
        .eq('entity_type', 'player')
        .eq('new_status', 'exposed')
        .in('entity_id', exposedPlayerIds)
        .order('created_at', { ascending: false })
      for (const row of history ?? []) {
        if (!exposedSinceMap.has(row.entity_id)) {
          exposedSinceMap.set(row.entity_id, new Date(row.created_at))
        }
      }
    }

    for (const player of players) {
      // Rule 2b: exposed 48+ hours → wanted, independent of check-in status
      if (player.status === 'exposed') {
        const exposedSince = exposedSinceMap.get(player.id)
        if (exposedSince && isExposedPenaltyDue(exposedSince, now)) {
          await db.from('players').update({ status: 'wanted' }).eq('id', player.id)
          await db.from('status_history').insert({
            entity_type: 'player',
            entity_id: player.id,
            old_status: 'exposed',
            new_status: 'wanted',
            reason: 'Exposed for 48+ hours',
            changed_by: null,
          })
          await sendStatusChangeEmail(player.user_email, player.name, 'exposed', 'wanted', 'Exposed for 48+ hours')
          processed++
          continue // skip missed check-in check for this player
        }
      }

      if (checkedInPlayerIds.has(player.id)) continue

      const nextStatus = nextStatusAfterMissedCheckin(player.status as PlayerStatus)
      if (!nextStatus) continue

      // Update status
      await db.from('players').update({ status: nextStatus }).eq('id', player.id)

      // Log to history
      await db.from('status_history').insert({
        entity_type: 'player',
        entity_id: player.id,
        old_status: player.status,
        new_status: nextStatus,
        reason: 'Missed daily meal check-in',
        changed_by: null, // automated
      })

      // Email notification
      await sendStatusChangeEmail(player.user_email, player.name, player.status, nextStatus, 'Missed daily meal check-in')

      if (nextStatus === 'terminated' && player.team_id) {
        await repairTargetChainIfTeamEliminated(db, player.team_id)
      }

      processed++
    }
  }

  return NextResponse.json({ processed, date: today })
}
