import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { sendStatusChangeEmail, sendCheckinRejectedEmail } from '@/lib/email'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') return null
  return session
}

// GET /api/admin/checkins?game_id=xxx&status=pending
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gameId = req.nextUrl.searchParams.get('game_id')
  const status = req.nextUrl.searchParams.get('status')
  const db = createServerClient()

  let query = db.from('checkins').select('*, player:players!player_id(id, name, user_email, team_id, photo_url, team:teams!team_id(id, name))')
  if (gameId) query = query.eq('game_id', gameId)
  if (status) query = query.eq('status', status)
  const { data, error } = await query.order('submitted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/checkins — approve or reject
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { checkin_id, action } = body
  const db = createServerClient()

  // Fetch checkin first so we have player_id and meal_date for recovery logic
  const { data: checkin } = await db
    .from('checkins')
    .select('id, player_id, meal_date')
    .eq('id', checkin_id)
    .single()

  if (!checkin) return NextResponse.json({ error: 'Check-in not found' }, { status: 404 })

  const { data: checkinPlayer } = await db
    .from('players')
    .select('name, user_email')
    .eq('id', checkin.player_id)
    .single()

  const now = new Date().toISOString()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  const { error } = await db
    .from('checkins')
    .update({ status: newStatus, reviewed_at: now, reviewed_by: session.user.playerId })
    .eq('id', checkin_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // On rejection: notify the player
  if (action === 'reject') {
    if (checkinPlayer) {
      await sendCheckinRejectedEmail(checkinPlayer.user_email, checkinPlayer.name)
    }
  }

  // On approval: check if player now has one approved check-in in each meal window today.
  // If so, step them back one status level — but only for check-in faults, not kill-timer faults.
  if (action === 'approve') {
    const { data: todayCheckins } = await db
      .from('checkins')
      .select('meal_time')
      .eq('player_id', checkin.player_id)
      .eq('meal_date', checkin.meal_date)
      .eq('status', 'approved')

    const windows = new Set(todayCheckins?.map((c) => c.meal_time) ?? [])
    const hasAllThree = windows.has('breakfast') && windows.has('lunch') && windows.has('dinner')

    if (hasAllThree) {
      const { data: player } = await db
        .from('players')
        .select('id, status, name, user_email')
        .eq('id', checkin.player_id)
        .single()

      if (player && (player.status === 'exposed' || player.status === 'wanted')) {
        const oldStatus = player.status as 'exposed' | 'wanted'
        const newStatus = oldStatus === 'wanted' ? 'exposed' : 'active'

        await db.from('players').update({ status: newStatus }).eq('id', checkin.player_id)
        await db.from('status_history').insert({
          entity_type: 'player',
          entity_id: checkin.player_id,
          old_status: oldStatus,
          new_status: newStatus,
          reason: 'Attended all three meals',
          changed_by: session.user.playerId,
        })
        await sendStatusChangeEmail(
          player.user_email,
          player.name,
          oldStatus,
          newStatus,
          'You attended all three meals today — status improved'
        )
      }
    }
  }

  return NextResponse.json({ success: true })
}
