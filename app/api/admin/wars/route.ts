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

// POST /api/admin/wars — create, approve, end, or reject a war
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { war_id, action } = body
  const db = createServerClient()
  const now = new Date().toISOString()

  if (action === 'create') {
    const { game_id, team1_id, team2_id, reason } = body
    if (!game_id || !team1_id || !team2_id) {
      return NextResponse.json({ error: 'game_id, team1_id, and team2_id are required' }, { status: 400 })
    }
    if (team1_id === team2_id) {
      return NextResponse.json({ error: 'A team cannot declare war on itself' }, { status: 400 })
    }

    // Admin's player record is the requester
    const { data: adminPlayer } = await db
      .from('players')
      .select('id')
      .eq('user_email', session.user.email!)
      .eq('game_id', game_id)
      .single()

    if (!adminPlayer) return NextResponse.json({ error: 'Admin player record not found for this game' }, { status: 404 })

    const { data, error } = await db.from('wars').insert({
      game_id,
      team1_id,
      team2_id,
      status: 'active',
      requested_by_player_id: adminPlayer.id,
      reason: reason || null,
      approved_at: now,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

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
