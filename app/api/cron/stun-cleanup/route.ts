import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServerClient } from '@/lib/db'

async function runStunCleanup() {
  const db = createServerClient()
  const now = new Date().toISOString()
  await db.from('stuns').delete().lt('expires_at', now)
}

// Runs at 12:01 AM daily via external scheduler
export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  waitUntil(runStunCleanup())
  return NextResponse.json({ accepted: true }, { status: 202 })
}
