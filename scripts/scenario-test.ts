/**
 * End-to-end scenario test for the Quincy Assassins game.
 *
 * Runs directly against Supabase (service role) — no HTTP auth mocking needed.
 * Simulates a full game with 10 teams (~40 players) and validates all critical
 * DB invariants: circular target chain, kill cascade, check-in penalties,
 * kill-timer penalties, and team elimination with chain inheritance.
 *
 * Usage:
 *   npx tsx scripts/scenario-test.ts
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET (optional — for cron HTTP tests if dev server is running)
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { buildTargetChain, isKillValid, nextStatusAfterMissedCheckin } from '../lib/game-engine'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    failed++
    failures.push(label)
  }
}

function section(name: string) {
  console.log(`\n── ${name}`)
}

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

const TEAM_NAMES = [
  'Alpha Squad', 'Beta Force', 'Gamma Unit', 'Delta Team',
  'Epsilon Cell', 'Zeta Corps', 'Eta Strike', 'Theta Watch',
  'Iota Guard', 'Kappa Front',
]

const FIRST = ['Alex', 'Blake', 'Casey', 'Dana', 'Ellis', 'Finley', 'Gray', 'Harper', 'Indigo', 'Jordan',
  'Kai', 'Logan', 'Morgan', 'Nova', 'Oakley', 'Parker', 'Quinn', 'Reese', 'Sage', 'Taylor']
const LAST = ['Arrow', 'Blade', 'Cross', 'Drake', 'Edge', 'Frost', 'Ghost', 'Hunt', 'Iron', 'Jade',
  'Knox', 'Lance', 'Morse', 'Nash', 'Orion', 'Pike', 'Rook', 'Stone', 'Thorn', 'Vale']

let nameIdx = 0
function nextName() {
  const name = `${FIRST[nameIdx % FIRST.length]} ${LAST[Math.floor(nameIdx / FIRST.length) % LAST.length]}`
  nameIdx++
  return name
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ---------------------------------------------------------------------------
// Main scenario
// ---------------------------------------------------------------------------

async function run() {
  console.log('🎯  Quincy Assassins — E2E Scenario Test')
  console.log('=========================================\n')

  // -------------------------------------------------------------------------
  section('1. Create test game')
  // -------------------------------------------------------------------------

  const { data: game, error: gameErr } = await db
    .from('games')
    .insert({ name: `[TEST] Scenario ${Date.now()}`, status: 'signup', kill_blackout_hours: 48 })
    .select()
    .single()

  if (gameErr || !game) {
    console.error('❌  Failed to create game:', gameErr?.message)
    process.exit(1)
  }
  assert(game.status === 'signup', 'game created in signup status')
  const GAME_ID = game.id
  console.log(`   game_id = ${GAME_ID}`)

  // -------------------------------------------------------------------------
  section('2. Seed 10 teams with 3–6 players each')
  // -------------------------------------------------------------------------

  const teamIds: string[] = []
  const allPlayerIds: string[] = []
  // Map: teamId → playerIds[]
  const teamPlayers: Record<string, string[]> = {}

  for (const teamName of TEAM_NAMES) {
    const playerCount = 3 + Math.floor(Math.random() * 4)

    const { data: team, error: tErr } = await db
      .from('teams')
      .insert({
        game_id: GAME_ID,
        name: teamName,
        status: 'active',
        points: 0,
        invite_code: generateInviteCode(),
        name_status: 'approved',
      })
      .select()
      .single()

    if (tErr || !team) { console.error(`Failed to create team ${teamName}:`, tErr?.message); continue }

    teamIds.push(team.id)
    teamPlayers[team.id] = []

    let captainId: string | null = null
    for (let i = 0; i < playerCount; i++) {
      const { data: player, error: pErr } = await db
        .from('players')
        .insert({
          game_id: GAME_ID,
          team_id: team.id,
          user_email: `test.scenario.${Date.now()}.${allPlayerIds.length}@test.assassins`,
          name: nextName(),
          role: 'player',
          status: 'active',
          is_double_0: i === 0,
          is_rogue: false,
          code_name_status: 'approved',
        })
        .select()
        .single()

      if (pErr || !player) { console.error('Failed to create player:', pErr?.message); continue }
      allPlayerIds.push(player.id)
      teamPlayers[team.id].push(player.id)
      if (i === 0) captainId = player.id
    }

    if (captainId) await db.from('teams').update({ captain_player_id: captainId }).eq('id', team.id)
  }

  assert(teamIds.length === 10, `seeded ${teamIds.length}/10 teams`)
  assert(allPlayerIds.length >= 30 && allPlayerIds.length <= 60, `seeded ${allPlayerIds.length} players (expected 30–60)`)

  // -------------------------------------------------------------------------
  section('3. Start game — build circular target chain')
  // -------------------------------------------------------------------------

  const chain = buildTargetChain(teamIds)
  for (const [teamId, targetId] of chain) {
    await db.from('teams').update({ target_team_id: targetId }).eq('id', teamId)
  }
  await db.from('games').update({ status: 'active', start_time: new Date().toISOString() }).eq('id', GAME_ID)

  // Verify chain in DB
  const { data: dbTeams } = await db
    .from('teams')
    .select('id, target_team_id')
    .eq('game_id', GAME_ID)
    .eq('status', 'active')

  const dbChain = new Map(dbTeams!.map((t) => [t.id, t.target_team_id]))

  // Walk chain
  let cur = teamIds[0]
  const visited = new Set<string>()
  for (let i = 0; i < teamIds.length; i++) {
    visited.add(cur)
    cur = dbChain.get(cur) as string
  }
  assert(visited.size === teamIds.length, 'target chain visits every team exactly once (circular)')
  assert(cur === teamIds[0], 'target chain returns to starting team (closed loop)')

  // Every team targets someone different from itself
  const noSelfTarget = [...dbChain.entries()].every(([from, to]) => from !== to)
  assert(noSelfTarget, 'no team targets itself')

  // -------------------------------------------------------------------------
  section('4. isKillValid — live game state spot-checks')
  // -------------------------------------------------------------------------

  const [teamA, teamB, teamC] = teamIds
  const assignedTarget = dbChain.get(teamA)!

  // Team A kills its assigned target
  const validKill = isKillValid({
    killerPlayerId: teamPlayers[teamA][0],
    killerTeamId: teamA,
    targetTeamId: assignedTarget,
    targetStatus: 'active',
    assignedTargetTeamId: assignedTarget,
    activeWars: [],
    killerIsDouble0: false,
    targetIsDouble0: false,
    killerIsRogue: false,
    targetIsRogue: false,
    goldenGunActive: false,
  })
  assert(validKill.valid, 'assigned target kill is valid')

  // Team A tries to kill unrelated active team C (not target, no war)
  const unrelatedTarget = teamIds.find((id) => id !== teamA && id !== assignedTarget) ?? teamC
  const invalidKill = isKillValid({
    killerPlayerId: teamPlayers[teamA][0],
    killerTeamId: teamA,
    targetTeamId: unrelatedTarget,
    targetStatus: 'active',
    assignedTargetTeamId: assignedTarget,
    activeWars: [],
    killerIsDouble0: false,
    targetIsDouble0: false,
    killerIsRogue: false,
    targetIsRogue: false,
    goldenGunActive: false,
  })
  assert(!invalidKill.valid, 'kill of unrelated active team is invalid')

  // -------------------------------------------------------------------------
  section('5. Kill approval cascade')
  // -------------------------------------------------------------------------

  // Team A eliminates one player from its assigned target team
  const killerTeamId = teamA
  const targetTeamId = assignedTarget
  const killerPlayerId = teamPlayers[killerTeamId][0]
  const targetPlayerId = teamPlayers[targetTeamId][0]

  // Insert elimination
  const { data: elim, error: elimErr } = await db
    .from('eliminations')
    .insert({
      game_id: GAME_ID,
      killer_id: killerPlayerId,
      target_id: targetPlayerId,
      killer_team_id: killerTeamId,
      target_team_id: targetTeamId,
      is_double_0: false,
      points: 1,
      status: 'pending',
      timestamp: new Date().toISOString(),
    })
    .select()
    .single()

  assert(!elimErr && !!elim, 'elimination record created (pending)')

  // Approve: terminate target + award point + log status history
  const prevStatus = 'active'
  await db.from('players').update({ status: 'terminated' }).eq('id', targetPlayerId)
  await db.from('status_history').insert({
    entity_type: 'player',
    entity_id: targetPlayerId,
    old_status: prevStatus,
    new_status: 'terminated',
    reason: 'Eliminated — scenario test',
    changed_by: null,
  })
  await db.from('teams').update({ points: 1, last_elimination_at: new Date().toISOString() }).eq('id', killerTeamId)
  await db.from('eliminations').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', elim!.id)

  // Verify
  const { data: deadPlayer } = await db.from('players').select('status').eq('id', targetPlayerId).single()
  assert(deadPlayer?.status === 'terminated', 'target player is terminated after kill approval')

  const { data: killerTeam } = await db.from('teams').select('points').eq('id', killerTeamId).single()
  assert(killerTeam?.points === 1, 'killer team awarded 1 point')

  const { data: hist } = await db
    .from('status_history')
    .select('new_status')
    .eq('entity_id', targetPlayerId)
    .eq('new_status', 'terminated')
  assert((hist?.length ?? 0) > 0, 'status_history logged for terminated player')

  // -------------------------------------------------------------------------
  section('6. Full team elimination → target chain inheritance')
  // -------------------------------------------------------------------------

  // Eliminate all remaining players on the target team
  const remaining = teamPlayers[targetTeamId].filter((id) => id !== targetPlayerId)
  for (const pid of remaining) {
    await db.from('players').update({ status: 'terminated' }).eq('id', pid)
    await db.from('status_history').insert({
      entity_type: 'player',
      entity_id: pid,
      old_status: 'active',
      new_status: 'terminated',
      reason: 'Eliminated — scenario test (full team)',
      changed_by: null,
    })
  }

  // Verify no survivors
  const { data: survivors } = await db
    .from('players')
    .select('id')
    .eq('team_id', targetTeamId)
    .not('status', 'eq', 'terminated')
  assert((survivors?.length ?? 0) === 0, 'target team has no survivors')

  // Mark target team eliminated
  await db.from('teams').update({ status: 'eliminated' }).eq('id', targetTeamId)
  await db.from('status_history').insert({
    entity_type: 'team',
    entity_id: targetTeamId,
    old_status: 'active',
    new_status: 'eliminated',
    reason: 'All members eliminated — scenario test',
    changed_by: null,
  })

  // Advance target chain: killer inherits eliminated team's target
  const eliminatedTeamsTarget = dbChain.get(targetTeamId)!
  if (eliminatedTeamsTarget !== killerTeamId) {
    await db.from('teams').update({ target_team_id: eliminatedTeamsTarget }).eq('id', killerTeamId)
  }

  // Verify inheritance
  const { data: updatedKillerTeam } = await db
    .from('teams')
    .select('target_team_id, status')
    .eq('id', killerTeamId)
    .single()

  const expectedNewTarget = eliminatedTeamsTarget === killerTeamId
    ? killerTeamId  // would target itself — game logic skips in this edge case
    : eliminatedTeamsTarget
  assert(
    updatedKillerTeam?.target_team_id === expectedNewTarget,
    `killer team now targets ${expectedNewTarget} (inherited from eliminated team)`
  )

  const { data: eliminatedTeam } = await db.from('teams').select('status').eq('id', targetTeamId).single()
  assert(eliminatedTeam?.status === 'eliminated', 'target team marked eliminated in DB')

  // -------------------------------------------------------------------------
  section('7. Check-in penalty simulation')
  // -------------------------------------------------------------------------

  // Pick a random active player
  const { data: activePlayer } = await db
    .from('players')
    .select('id, status, name, user_email')
    .eq('game_id', GAME_ID)
    .eq('status', 'active')
    .limit(1)
    .single()

  assert(!!activePlayer, 'found an active player to penalize')

  if (activePlayer) {
    const nextStatus = nextStatusAfterMissedCheckin(activePlayer.status)
    assert(nextStatus === 'exposed', 'active player missed check-in → should advance to exposed')

    await db.from('players').update({ status: 'exposed' }).eq('id', activePlayer.id)
    await db.from('status_history').insert({
      entity_type: 'player',
      entity_id: activePlayer.id,
      old_status: 'active',
      new_status: 'exposed',
      reason: 'Missed daily meal check-in — scenario test',
      changed_by: null,
    })

    const { data: penalized } = await db.from('players').select('status').eq('id', activePlayer.id).single()
    assert(penalized?.status === 'exposed', 'player status updated to exposed in DB')

    // Miss again → wanted
    const nextStatus2 = nextStatusAfterMissedCheckin('exposed')
    assert(nextStatus2 === 'wanted', 'exposed player missed check-in → should advance to wanted')

    await db.from('players').update({ status: 'wanted' }).eq('id', activePlayer.id)
    await db.from('status_history').insert({
      entity_type: 'player',
      entity_id: activePlayer.id,
      old_status: 'exposed',
      new_status: 'wanted',
      reason: 'Missed daily meal check-in again — scenario test',
      changed_by: null,
    })

    const { data: wantedPlayer } = await db.from('players').select('status').eq('id', activePlayer.id).single()
    assert(wantedPlayer?.status === 'wanted', 'player status updated to wanted in DB')
  }

  // -------------------------------------------------------------------------
  section('8. Kill-timer penalty simulation')
  // -------------------------------------------------------------------------

  // Find a team that still has active members
  const { data: activeTeams } = await db
    .from('teams')
    .select('id, last_elimination_at, last_kill_penalty_at')
    .eq('game_id', GAME_ID)
    .eq('status', 'active')
    .limit(3)

  const penaltyTeam = activeTeams?.find((t) => t.id !== killerTeamId)
  assert(!!penaltyTeam, 'found a team to apply kill-timer penalty to')

  if (penaltyTeam) {
    const { data: poolPlayers } = await db
      .from('players')
      .select('id, status, name, user_email')
      .eq('team_id', penaltyTeam.id)
      .in('status', ['active', 'exposed', 'wanted'])

    assert((poolPlayers?.length ?? 0) > 0, 'kill-timer penalty team has eligible players')

    if (poolPlayers && poolPlayers.length > 0) {
      const active = poolPlayers.filter((p) => p.status === 'active')
      const victim = active.length > 0 ? active[Math.floor(Math.random() * active.length)] : poolPlayers[0]
      const newStatus = victim.status === 'active' ? 'exposed' : victim.status === 'exposed' ? 'wanted' : 'terminated'

      await db.from('players').update({ status: newStatus }).eq('id', victim.id)
      await db.from('status_history').insert({
        entity_type: 'player',
        entity_id: victim.id,
        old_status: victim.status,
        new_status: newStatus,
        reason: 'Team failed to make a kill within 48 hours — scenario test',
        changed_by: null,
      })
      await db.from('teams').update({ last_kill_penalty_at: new Date().toISOString() }).eq('id', penaltyTeam.id)

      const { data: penalizedVictim } = await db.from('players').select('status').eq('id', victim.id).single()
      assert(penalizedVictim?.status === newStatus, `kill-timer victim advanced from ${victim.status} → ${newStatus}`)
    }
  }

  // -------------------------------------------------------------------------
  section('9. DB invariants — final state validation')
  // -------------------------------------------------------------------------

  // All active teams have a target
  const { data: activeTeamsFinal } = await db
    .from('teams')
    .select('id, target_team_id, status')
    .eq('game_id', GAME_ID)
    .eq('status', 'active')

  const allHaveTarget = activeTeamsFinal?.every((t) => t.target_team_id !== null) ?? false
  assert(allHaveTarget, 'all active teams have a target assigned')

  // No active team targets an eliminated team
  const { data: eliminatedTeamIds } = await db
    .from('teams')
    .select('id')
    .eq('game_id', GAME_ID)
    .eq('status', 'eliminated')
  const eliminatedSet = new Set((eliminatedTeamIds ?? []).map((t) => t.id))
  const noTargetEliminated = activeTeamsFinal?.every((t) => !eliminatedSet.has(t.target_team_id!)) ?? true
  assert(noTargetEliminated, 'no active team is targeting an eliminated team')

  // status_history exists for every terminated player
  const { data: terminatedPlayers } = await db
    .from('players')
    .select('id')
    .eq('game_id', GAME_ID)
    .eq('status', 'terminated')

  let historyOk = true
  for (const tp of terminatedPlayers ?? []) {
    const { data: h } = await db
      .from('status_history')
      .select('id')
      .eq('entity_id', tp.id)
      .eq('new_status', 'terminated')
      .limit(1)
    if (!h || h.length === 0) { historyOk = false; break }
  }
  assert(historyOk, 'every terminated player has a status_history entry')

  // Killer team points match approved kills involving it
  const { data: approvedKills } = await db
    .from('eliminations')
    .select('points')
    .eq('killer_team_id', killerTeamId)
    .eq('status', 'approved')
  const totalPoints = (approvedKills ?? []).reduce((sum, k) => sum + k.points, 0)
  const { data: teamPoints } = await db.from('teams').select('points').eq('id', killerTeamId).single()
  assert(teamPoints?.points === totalPoints, `killer team points (${teamPoints?.points}) match sum of approved kills (${totalPoints})`)

  // -------------------------------------------------------------------------
  section('10. Cleanup — remove all test data')
  // -------------------------------------------------------------------------

  // Delete in dependency order
  await db.from('status_history').delete().eq('entity_id', GAME_ID) // only logs referencing game won't exist; safe no-op
  await db.from('eliminations').delete().eq('game_id', GAME_ID)
  await db.from('checkins').delete().eq('game_id', GAME_ID)
  await db.from('golden_gun_events').delete().eq('game_id', GAME_ID)
  await db.from('status_history').delete().in('entity_id', allPlayerIds)
  await db.from('status_history').delete().in('entity_id', teamIds)

  // Null captain refs before deleting players (circular FK)
  for (const tid of teamIds) {
    await db.from('teams').update({ captain_player_id: null }).eq('id', tid)
  }
  await db.from('players').delete().eq('game_id', GAME_ID)
  await db.from('teams').delete().eq('game_id', GAME_ID)
  await db.from('games').delete().eq('id', GAME_ID)

  // Verify cleanup
  const { data: leftover } = await db.from('games').select('id').eq('id', GAME_ID).maybeSingle()
  assert(!leftover, 'test game removed from DB')

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log('\n=========================================')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('\nFailed assertions:')
    failures.forEach((f) => console.log(`  ✗ ${f}`))
  }
  console.log('=========================================')

  process.exit(failed > 0 ? 1 : 0)
}

run().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
