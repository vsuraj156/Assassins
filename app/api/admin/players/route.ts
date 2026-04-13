import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') return null
  return session
}

// GET /api/admin/players?game_id=xxx
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gameId = req.nextUrl.searchParams.get('game_id')
  const db = createServerClient()

  let query = db.from('players').select('*, team:teams!team_id(id, name, status, points)')
  if (gameId) query = query.eq('game_id', gameId)
  const { data, error } = await query.order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/players — create player
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  const { data, error } = await db
    .from('players')
    .insert({
      game_id: body.game_id,
      team_id: body.team_id ?? null,
      user_email: body.user_email.toLowerCase(),
      name: body.name,
      role: body.role ?? 'player',
      status: 'active',
      is_double_0: body.is_double_0 ?? false,
      code_name: body.code_name ?? null,
      code_name_status: body.code_name ? 'pending' : 'approved',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/admin/players — update player
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { player_id, ...updates } = body
  const db = createServerClient()

  const { data: oldPlayer } = await db.from('players').select('status').eq('id', player_id).single()

  const { data, error } = await db.from('players').update(updates).eq('id', player_id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log status change
  if (updates.status && oldPlayer && updates.status !== oldPlayer.status) {
    await db.from('status_history').insert({
      entity_type: 'player',
      entity_id: player_id,
      old_status: oldPlayer.status,
      new_status: updates.status,
      reason: updates.reason ?? 'Admin override',
      changed_by: session.user.playerId ?? null,
    })
  }

  return NextResponse.json(data)
}

// DELETE /api/admin/players?player_id=xxx
export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = req.nextUrl.searchParams.get('player_id')
  if (!playerId) return NextResponse.json({ error: 'player_id required' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('players').delete().eq('id', playerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
