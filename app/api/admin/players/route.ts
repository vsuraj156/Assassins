import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { sendStatusChangeEmail, sendRogueEmail, sendTargetUpdateEmail } from '@/lib/email'

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

  const { data: oldPlayer } = await db.from('players').select('status, name, user_email, is_rogue, team_id').eq('id', player_id).single()

  const { data, error } = await db.from('players').update(updates).eq('id', player_id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log status change and notify player
  if (updates.status && oldPlayer && updates.status !== oldPlayer.status) {
    await db.from('status_history').insert({
      entity_type: 'player',
      entity_id: player_id,
      old_status: oldPlayer.status,
      new_status: updates.status,
      reason: updates.reason ?? 'Admin override',
      changed_by: session.user.playerId ?? null,
    })
    await sendStatusChangeEmail(
      oldPlayer.user_email,
      oldPlayer.name,
      oldPlayer.status,
      updates.status,
      updates.reason ?? 'Admin override'
    )
  }

  // Notify player when going rogue
  if (updates.is_rogue === true && oldPlayer && !oldPlayer.is_rogue) {
    await sendRogueEmail(oldPlayer.user_email, oldPlayer.name)

    // If this player was the last active member of their team, close the target chain.
    // Rogue players are outside the chain — the team effectively dissolves from it.
    if (oldPlayer.team_id) {
      const { data: remaining } = await db
        .from('players')
        .select('id')
        .eq('team_id', oldPlayer.team_id)
        .neq('status', 'terminated')
        .eq('is_rogue', false)
        .neq('id', player_id)

      if (!remaining || remaining.length === 0) {
        const { data: rogueTeam } = await db
          .from('teams')
          .select('name, target_team_id, status')
          .eq('id', oldPlayer.team_id)
          .single()

        const { data: hunterTeam } = await db
          .from('teams')
          .select('id')
          .eq('target_team_id', oldPlayer.team_id)
          .eq('status', 'active')
          .single()

        const newTargetId = rogueTeam?.target_team_id
        if (rogueTeam?.status === 'active' && newTargetId && hunterTeam && newTargetId !== hunterTeam.id) {
          const { data: newTargetTeam } = await db
            .from('teams')
            .select('name, players(name)')
            .eq('id', newTargetId)
            .single()

          // Mark the now-empty team eliminated and close the chain
          await db.from('teams').update({ status: 'eliminated' }).eq('id', oldPlayer.team_id)
          await db.from('status_history').insert({
            entity_type: 'team',
            entity_id: oldPlayer.team_id,
            old_status: 'active',
            new_status: 'eliminated',
            reason: 'Last member went rogue',
            changed_by: session.user.playerId ?? null,
          })

          await db.from('teams').update({ target_team_id: newTargetId }).eq('id', hunterTeam.id)

          const { data: hunterPlayers } = await db
            .from('players')
            .select('name, user_email')
            .eq('team_id', hunterTeam.id)
            .neq('status', 'terminated')

          if (newTargetTeam) {
            const targetPlayerNames = ((newTargetTeam.players ?? []) as { name: string }[]).map((p) => p.name)
            for (const player of hunterPlayers ?? []) {
              if (player.user_email) {
                await sendTargetUpdateEmail(player.user_email, player.name, newTargetTeam.name, targetPlayerNames)
              }
            }
          }
        }
      }
    }
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
