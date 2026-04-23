import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { sendKillApprovedEmail, sendStatusChangeEmail, sendTargetUpdateEmail } from '@/lib/email'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') return null
  return session
}

// GET /api/admin/eliminations?game_id=xxx&status=pending
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gameId = req.nextUrl.searchParams.get('game_id')
  const status = req.nextUrl.searchParams.get('status')
  const db = createServerClient()

  let query = db.from('eliminations').select(`
    *,
    killer:players!killer_id(id, name, user_email, photo_url),
    target:players!target_id(id, name, user_email, photo_url, status),
    killer_team:teams!killer_team_id(id, name),
    target_team:teams!target_team_id(id, name)
  `)
  if (gameId) query = query.eq('game_id', gameId)
  if (status) query = query.eq('status', status)
  const { data, error } = await query.order('timestamp', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/eliminations — approve or reject
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { elimination_id, action, reason } = body
  const db = createServerClient()

  if (action === 'approve') {
    const { data: elim } = await db
      .from('eliminations')
      .select(`
        *,
        killer:players!killer_id(id, name, user_email),
        target:players!target_id(id, name, user_email, status),
        killer_team:teams!killer_team_id(id, points),
        target_team:teams!target_team_id(id)
      `)
      .eq('id', elimination_id)
      .single()

    if (!elim) return NextResponse.json({ error: 'Elimination not found' }, { status: 404 })

    const now = new Date().toISOString()

    // Update elimination status
    await db
      .from('eliminations')
      .update({ status: 'approved', approved_at: now, approved_by: session.user.playerId })
      .eq('id', elimination_id)

    // Terminate the target
    const prevStatus = elim.target?.status ?? 'active'
    await db.from('players').update({ status: 'terminated' }).eq('id', elim.target_id)
    await db.from('status_history').insert({
      entity_type: 'player',
      entity_id: elim.target_id,
      old_status: prevStatus,
      new_status: 'terminated',
      reason: `Eliminated by ${elim.killer?.name}`,
      changed_by: session.user.playerId,
    })

    // If the target held the golden gun, retire it — the gun is non-transferable
    await db
      .from('golden_gun_events')
      .update({ status: 'returned', returned_at: now })
      .eq('holder_player_id', elim.target_id)
      .eq('status', 'active')

    // Award points to killer team
    const newPoints = (elim.killer_team?.points ?? 0) + elim.points
    await db.from('teams').update({ points: newPoints, last_elimination_at: now }).eq('id', elim.killer_team_id)

    // Check if target team is fully eliminated — if so, return info for admin to confirm cascade
    const { data: survivors } = await db
      .from('players')
      .select('id')
      .eq('team_id', elim.target_team_id)
      .not('status', 'eq', 'terminated')

    let teamEliminatedPayload: { teamEliminated: true; eliminatedTeamId: string; eliminatedTeamName: string; newTargetTeamId: string; newTargetTeamName: string; hunterTeamId: string; killerTeamId: string } | null = null

    if (!survivors || survivors.length === 0) {
      // Rule XV: award +1 bonus point for full unit elimination
      await db.from('teams').update({ points: newPoints + 1 }).eq('id', elim.killer_team_id)

      const { data: targetTeam } = await db.from('teams').select('status, name, target_team_id').eq('id', elim.target_team_id).single()
      // The hunter is the team whose assigned target was just eliminated — they inherit the chain, not necessarily the killer.
      const { data: hunterTeam } = await db.from('teams').select('id').eq('target_team_id', elim.target_team_id).eq('status', 'active').single()
      if (targetTeam?.status === 'active' && targetTeam.target_team_id && hunterTeam && targetTeam.target_team_id !== hunterTeam.id) {
        const { data: newTargetTeam } = await db.from('teams').select('name').eq('id', targetTeam.target_team_id).single()
        if (newTargetTeam) {
          teamEliminatedPayload = {
            teamEliminated: true,
            eliminatedTeamId: elim.target_team_id,
            eliminatedTeamName: targetTeam.name,
            newTargetTeamId: targetTeam.target_team_id,
            newTargetTeamName: newTargetTeam.name,
            hunterTeamId: hunterTeam.id,
            killerTeamId: elim.killer_team_id,
          }
        }
      }
    }

    // Revert kill-timer penalties on the killer's team.
    // The kill timer only ever moves active→exposed. Check-in penalties are separate.
    // So for each penalized teammate, if their most recent 'exposed' entry was from the kill
    // timer, step them back exactly one level (exposed→active, or wanted→exposed if they also
    // missed a check-in after the timer hit them).
    const { data: penalizedTeammates } = await db
      .from('players')
      .select('id, name, user_email, status')
      .eq('team_id', elim.killer_team_id)
      .in('status', ['exposed', 'wanted'])

    for (const teammate of penalizedTeammates ?? []) {
      const { data: lastExposure } = await db
        .from('status_history')
        .select('reason_code')
        .eq('entity_id', teammate.id)
        .eq('entity_type', 'player')
        .eq('new_status', 'exposed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (lastExposure?.reason_code !== 'kill_timer_penalty') continue

      const oldStatus = teammate.status as 'exposed' | 'wanted'
      const newStatus = oldStatus === 'wanted' ? 'exposed' : 'active'

      await db.from('players').update({ status: newStatus }).eq('id', teammate.id)
      await db.from('status_history').insert({
        entity_type: 'player',
        entity_id: teammate.id,
        old_status: oldStatus,
        new_status: newStatus,
        reason: 'Team made a kill — kill timer reset',
        changed_by: session.user.playerId,
      })
      await sendStatusChangeEmail(
        teammate.user_email,
        teammate.name,
        oldStatus,
        newStatus,
        "Your team made a kill — you're back in action"
      )
    }

    // Send email to killer
    if (elim.killer?.user_email) {
      await sendKillApprovedEmail(elim.killer.user_email, elim.killer.name, elim.target?.name ?? 'target', elim.points)
    }

    // Notify target
    if (elim.target?.user_email) {
      await sendStatusChangeEmail(elim.target.user_email, elim.target.name, prevStatus, 'terminated', `Eliminated by ${elim.killer?.name}`)
    }

    return NextResponse.json({ success: true, ...(teamEliminatedPayload ?? {}) })
  }

  if (action === 'advance_target_chain') {
    const { eliminated_team_id, hunter_team_id, killer_team_id, dry_run } = body

    const { data: eliminatedTeam } = await db
      .from('teams')
      .select('name, target_team_id, status')
      .eq('id', eliminated_team_id)
      .single()

    if (!eliminatedTeam) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    const newTargetId = eliminatedTeam.target_team_id
    if (!newTargetId || newTargetId === hunter_team_id) {
      return NextResponse.json({ error: 'No valid target to advance to' }, { status: 400 })
    }

    const { data: newTargetTeam } = await db.from('teams').select('name').eq('id', newTargetId).single()
    const { data: newTargetPlayers } = await db
      .from('players')
      .select('name')
      .eq('team_id', newTargetId)
      .neq('status', 'terminated')
    const { data: hunterTeamPlayers } = await db
      .from('players')
      .select('name, user_email')
      .eq('team_id', hunter_team_id)
      .neq('status', 'terminated')

    if (dry_run) {
      return NextResponse.json({
        dry_run: true,
        eliminatedTeamName: eliminatedTeam.name,
        newTargetTeamName: newTargetTeam?.name,
        playersToNotify: (hunterTeamPlayers ?? []).map((p) => ({ name: p.name, email: p.user_email })),
      })
    }

    if (eliminatedTeam.status === 'active') {
      await db.from('teams').update({ status: 'eliminated' }).eq('id', eliminated_team_id)
      await db.from('status_history').insert({
        entity_type: 'team',
        entity_id: eliminated_team_id,
        old_status: 'active',
        new_status: 'eliminated',
        reason: 'All members eliminated',
        changed_by: session.user.playerId,
      })
    }

    // Update the hunter's target pointer, not the killer's — the hunter inherits the chain.
    await db.from('teams').update({ target_team_id: newTargetId }).eq('id', hunter_team_id)

    if (newTargetTeam) {
      const targetPlayerNames = (newTargetPlayers ?? []).map((p) => p.name)
      for (const player of hunterTeamPlayers ?? []) {
        if (player.user_email) {
          await sendTargetUpdateEmail(player.user_email, player.name, newTargetTeam.name, targetPlayerNames)
        }
      }
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'reject') {
    await db
      .from('eliminations')
      .update({ status: 'rejected', approved_by: session.user.playerId, approved_at: new Date().toISOString() })
      .eq('id', elimination_id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
