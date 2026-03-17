import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') return null
  return session
}

// GET /api/admin/wars?game_id=xxx&status=pending
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gameId = req.nextUrl.searchParams.get('game_id')
  const status = req.nextUrl.searchParams.get('status')
  const db = createServerClient()

  let query = db.from('wars').select(`
    *,
    team1:teams!team1_id(id, name),
    team2:teams!team2_id(id, name),
    requested_by:players!requested_by_player_id(id, name, user_email)
  `)
  if (gameId) query = query.eq('game_id', gameId)
  if (status) query = query.eq('status', status)
  const { data, error } = await query.order('approved_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/wars — approve or end war
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { war_id, action } = body
  const db = createServerClient()
  const now = new Date().toISOString()

  if (action === 'approve') {
    const { error } = await db.from('wars').update({ status: 'active', approved_at: now }).eq('id', war_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'end') {
    const { error } = await db.from('wars').update({ status: 'ended', ended_at: now }).eq('id', war_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'reject') {
    const { error } = await db.from('wars').update({ status: 'ended', ended_at: now }).eq('id', war_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
