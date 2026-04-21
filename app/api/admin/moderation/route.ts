import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { sendNameRejectedEmail, sendPhotoRejectedEmail } from '@/lib/email'
import { deleteFile, playerPhotoPath } from '@/lib/storage'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') return null
  return session
}

// GET /api/admin/moderation?game_id=xxx — get all pending names
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gameId = req.nextUrl.searchParams.get('game_id')
  const db = createServerClient()

  let teamsQuery = db.from('teams').select('id, name, name_status, name_rejection_reason, captain_player_id').eq('name_status', 'pending')
  let playersQuery = db.from('players').select('id, code_name, code_name_status, code_name_rejection_reason, name, user_email').eq('code_name_status', 'pending').not('code_name', 'is', null)
  let photosQuery = db.from('players').select('id, name, user_email, photo_url, photo_status').eq('photo_status', 'pending').not('photo_url', 'is', null)
  let playerNamesQuery = db.from('players').select('id, name, name_status, name_rejection_reason, user_email').eq('name_status', 'pending')
  if (gameId) {
    teamsQuery = teamsQuery.eq('game_id', gameId)
    playersQuery = playersQuery.eq('game_id', gameId)
    photosQuery = photosQuery.eq('game_id', gameId)
    playerNamesQuery = playerNamesQuery.eq('game_id', gameId)
  }
  const [{ data: teams }, { data: players }, { data: photos }, { data: playerNames }] = await Promise.all([teamsQuery, playersQuery, photosQuery, playerNamesQuery])

  return NextResponse.json({ teams: teams ?? [], players: players ?? [], photos: photos ?? [], playerNames: playerNames ?? [] })
}

// POST /api/admin/moderation — approve or reject a name
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type, id, action, reason } = body
  // type: 'team_name' | 'code_name'
  const db = createServerClient()

  if (type === 'team_name') {
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const { data: team } = await db.from('teams').select('name, captain_player_id').eq('id', id).single()
    await db.from('teams').update({
      name_status: newStatus,
      name_rejection_reason: action === 'reject' ? reason : null,
      ...(action === 'reject' ? { name: '' } : {}),
    }).eq('id', id)

    if (action === 'reject' && team) {
      // Get captain email
      const { data: captain } = await db.from('players').select('user_email, name').eq('id', team.captain_player_id ?? '').single()
      if (captain) {
        await sendNameRejectedEmail(captain.user_email, team.name, 'team name', reason)
      }
    }
    return NextResponse.json({ success: true })
  }

  if (type === 'code_name') {
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const { data: player } = await db.from('players').select('user_email, name, code_name').eq('id', id).single()
    await db.from('players').update({
      code_name_status: newStatus,
      code_name_rejection_reason: action === 'reject' ? reason : null,
      ...(action === 'reject' ? { code_name: null } : {}),
    }).eq('id', id)

    if (action === 'reject' && player) {
      await sendNameRejectedEmail(player.user_email, player.code_name ?? '', 'code name', reason)
    }
    return NextResponse.json({ success: true })
  }

  if (type === 'player_name') {
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const { data: player } = await db.from('players').select('user_email, name').eq('id', id).single()
    await db.from('players').update({
      name_status: newStatus,
      name_rejection_reason: action === 'reject' ? reason : null,
      ...(action === 'reject' ? { name: '' } : {}),
    }).eq('id', id)
    if (action === 'reject' && player) {
      await sendNameRejectedEmail(player.user_email, player.name, 'player name', reason)
    }
    return NextResponse.json({ success: true })
  }

  if (type === 'photo') {
    const { data: player } = await db.from('players').select('user_email, name, photo_url').eq('id', id).single()
    if (action === 'approve') {
      await db.from('players').update({ photo_status: 'approved', photo_rejection_reason: null }).eq('id', id)
    } else {
      if (!reason?.trim()) return NextResponse.json({ error: 'Rejection reason required' }, { status: 400 })
      await db.from('players').update({
        photo_status: 'rejected',
        photo_rejection_reason: reason,
        photo_url: null,
      }).eq('id', id)
      try { await deleteFile(playerPhotoPath(id)) } catch { /* already gone */ }
      if (player) await sendPhotoRejectedEmail(player.user_email, player.name, reason)
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}
