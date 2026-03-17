import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { sendKillApprovedEmail, sendStatusChangeEmail } from '@/lib/email'

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

  if (action === 'approve') {
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

    // Award points to killer team
    const newPoints = (elim.killer_team?.points ?? 0) + elim.points
    await db.from('teams').update({ points: newPoints, last_elimination_at: now }).eq('id', elim.killer_team_id)

    // Check if target team is fully eliminated
    const { data: survivors } = await db
      .from('players')
      .select('id')
      .eq('team_id', elim.target_team_id)
      .not('status', 'eq', 'terminated')

    if (!survivors || survivors.length === 0) {
      const { data: targetTeam } = await db.from('teams').select('status').eq('id', elim.target_team_id).single()
      if (targetTeam?.status === 'active') {
        await db.from('teams').update({ status: 'eliminated' }).eq('id', elim.target_team_id)
        await db.from('status_history').insert({
          entity_type: 'team',
          entity_id: elim.target_team_id,
          old_status: 'active',
          new_status: 'eliminated',
          reason: 'All members eliminated',
          changed_by: session.user.playerId,
        })

        // Advance the target chain: killer team inherits the eliminated team's target
        const { data: eliminatedTeam } = await db
          .from('teams')
          .select('target_team_id')
          .eq('id', elim.target_team_id)
          .single()
        if (eliminatedTeam?.target_team_id && eliminatedTeam.target_team_id !== elim.killer_team_id) {
          await db
            .from('teams')
            .update({ target_team_id: eliminatedTeam.target_team_id })
            .eq('id', elim.killer_team_id)
        }
      }
    }

    // Send email to killer
    if (elim.killer?.user_email) {
      await sendKillApprovedEmail(elim.killer.user_email, elim.killer.name, elim.target?.name ?? 'target', elim.points)
    }

    // Notify target
    if (elim.target?.user_email) {
      await sendStatusChangeEmail(elim.target.user_email, elim.target.name, prevStatus, 'terminated', `Eliminated by ${elim.killer?.name}`)
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
