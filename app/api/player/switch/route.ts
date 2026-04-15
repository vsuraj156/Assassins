import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isMultiProfileEmail } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isMultiProfileEmail(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { player_id } = await req.json()
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 })

  // Verify this player actually belongs to this email
  const db = createServerClient()
  const { data: player } = await db
    .from('players')
    .select('id')
    .eq('id', player_id)
    .eq('user_email', session.user.email)
    .single()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const res = NextResponse.json({ success: true })
  res.cookies.set('active_player_id', player_id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
