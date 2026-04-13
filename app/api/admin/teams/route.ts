import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') return null
  return session
}

// GET /api/admin/teams?game_id=xxx
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gameId = req.nextUrl.searchParams.get('game_id')
  const db = createServerClient()

  let query = db.from('teams').select('*, players!team_id(*), target_team:teams!target_team_id(id, name)')
  if (gameId) query = query.eq('game_id', gameId)
  const { data, error } = await query.order('points', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/teams — create team (admin-side)
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  // Generate unique invite code
  let inviteCode: string
  while (true) {
    inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data } = await db.from('teams').select('id').eq('invite_code', inviteCode).single()
    if (!data) break
  }

  const { data, error } = await db
    .from('teams')
    .insert({
      game_id: body.game_id,
      name: body.name,
      invite_code: inviteCode,
      name_status: 'approved', // admin-created teams are pre-approved
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/admin/teams — update team
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { team_id, ...updates } = body
  const db = createServerClient()

  const { data: oldTeam } = await db.from('teams').select('status').eq('id', team_id).single()

  const { data, error } = await db.from('teams').update(updates).eq('id', team_id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log team status change
  if (updates.status && oldTeam && updates.status !== oldTeam.status) {
    await db.from('status_history').insert({
      entity_type: 'team',
      entity_id: team_id,
      old_status: oldTeam.status,
      new_status: updates.status,
      reason: updates.reason ?? 'Admin action',
      changed_by: session.user.playerId ?? null,
    })
  }

  return NextResponse.json(data)
}

// DELETE /api/admin/teams?team_id=xxx
export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const teamId = req.nextUrl.searchParams.get('team_id')
  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('teams').delete().eq('id', teamId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
