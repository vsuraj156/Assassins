import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { generateInviteCode } from '@/lib/game-engine'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') return null
  return session
}

const TEAM_NAMES = [
  'Shadow Hawks', 'Iron Wolves', 'Ghost Protocol', 'Crimson Tide',
  'Silent Storm', 'Night Vipers', 'Steel Panthers', 'Dark Matter',
  'Phantom Unit', 'Raven Squad', 'Thunder Fist', 'Cold Blooded',
  'Black Lotus', 'Desert Fox', 'Arctic Fox', 'Obsidian Order',
]

const FIRST_NAMES = [
  'Alex', 'Blake', 'Casey', 'Dana', 'Ellis', 'Finley', 'Gray', 'Harper',
  'Indigo', 'Jordan', 'Kai', 'Logan', 'Morgan', 'Nova', 'Oakley', 'Parker',
  'Quinn', 'Reese', 'Sage', 'Taylor', 'Uma', 'Val', 'Winter', 'Xen',
  'Avery', 'River', 'Skyler', 'Jamie', 'Drew', 'Rowan',
]

const LAST_NAMES = [
  'Arrow', 'Blade', 'Cross', 'Drake', 'Edge', 'Frost', 'Ghost', 'Hunt',
  'Iron', 'Jade', 'Knox', 'Lance', 'Morse', 'Nash', 'Orion', 'Pike',
  'Quinn', 'Rook', 'Stone', 'Thorn', 'Vale', 'Wolf', 'Yates', 'Zane',
  'Banks', 'Cole', 'Reed', 'Shaw', 'Vance', 'Wade',
]

function randomName(usedNames: Set<string>): string {
  let name: string
  let attempts = 0
  do {
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]
    name = `${first} ${last}`
    attempts++
  } while (usedNames.has(name) && attempts < 50)
  usedNames.add(name)
  return name
}

// POST /api/admin/seed
// Body: { game_id }
// Creates 10 teams with 3-6 players each, all pre-approved.
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { game_id } = await req.json()
  if (!game_id) return NextResponse.json({ error: 'game_id is required' }, { status: 400 })

  const db = createServerClient()

  const { data: game } = await db.from('games').select('id, status').eq('id', game_id).single()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'signup') return NextResponse.json({ error: 'Game must be in signup status to seed' }, { status: 400 })

  const teamNames = [...TEAM_NAMES].sort(() => Math.random() - 0.5).slice(0, 10)
  const usedNames = new Set<string>()
  const created: { team: string; players: string[] }[] = []

  for (const teamName of teamNames) {
    const playerCount = 3 + Math.floor(Math.random() * 4) // 3–6

    const { data: team, error: teamError } = await db
      .from('teams')
      .insert({
        game_id,
        name: teamName,
        status: 'active',
        points: 0,
        invite_code: generateInviteCode(),
        name_status: 'approved',
      })
      .select()
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: `Failed to create team "${teamName}": ${teamError?.message}` }, { status: 500 })
    }

    const playerNames: string[] = []
    let captainId: string | null = null

    for (let i = 0; i < playerCount; i++) {
      const name = randomName(usedNames)
      const email = `seed.${teamName.toLowerCase().replace(/\s+/g, '-')}.${i + 1}@test.assassins`

      const { data: player, error: playerError } = await db
        .from('players')
        .insert({
          game_id,
          team_id: team.id,
          user_email: email,
          name,
          role: 'player',
          status: 'active',
          is_double_0: i === 0, // first player (captain) is Double-0 by default
          is_rogue: false,
          code_name_status: 'approved',
        })
        .select()
        .single()

      if (playerError || !player) {
        return NextResponse.json({ error: `Failed to create player: ${playerError?.message}` }, { status: 500 })
      }

      if (i === 0) captainId = player.id
      playerNames.push(name)
    }

    if (captainId) {
      await db.from('teams').update({ captain_player_id: captainId }).eq('id', team.id)
    }

    created.push({ team: teamName, players: playerNames })
  }

  return NextResponse.json({ success: true, seeded: created }, { status: 201 })
}

// DELETE /api/admin/seed
// Body: { game_id }
// Removes all seed players/teams (identified by @test.assassins emails).
export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { game_id } = await req.json()
  if (!game_id) return NextResponse.json({ error: 'game_id is required' }, { status: 400 })

  const db = createServerClient()

  // Find seed players first
  const { data: seedPlayers } = await db
    .from('players')
    .select('id, team_id')
    .eq('game_id', game_id)
    .like('user_email', '%@test.assassins')

  if (!seedPlayers?.length) return NextResponse.json({ success: true, deleted: 0 })

  const teamIds = [...new Set(seedPlayers.map((p) => p.team_id).filter(Boolean))]

  // Null out captain references to break the circular FK before deleting players
  for (const teamId of teamIds) {
    await db.from('teams').update({ captain_player_id: null }).eq('id', teamId)
  }

  // Now delete the seed players
  const { data: deleted } = await db
    .from('players')
    .delete()
    .eq('game_id', game_id)
    .like('user_email', '%@test.assassins')
    .select('id')

  // Delete the now-empty teams
  for (const teamId of teamIds) {
    const { data: remaining } = await db.from('players').select('id').eq('team_id', teamId)
    if (!remaining || remaining.length === 0) {
      await db.from('teams').delete().eq('id', teamId)
    }
  }

  return NextResponse.json({ success: true, deleted: deleted?.length ?? 0 })
}
