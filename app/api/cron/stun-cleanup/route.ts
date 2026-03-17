import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'

// Runs at 12:01 AM daily via Vercel Cron
export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const now = new Date().toISOString()

  const { data, error } = await db.from('stuns').delete().lt('expires_at', now).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: data?.length ?? 0 })
}
