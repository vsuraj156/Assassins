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
    .select('player_id, meal_date, player:players!player_id(name, user_email)')
    .eq('id', checkin_id)
    .single()

  if (!checkin) return NextResponse.json({ error: 'Check-in not found' }, { status: 404 })

  const now = new Date().toISOString()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  const { error } = await db
    .from('checkins')
    .update({ status: newStatus, reviewed_at: now, reviewed_by: session.user.playerId })
    .eq('id', checkin_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // On rejection: notify the player
  if (action === 'reject') {
    const player = (Array.isArray(checkin.player) ? checkin.player[0] : checkin.player) as { name: string; user_email: string } | null
    if (player) {
      await sendCheckinRejectedEmail(player.user_email, player.name)
    }
  }

  // On approval: check if player now has 3 approved check-ins on this meal_date
  if (action === 'approve') {
    const { count } = await db
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', checkin.player_id)
      .eq('meal_date', checkin.meal_date)
      .eq('status', 'approved')

    if ((count ?? 0) >= 3) {
      const { data: player } = await db
        .from('players')
        .select('id, status, name, user_email')
        .eq('id', checkin.player_id)
        .single()

      if (player?.status === 'exposed') {
        const { data: lastExposure } = await db
          .from('status_history')
          .select('reason')
          .eq('entity_id', checkin.player_id)
          .eq('entity_type', 'player')
          .eq('new_status', 'exposed')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!lastExposure?.reason?.toLowerCase().includes('kill')) {
          await db.from('players').update({ status: 'active' }).eq('id', checkin.player_id)
          await db.from('status_history').insert({
            entity_type: 'player',
            entity_id: checkin.player_id,
            old_status: 'exposed',
            new_status: 'active',
            reason: '3 meal check-ins completed in a single day',
            changed_by: session.user.playerId,
          })
          await sendStatusChangeEmail(
            player.user_email, player.name,
            'exposed', 'active',
            '3 meal check-ins completed — you\'re back to active'
          )
        }
      }
    }
  }

  return NextResponse.json({ success: true })
}
