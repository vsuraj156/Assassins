import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { getSignedUploadUrl, checkinPhotoPath } from '@/lib/storage'
import { getMealWindow } from '@/lib/game-engine'

// GET — check today's checkin status (all windows)
export async function GET() {
  const session = await auth()
  if (!session?.user?.playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data } = await db
    .from('checkins')
    .select('*')
    .eq('player_id', session.user.playerId)
    .eq('meal_date', today)

  const currentWindow = getMealWindow(new Date())

  return NextResponse.json({ checkins: data ?? [], currentWindow })
}

// POST — get signed upload URL or submit checkin
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date()
  const mealWindow = getMealWindow(now)

  const { data: player } = await db.from('players').select('game_id, status').eq('id', session.user.playerId).single()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (player.status === 'terminated') return NextResponse.json({ error: 'Terminated players cannot submit check-ins' }, { status: 403 })

  if (!mealWindow) {
    return NextResponse.json({ error: 'Check-ins are only accepted during meal times (Breakfast 7:30–11am, Lunch 11:30am–2:30pm, Dinner 5–8pm EDT)' }, { status: 400 })
  }

  // One check-in per meal window per day
  const { data: existing } = await db
    .from('checkins')
    .select('id, status')
    .eq('player_id', session.user.playerId)
    .eq('meal_date', today)
    .eq('meal_time', mealWindow)
    .single()

  if (existing && existing.status !== 'rejected') {
    return NextResponse.json({ error: `Already checked in for ${mealWindow} today` }, { status: 409 })
  }

  if (body.action === 'get_upload_url') {
    const path = checkinPhotoPath(session.user.playerId, `${today}-${mealWindow}`)
    const { signedUrl, token } = await getSignedUploadUrl(path)
    return NextResponse.json({ signedUrl, token, path })
  }

  if (body.action === 'submit') {
    const { photo_url } = body
    if (!photo_url) return NextResponse.json({ error: 'photo_url required' }, { status: 400 })

    const { data, error } = await db
      .from('checkins')
      .upsert({
        game_id: player.game_id,
        player_id: session.user.playerId,
        photo_url,
        meal_date: today,
        meal_time: mealWindow,
        status: 'pending',
        submitted_at: now.toISOString(),
      }, { onConflict: 'player_id,meal_date,meal_time' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
