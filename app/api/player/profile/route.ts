import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { getSignedUploadUrl, playerPhotoPath } from '@/lib/storage'

// POST — get signed upload URL or save profile photo
// Accepts optional player_id in body for the fresh-signup case where session
// doesn't have playerId yet. Validates session email matches that player.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  // Resolve player ID: prefer session (established player) over body (fresh signup)
  let playerId = session.user.playerId
  if (!playerId && body.player_id) {
    const { data: player } = await db
      .from('players')
      .select('id, user_email')
      .eq('id', body.player_id)
      .single()
    if (!player || player.user_email !== session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    playerId = player.id
  }

  if (!playerId) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  if (body.action === 'get_upload_url') {
    const path = playerPhotoPath(playerId)
    const { signedUrl } = await getSignedUploadUrl(path)
    return NextResponse.json({ signedUrl, path })
  }

  if (body.action === 'save') {
    const { photo_url } = body
    if (!photo_url) return NextResponse.json({ error: 'photo_url required' }, { status: 400 })

    const { error } = await db
      .from('players')
      .update({ photo_url })
      .eq('id', playerId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
