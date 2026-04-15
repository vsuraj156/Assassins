import { NextResponse } from 'next/server'
import { auth, isMultiProfileEmail } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isMultiProfileEmail(session.user.email)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const db = createServerClient()
  const { data } = await db
    .from('players')
    .select('id, name, status, game_id, team:teams!team_id(name)')
    .eq('user_email', session.user.email)
    .order('created_at', { ascending: true })

  return NextResponse.json(data ?? [])
}
