import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServerClient } from '@/lib/db'

async function runWarsCron() {
  const db = createServerClient()
  const now = new Date().toISOString()

  const { data: games } = await db
    .from('games')
    .select('id')
    .eq('status', 'active')
  if (!games?.length) return

  for (const game of games) {
    await db
      .from('wars')
      .update({ status: 'active', approved_at: now })
      .eq('game_id', game.id)
      .eq('status', 'pending')
  }
}

// Runs at midnight EDT (04:00 UTC) via external scheduler
export async function GET(req: NextRequest) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  waitUntil(runWarsCron())
  return NextResponse.json({ accepted: true }, { status: 202 })
}
