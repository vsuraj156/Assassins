import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

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

  let query = db.from('checkins').select('*, player:players(id, name, user_email, team_id, photo_url, team:teams!team_id(id, name))')
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

  const now = new Date().toISOString()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  const { error } = await db
    .from('checkins')
    .update({ status: newStatus, reviewed_at: now, reviewed_by: session.user.playerId })
    .eq('id', checkin_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
