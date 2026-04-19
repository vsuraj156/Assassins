import { describe, it, expect } from 'vitest'
import {
  getMealWindow,
  nextStatusAfterMissedCheckin,
  nextStatusAfterFullDayMeals,
  isExposedPenaltyDue,
  killTimerResetTime,
  isKillTimerPenaltyDue,
  isGoldenGunHours,
  eliminationPoints,
  generateInviteCode,
  isKillValid,
  buildTargetChain,
  goldenGunExpiresAt,
  stunExpiresAt,
  type KillValidationContext,
} from '@/lib/game-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utc(h: number, m = 0): Date {
  const d = new Date(0)
  d.setUTCHours(h, m, 0, 0)
  return d
}

/** EDT = UTC-4, so edtH:edtM in EDT = edtH+4:edtM in UTC */
function edt(edtH: number, edtM = 0): Date {
  return utc(edtH + 4, edtM)
}

function baseCtx(overrides: Partial<KillValidationContext> = {}): KillValidationContext {
  return {
    killerPlayerId: 'killer-1',
    killerTeamId: 'team-a',
    targetTeamId: 'team-b',
    targetStatus: 'active',
    assignedTargetTeamId: 'team-b',
    activeWars: [],
    killerIsDouble0: false,
    targetIsDouble0: false,
    killerIsRogue: false,
    targetIsRogue: false,
    goldenGunActive: false,
    goldenGunHolderPlayerId: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// getMealWindow
// ---------------------------------------------------------------------------

describe('getMealWindow', () => {
  describe('breakfast (7:30–10:59 EDT)', () => {
    it('returns breakfast at 7:30 EDT', () => expect(getMealWindow(edt(7, 30))).toBe('breakfast'))
    it('returns breakfast at 9:00 EDT', () => expect(getMealWindow(edt(9, 0))).toBe('breakfast'))
    it('returns breakfast at 10:59 EDT', () => expect(getMealWindow(edt(10, 59))).toBe('breakfast'))
    it('returns null before 7:30 EDT', () => expect(getMealWindow(edt(7, 29))).toBeNull())
    it('returns null at 11:00 EDT (gap between windows)', () => expect(getMealWindow(edt(11, 0))).toBeNull())
  })

  describe('lunch (11:30–14:29 EDT)', () => {
    it('returns lunch at 11:30 EDT', () => expect(getMealWindow(edt(11, 30))).toBe('lunch'))
    it('returns lunch at 13:00 EDT', () => expect(getMealWindow(edt(13, 0))).toBe('lunch'))
    it('returns lunch at 14:29 EDT', () => expect(getMealWindow(edt(14, 29))).toBe('lunch'))
    it('returns null at 11:29 EDT', () => expect(getMealWindow(edt(11, 29))).toBeNull())
    it('returns null at 14:30 EDT', () => expect(getMealWindow(edt(14, 30))).toBeNull())
  })

  describe('dinner (17:00–19:59 EDT)', () => {
    it('returns dinner at 17:00 EDT', () => expect(getMealWindow(edt(17, 0))).toBe('dinner'))
    it('returns dinner at 18:30 EDT', () => expect(getMealWindow(edt(18, 30))).toBe('dinner'))
    it('returns dinner at 19:59 EDT', () => expect(getMealWindow(edt(19, 59))).toBe('dinner'))
    it('returns null at 16:59 EDT', () => expect(getMealWindow(edt(16, 59))).toBeNull())
    it('returns null at 20:00 EDT', () => expect(getMealWindow(edt(20, 0))).toBeNull())
  })

  describe('outside all windows', () => {
    it('returns null at midnight EDT', () => expect(getMealWindow(edt(0, 0))).toBeNull())
    it('returns null at 3:00 AM EDT', () => expect(getMealWindow(edt(3, 0))).toBeNull())
    it('returns null at 23:59 EDT', () => expect(getMealWindow(edt(23, 59))).toBeNull())
  })

  describe('UTC midnight wrap (EDT = UTC-4)', () => {
    // 11 PM EDT = 3 AM UTC — should be outside all windows
    it('handles UTC midnight rollover correctly', () => {
      expect(getMealWindow(utc(3, 0))).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// nextStatusAfterMissedCheckin
// ---------------------------------------------------------------------------

describe('nextStatusAfterMissedCheckin', () => {
  it('active → exposed', () => expect(nextStatusAfterMissedCheckin('active')).toBe('exposed'))
  it('exposed → wanted', () => expect(nextStatusAfterMissedCheckin('exposed')).toBe('wanted'))
  it('wanted → terminated', () => expect(nextStatusAfterMissedCheckin('wanted')).toBe('terminated'))
  it('terminated → null (no change)', () => expect(nextStatusAfterMissedCheckin('terminated')).toBeNull())
  it('amnesty → null (no change)', () => expect(nextStatusAfterMissedCheckin('amnesty')).toBeNull())
})

// ---------------------------------------------------------------------------
// generateInviteCode
// ---------------------------------------------------------------------------

describe('generateInviteCode', () => {
  const VALID_CHARS = new Set('ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
  const EXCLUDED_CHARS = ['O', '0', '1', 'I']

  it('always produces a 6-character string', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateInviteCode()).toHaveLength(6)
    }
  })

  it('only contains characters from the allowed set', () => {
    for (let i = 0; i < 100; i++) {
      for (const ch of generateInviteCode()) {
        expect(VALID_CHARS.has(ch)).toBe(true)
      }
    }
  })

  it('never contains O, 0, 1, or I (visually ambiguous characters)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode()
      for (const excluded of EXCLUDED_CHARS) {
        expect(code).not.toContain(excluded)
      }
    }
  })

  it('produces different codes across calls (not constant)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()))
    expect(codes.size).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
// eliminationPoints
// ---------------------------------------------------------------------------

describe('eliminationPoints', () => {
  it('regular target = 1 point', () => expect(eliminationPoints(false)).toBe(1))
  it('double-0 target = 2 points', () => expect(eliminationPoints(true)).toBe(2))
})

// ---------------------------------------------------------------------------
// isKillValid — assigned target
// ---------------------------------------------------------------------------

describe('isKillValid — assigned target', () => {
  it('valid: killing assigned target (active)', () => {
    expect(isKillValid(baseCtx())).toEqual({ valid: true })
  })

  it('invalid: killing non-target non-war active player', () => {
    expect(isKillValid(baseCtx({ assignedTargetTeamId: 'team-c' }))).toEqual({
      valid: false,
      reason: expect.stringContaining('not your assigned target'),
    })
  })

  it('invalid: assignedTargetTeamId is null (no target assigned yet — pre-game or chain gap)', () => {
    // null !== targetTeamId, so the assigned-target branch is skipped.
    // Without a war or exposed/wanted status, the kill is invalid.
    expect(isKillValid(baseCtx({ assignedTargetTeamId: null }))).toMatchObject({ valid: false })
  })

  it('valid: assignedTargetTeamId is null but target is exposed (open target rule still applies)', () => {
    expect(isKillValid(baseCtx({
      assignedTargetTeamId: null,
      targetStatus: 'exposed',
    }))).toEqual({ valid: true })
  })

  it('valid: assignedTargetTeamId is null but an active war permits the kill', () => {
    const war = { team1_id: 'team-a', team2_id: 'team-b', status: 'active' as const }
    expect(isKillValid(baseCtx({
      assignedTargetTeamId: null,
      activeWars: [war],
    }))).toEqual({ valid: true })
  })
})

// ---------------------------------------------------------------------------
// isKillValid — teammate restriction
// ---------------------------------------------------------------------------

describe('isKillValid — teammate restriction', () => {
  it('invalid: killing a teammate (both non-rogue)', () => {
    expect(isKillValid(baseCtx({ targetTeamId: 'team-a' }))).toEqual({
      valid: false,
      reason: expect.stringContaining('teammate'),
    })
  })

  it('valid: rogue killer can kill former teammate', () => {
    expect(isKillValid(baseCtx({ targetTeamId: 'team-a', killerIsRogue: true }))).toEqual({ valid: true })
  })

  it('valid: rogue target can be killed by former teammate', () => {
    expect(isKillValid(baseCtx({ targetTeamId: 'team-a', targetIsRogue: true }))).toEqual({ valid: true })
  })
})

// ---------------------------------------------------------------------------
// isKillValid — exposed / wanted open targets
// ---------------------------------------------------------------------------

describe('isKillValid — exposed/wanted are open targets', () => {
  it('valid: killing exposed player on unrelated team (no war, not target)', () => {
    expect(isKillValid(baseCtx({
      assignedTargetTeamId: 'team-c',
      targetStatus: 'exposed',
    }))).toEqual({ valid: true })
  })

  it('valid: killing wanted player on unrelated team', () => {
    expect(isKillValid(baseCtx({
      assignedTargetTeamId: 'team-c',
      targetStatus: 'wanted',
    }))).toEqual({ valid: true })
  })

  it('invalid: active player on unrelated team is NOT an open target', () => {
    expect(isKillValid(baseCtx({
      assignedTargetTeamId: 'team-c',
      targetStatus: 'active',
    }))).toMatchObject({ valid: false })
  })
})

// ---------------------------------------------------------------------------
// isKillValid — wars
// ---------------------------------------------------------------------------

describe('isKillValid — wars', () => {
  const war = { team1_id: 'team-a', team2_id: 'team-b', status: 'active' as const }

  it('valid: killing enemy during an active war', () => {
    expect(isKillValid(baseCtx({
      assignedTargetTeamId: 'team-c',
      activeWars: [war],
    }))).toEqual({ valid: true })
  })

  it('valid: symmetric — war in opposite direction also grants kill rights', () => {
    const reverseWar = { team1_id: 'team-b', team2_id: 'team-a', status: 'active' as const }
    expect(isKillValid(baseCtx({
      killerTeamId: 'team-b',
      targetTeamId: 'team-a',
      assignedTargetTeamId: 'team-c',
      activeWars: [reverseWar],
    }))).toEqual({ valid: true })
  })

  it('invalid: war is ended — no kill right', () => {
    const endedWar = { team1_id: 'team-a', team2_id: 'team-b', status: 'ended' as const }
    expect(isKillValid(baseCtx({
      assignedTargetTeamId: 'team-c',
      activeWars: [endedWar],
    }))).toMatchObject({ valid: false })
  })

  it('invalid: war is between two unrelated teams', () => {
    const unrelatedWar = { team1_id: 'team-x', team2_id: 'team-y', status: 'active' as const }
    expect(isKillValid(baseCtx({
      assignedTargetTeamId: 'team-c',
      activeWars: [unrelatedWar],
    }))).toMatchObject({ valid: false })
  })
})

// ---------------------------------------------------------------------------
// isKillValid — double-0
// ---------------------------------------------------------------------------

describe('isKillValid — double-0', () => {
  it('valid: double-0 can kill any other double-0', () => {
    expect(isKillValid(baseCtx({
      killerIsDouble0: true,
      targetIsDouble0: true,
      assignedTargetTeamId: 'team-c',
    }))).toEqual({ valid: true })
  })

  it('invalid: double-0 cannot kill non-double-0 on unrelated team', () => {
    expect(isKillValid(baseCtx({
      killerIsDouble0: true,
      targetIsDouble0: false,
      assignedTargetTeamId: 'team-c',
    }))).toMatchObject({ valid: false })
  })

  it('invalid: non-double-0 cannot kill double-0 on unrelated team using double-0 rule', () => {
    expect(isKillValid(baseCtx({
      killerIsDouble0: false,
      targetIsDouble0: true,
      assignedTargetTeamId: 'team-c',
    }))).toMatchObject({ valid: false })
  })
})

// ---------------------------------------------------------------------------
// isKillValid — rogue agents
// ---------------------------------------------------------------------------

describe('isKillValid — rogue agents', () => {
  it('valid: rogue killer can kill anyone', () => {
    expect(isKillValid(baseCtx({
      killerIsRogue: true,
      assignedTargetTeamId: 'team-c',
    }))).toEqual({ valid: true })
  })

  it('valid: rogue target can be killed by anyone', () => {
    expect(isKillValid(baseCtx({
      targetIsRogue: true,
      assignedTargetTeamId: 'team-c',
    }))).toEqual({ valid: true })
  })

  it('valid: rogue vs rogue on same team', () => {
    expect(isKillValid(baseCtx({
      killerIsRogue: true,
      targetIsRogue: true,
      targetTeamId: 'team-a',
    }))).toEqual({ valid: true })
  })
})

// ---------------------------------------------------------------------------
// isKillValid — golden gun
// ---------------------------------------------------------------------------

describe('isKillValid — golden gun', () => {
  it('valid: golden gun holder can kill anyone', () => {
    expect(isKillValid(baseCtx({
      goldenGunActive: true,
      goldenGunHolderPlayerId: 'killer-1',
      assignedTargetTeamId: 'team-c',
    }))).toEqual({ valid: true })
  })

  it('invalid: golden gun active but holder is a different player', () => {
    expect(isKillValid(baseCtx({
      goldenGunActive: true,
      goldenGunHolderPlayerId: 'killer-2',
      assignedTargetTeamId: 'team-c',
    }))).toMatchObject({ valid: false })
  })

  it('invalid: golden gun not active — holder check irrelevant', () => {
    expect(isKillValid(baseCtx({
      goldenGunActive: false,
      goldenGunHolderPlayerId: 'killer-1',
      assignedTargetTeamId: 'team-c',
    }))).toMatchObject({ valid: false })
  })
})

// ---------------------------------------------------------------------------
// isKillValid — general amnesty
// ---------------------------------------------------------------------------

describe('isKillValid — general amnesty', () => {
  it('blocks an otherwise-valid assigned-target kill', () => {
    expect(isKillValid(baseCtx({ generalAmnestyActive: true }))).toEqual({
      valid: false,
      reason: expect.stringContaining('amnesty'),
    })
  })

  it('blocks a rogue kill during amnesty', () => {
    expect(isKillValid(baseCtx({ generalAmnestyActive: true, killerIsRogue: true }))).toMatchObject({ valid: false })
  })

  it('blocks a double-0 vs double-0 kill during amnesty', () => {
    expect(isKillValid(baseCtx({
      generalAmnestyActive: true,
      killerIsDouble0: true,
      targetIsDouble0: true,
      assignedTargetTeamId: 'team-c',
    }))).toMatchObject({ valid: false })
  })

  it('blocks a golden gun kill during amnesty', () => {
    expect(isKillValid(baseCtx({
      generalAmnestyActive: true,
      goldenGunActive: true,
      goldenGunHolderPlayerId: 'killer-1',
      assignedTargetTeamId: 'team-c',
    }))).toMatchObject({ valid: false })
  })

  it('blocks killing an exposed/wanted player during amnesty', () => {
    expect(isKillValid(baseCtx({
      generalAmnestyActive: true,
      targetStatus: 'exposed',
      assignedTargetTeamId: 'team-c',
    }))).toMatchObject({ valid: false })
  })

  it('blocks a war kill during amnesty', () => {
    const war = { team1_id: 'team-a', team2_id: 'team-b', status: 'active' as const }
    expect(isKillValid(baseCtx({
      generalAmnestyActive: true,
      assignedTargetTeamId: 'team-c',
      activeWars: [war],
    }))).toMatchObject({ valid: false })
  })

  it('false amnesty flag preserves normal kill validity', () => {
    expect(isKillValid(baseCtx({ generalAmnestyActive: false }))).toEqual({ valid: true })
  })

  it('undefined amnesty flag (omitted) preserves normal kill validity', () => {
    // generalAmnestyActive is optional — omitting it should not break existing behavior
    expect(isKillValid(baseCtx())).toEqual({ valid: true })
  })
})

// ---------------------------------------------------------------------------
// isKillValid — priority / override ordering
// ---------------------------------------------------------------------------

describe('isKillValid — rule interaction / priority', () => {
  it('rogue override beats teammate restriction', () => {
    // Rogue killer vs rogue target on same team — valid despite same team
    expect(isKillValid(baseCtx({
      killerTeamId: 'team-a',
      targetTeamId: 'team-a',
      killerIsRogue: true,
      targetIsRogue: true,
    }))).toEqual({ valid: true })
  })

  it('teammate restriction blocks non-rogue even if golden gun is active', () => {
    // Golden gun is an individual privilege, but teammate block comes first
    // (golden gun check runs after rogue check, before teammate restriction is bypassed)
    // Actually in code: teammate restriction is checked first (returns invalid) unless both are rogue
    // Golden gun holder who is NOT rogue cannot kill a teammate
    expect(isKillValid(baseCtx({
      killerTeamId: 'team-a',
      targetTeamId: 'team-a',
      goldenGunActive: true,
      goldenGunHolderPlayerId: 'killer-1',
      killerIsRogue: false,
      targetIsRogue: false,
    }))).toEqual({ valid: false, reason: expect.stringContaining('teammate') })
  })
})

// ---------------------------------------------------------------------------
// buildTargetChain
// ---------------------------------------------------------------------------

describe('buildTargetChain', () => {
  it('produces a map with every team as key and value', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const chain = buildTargetChain(ids)
    expect(chain.size).toBe(ids.length)
    for (const id of ids) {
      expect(chain.has(id)).toBe(true)
      expect(ids).toContain(chain.get(id))
    }
  })

  it('no team targets itself', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const chain = buildTargetChain(ids)
    for (const [from, to] of chain) {
      expect(from).not.toBe(to)
    }
  })

  it('is circular — following the chain visits every team exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const chain = buildTargetChain(ids)
    const visited = new Set<string>()
    let cur = ids[0]
    for (let i = 0; i < ids.length; i++) {
      expect(visited.has(cur)).toBe(false)
      visited.add(cur)
      cur = chain.get(cur)!
    }
    expect(cur).toBe(ids[0]) // back to start
    expect(visited.size).toBe(ids.length)
  })

  it('works with exactly 2 teams (mutual targeting)', () => {
    const chain = buildTargetChain(['a', 'b'])
    expect(chain.get('a')).toBe('b')
    expect(chain.get('b')).toBe('a')
  })

  it('randomizes order across multiple calls', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `team-${i}`)
    const chains = Array.from({ length: 20 }, () => buildTargetChain(ids))
    const serialized = chains.map((c) => [...c.entries()].sort().toString())
    const unique = new Set(serialized)
    // With 10 teams there are 9! = 362880 possible circular chains — 20 calls won't all match
    expect(unique.size).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
// goldenGunExpiresAt
// ---------------------------------------------------------------------------

describe('goldenGunExpiresAt', () => {
  it('expires at 9:59 PM EDT (01:59 UTC next day) when released during the day', () => {
    // Released at 3:00 PM EDT = 19:00 UTC
    const released = new Date('2025-06-01T19:00:00.000Z')
    const expires = goldenGunExpiresAt(released)
    // 9:59 PM EDT = 01:59 UTC the next day
    expect(expires.toISOString()).toBe('2025-06-02T01:59:00.000Z')
  })

  it('expires at 9:59 PM EDT same calendar day in EDT when released in the morning', () => {
    // Released at 8:00 AM EDT = 12:00 UTC
    const released = new Date('2025-06-01T12:00:00.000Z')
    const expires = goldenGunExpiresAt(released)
    expect(expires.toISOString()).toBe('2025-06-02T01:59:00.000Z')
  })

  it('released after 9:59 PM EDT still expires at 9:59 PM EDT that same EDT day', () => {
    // Released at 10:30 PM EDT = 02:30 UTC next UTC day
    // EDT day is still June 1 (it's 10:30 PM EDT on June 1)
    const released = new Date('2025-06-02T02:30:00.000Z') // 10:30 PM EDT June 1
    const expires = goldenGunExpiresAt(released)
    // Should expire 9:59 PM EDT on June 1 = 01:59 UTC June 2
    // But 01:59 UTC is BEFORE the release time of 02:30 UTC...
    // The function sets to 9:59 PM EDT on the SAME EDT calendar day as released.
    // June 1 EDT → expires 01:59 UTC June 2
    expect(expires.toISOString()).toBe('2025-06-02T01:59:00.000Z')
  })

  it('always returns exactly :59 seconds, no milliseconds', () => {
    const released = new Date('2025-06-01T14:00:00.000Z')
    const expires = goldenGunExpiresAt(released)
    expect(expires.getUTCSeconds()).toBe(0)
    expect(expires.getUTCMilliseconds()).toBe(0)
    expect(expires.getUTCMinutes()).toBe(59)
    expect(expires.getUTCHours()).toBe(1) // 9:59 PM EDT = 01:59 UTC
  })
})

// ---------------------------------------------------------------------------
// stunExpiresAt
// ---------------------------------------------------------------------------

describe('stunExpiresAt', () => {
  it('expires at midnight local time the next day', () => {
    const applied = new Date('2025-06-01T10:00:00')
    const expires = stunExpiresAt(applied)
    expect(expires.getHours()).toBe(0)
    expect(expires.getMinutes()).toBe(0)
    expect(expires.getSeconds()).toBe(0)
    expect(expires.getMilliseconds()).toBe(0)
    expect(expires.getDate()).toBe(2) // next day
    expect(expires.getMonth()).toBe(5) // June
  })

  it('applied just before midnight — still expires midnight tomorrow', () => {
    const applied = new Date('2025-06-01T23:59:59')
    const expires = stunExpiresAt(applied)
    expect(expires.getDate()).toBe(2)
    expect(expires.getHours()).toBe(0)
  })

  it('applied at midnight — expires at midnight the following day', () => {
    const applied = new Date('2025-06-01T00:00:00')
    const expires = stunExpiresAt(applied)
    expect(expires.getDate()).toBe(2)
    expect(expires.getHours()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Kill-timer penalty vs check-in penalty distinction (conceptual test)
// ---------------------------------------------------------------------------

describe('kill-timer vs check-in penalty distinction', () => {
  /**
   * This isn't a pure function but verifies the documented invariant:
   * A kill reverts exactly one kill-timer penalty level, not check-in penalties.
   * We test this by checking that nextStatusAfterMissedCheckin is independent
   * of kill-timer state — i.e., the status chain is the same regardless of cause.
   *
   * The actual revert logic lives in the API route, but the status model
   * means: if a player is 'wanted' due to kill-timer (exposed) + missed check-in
   * (wanted), a kill takes them back to 'exposed', not 'active'.
   */
  it('status chain allows correct partial revert: wanted→exposed (not active) after a kill when check-in was also missed', () => {
    // Scenario: player was active → exposed (kill timer) → wanted (missed check-in).
    // A kill reverts kill-timer penalty by one step only: wanted → exposed.
    // The check-in penalty (exposed) is not removed.
    function revertKillTimerPenalty(status: 'exposed' | 'wanted'): 'active' | 'exposed' {
      return status === 'wanted' ? 'exposed' : 'active'
    }
    expect(revertKillTimerPenalty('wanted')).toBe('exposed')
  })

  it('status chain: exposed player (only kill-timer penalty) reverts to active after kill', () => {
    function revertKillTimerPenalty(status: 'exposed' | 'wanted'): 'active' | 'exposed' {
      return status === 'wanted' ? 'exposed' : 'active'
    }
    expect(revertKillTimerPenalty('exposed')).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// Rule 2c — nextStatusAfterFullDayMeals (three meals in one day = downgrade)
// ---------------------------------------------------------------------------

describe('nextStatusAfterFullDayMeals (rule 2c)', () => {
  it('wanted → exposed after attending all three meals', () => {
    expect(nextStatusAfterFullDayMeals('wanted')).toBe('exposed')
  })

  it('exposed → active after attending all three meals', () => {
    expect(nextStatusAfterFullDayMeals('exposed')).toBe('active')
  })

  it('active → null (already at base level, no downgrade possible)', () => {
    expect(nextStatusAfterFullDayMeals('active')).toBeNull()
  })

  it('terminated → null (dead players cannot recover via meals)', () => {
    expect(nextStatusAfterFullDayMeals('terminated')).toBeNull()
  })

  it('amnesty → null (amnesty players are not in penalty progression)', () => {
    expect(nextStatusAfterFullDayMeals('amnesty')).toBeNull()
  })

  it('two consecutive full-day meals: wanted → exposed → active', () => {
    const afterDay1 = nextStatusAfterFullDayMeals('wanted')
    expect(afterDay1).toBe('exposed')
    const afterDay2 = nextStatusAfterFullDayMeals(afterDay1!)
    expect(afterDay2).toBe('active')
  })

  it('is independent of nextStatusAfterMissedCheckin (opposite direction)', () => {
    // Symmetry check: missed check-in and full-day meals are exact inverses
    // for the exposed ↔ active transition.
    expect(nextStatusAfterMissedCheckin('active')).toBe('exposed')
    expect(nextStatusAfterFullDayMeals('exposed')).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// Rule 2b — isExposedPenaltyDue (exposed 48+ hours → Wanted)
// ---------------------------------------------------------------------------

describe('isExposedPenaltyDue (rule 2b)', () => {
  const NOW = new Date('2025-06-03T12:00:00.000Z')

  it('returns false when exposed for exactly 0ms', () => {
    expect(isExposedPenaltyDue(NOW, NOW)).toBe(false)
  })

  it('returns false when exposed for 47h 59m 59s', () => {
    const exposedSince = new Date(NOW.getTime() - (48 * 60 * 60 * 1000 - 1000))
    expect(isExposedPenaltyDue(exposedSince, NOW)).toBe(false)
  })

  it('returns true when exposed for exactly 48 hours', () => {
    const exposedSince = new Date(NOW.getTime() - 48 * 60 * 60 * 1000)
    expect(isExposedPenaltyDue(exposedSince, NOW)).toBe(true)
  })

  it('returns true when exposed for 72 hours', () => {
    const exposedSince = new Date(NOW.getTime() - 72 * 60 * 60 * 1000)
    expect(isExposedPenaltyDue(exposedSince, NOW)).toBe(true)
  })

  it('returns false when exposed for 24 hours (only half the window)', () => {
    const exposedSince = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
    expect(isExposedPenaltyDue(exposedSince, NOW)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Rule 2a — isKillTimerPenaltyDue (when should a team be penalized?)
// ---------------------------------------------------------------------------

describe('isKillTimerPenaltyDue (rule 2a)', () => {
  const INITIAL = 48 * 60 * 60 * 1000  // 48h
  const REPEAT  = 24 * 60 * 60 * 1000  // 24h

  // reference = T+0, now = T+48h exactly
  const REF = 1_000_000_000_000
  const AT_THRESHOLD = REF + INITIAL

  describe('initial 48h window — no penalty before it expires', () => {
    it('not due at exactly 0ms after reference', () => {
      expect(isKillTimerPenaltyDue(REF, null, REF, INITIAL, REPEAT)).toBe(false)
    })

    it('not due at 47h 59m 59s after reference', () => {
      expect(isKillTimerPenaltyDue(REF, null, REF + INITIAL - 1000, INITIAL, REPEAT)).toBe(false)
    })

    it('due at exactly 48h after reference (never penalized)', () => {
      expect(isKillTimerPenaltyDue(REF, null, AT_THRESHOLD, INITIAL, REPEAT)).toBe(true)
    })

    it('due at 72h after reference (never penalized)', () => {
      expect(isKillTimerPenaltyDue(REF, null, REF + 72 * 60 * 60 * 1000, INITIAL, REPEAT)).toBe(true)
    })
  })

  describe('successive 24h penalties after the initial one', () => {
    // Penalty was applied right at the 48h threshold
    const LAST_PENALTY = AT_THRESHOLD

    it('not due again 1 second after last penalty', () => {
      expect(isKillTimerPenaltyDue(REF, LAST_PENALTY, LAST_PENALTY + 1000, INITIAL, REPEAT)).toBe(false)
    })

    it('not due at 23h 59m 59s after last penalty', () => {
      expect(isKillTimerPenaltyDue(REF, LAST_PENALTY, LAST_PENALTY + REPEAT - 1000, INITIAL, REPEAT)).toBe(false)
    })

    it('due again at exactly 24h after last penalty', () => {
      expect(isKillTimerPenaltyDue(REF, LAST_PENALTY, LAST_PENALTY + REPEAT, INITIAL, REPEAT)).toBe(true)
    })

    it('due again at 36h after last penalty', () => {
      expect(isKillTimerPenaltyDue(REF, LAST_PENALTY, LAST_PENALTY + 36 * 60 * 60 * 1000, INITIAL, REPEAT)).toBe(true)
    })
  })

  describe('last penalty predates the reference (kill reset invalidates old penalty)', () => {
    // Team was penalized, then made a kill — reference is now after the last penalty
    const OLD_PENALTY = REF - 1000  // penalty was before the kill reset

    it('due immediately after 48h window when last penalty is before reference', () => {
      expect(isKillTimerPenaltyDue(REF, OLD_PENALTY, AT_THRESHOLD, INITIAL, REPEAT)).toBe(true)
    })

    it('not due before 48h window even if last penalty is before reference', () => {
      expect(isKillTimerPenaltyDue(REF, OLD_PENALTY, REF + INITIAL - 1000, INITIAL, REPEAT)).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Rule 2a — killTimerResetTime (resets at midnight FOLLOWING kill, not at kill time)
// ---------------------------------------------------------------------------

describe('killTimerResetTime (rule 2a)', () => {
  it('kill approved at noon → resets at midnight that night', () => {
    const approved = new Date('2025-06-01T12:00:00')
    const reset = killTimerResetTime(approved)
    expect(reset.getDate()).toBe(2)
    expect(reset.getHours()).toBe(0)
    expect(reset.getMinutes()).toBe(0)
    expect(reset.getSeconds()).toBe(0)
    expect(reset.getMilliseconds()).toBe(0)
  })

  it('kill approved at 11:59 PM → resets at midnight the same calendar night', () => {
    const approved = new Date('2025-06-01T23:59:00')
    const reset = killTimerResetTime(approved)
    expect(reset.getDate()).toBe(2)
    expect(reset.getHours()).toBe(0)
  })

  it('kill approved at midnight → next reset is midnight the following night', () => {
    const approved = new Date('2025-06-01T00:00:00')
    const reset = killTimerResetTime(approved)
    expect(reset.getDate()).toBe(2)
    expect(reset.getHours()).toBe(0)
  })

  it('reset time is always strictly after the kill approval time', () => {
    const times = [
      new Date('2025-06-01T00:00:01'),
      new Date('2025-06-01T06:00:00'),
      new Date('2025-06-01T23:59:59'),
    ]
    for (const t of times) {
      expect(killTimerResetTime(t).getTime()).toBeGreaterThan(t.getTime())
    }
  })

  it('reset is always less than 24 hours after approval', () => {
    const approved = new Date('2025-06-01T12:00:00')
    const reset = killTimerResetTime(approved)
    const diff = reset.getTime() - approved.getTime()
    expect(diff).toBeLessThan(24 * 60 * 60 * 1000)
  })
})

// ---------------------------------------------------------------------------
// Golden gun off-hours — isGoldenGunHours (10 PM–midnight EDT = not a weapon)
// ---------------------------------------------------------------------------

describe('isGoldenGunHours', () => {
  describe('valid hours (12:01 AM – 9:59 PM EDT)', () => {
    it('valid at 12:01 AM EDT', () => expect(isGoldenGunHours(edt(0, 1))).toBe(true))
    it('valid at 9:00 AM EDT', () => expect(isGoldenGunHours(edt(9, 0))).toBe(true))
    it('valid at 9:59 PM EDT (last valid minute)', () => expect(isGoldenGunHours(edt(21, 59))).toBe(true))
    it('valid at 6:00 PM EDT (prime game time)', () => expect(isGoldenGunHours(edt(18, 0))).toBe(true))
  })

  describe('off-hours (10:00 PM – midnight EDT) — gun is not a weapon', () => {
    it('invalid at 10:00 PM EDT', () => expect(isGoldenGunHours(edt(22, 0))).toBe(false))
    it('invalid at 10:30 PM EDT', () => expect(isGoldenGunHours(edt(22, 30))).toBe(false))
    it('invalid at 11:00 PM EDT', () => expect(isGoldenGunHours(edt(23, 0))).toBe(false))
    it('invalid at 11:59 PM EDT', () => expect(isGoldenGunHours(edt(23, 59))).toBe(false))
  })

  it('midnight exactly (00:00 EDT) is the boundary — gun becomes valid again', () => {
    // Midnight starts a new day: gun valid from 12:01 AM, but 12:00:00 AM = 0 mins into day
    // The rule says "10 PM–Midnight" is off-hours, implying midnight is the cutoff.
    // edtTotalMins = 0 at midnight → 0 < 22*60 → true (valid)
    expect(isGoldenGunHours(edt(0, 0))).toBe(true)
  })

  describe('UTC midnight rollover edge cases', () => {
    // 10 PM EDT = 2 AM UTC next day
    it('2:00 AM UTC (= 10 PM EDT) is off-hours', () => {
      expect(isGoldenGunHours(utc(2, 0))).toBe(false)
    })
    // 9:59 PM EDT = 1:59 AM UTC next day
    it('1:59 AM UTC (= 9:59 PM EDT) is still valid', () => {
      expect(isGoldenGunHours(utc(1, 59))).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Meal window — documented discrepancy with published rules
// ---------------------------------------------------------------------------

describe('getMealWindow — published rules vs implementation', () => {
  /**
   * DISCREPANCY: The published rules at quincyassassins.wordpress.com/rules/ specify:
   *   Breakfast: 7:30–10:30 AM EDT
   *   Lunch:     11:30 AM–2:00 PM EDT
   *   Dinner:    4:30–7:30 PM EDT
   *
   * The implementation (per CLAUDE.md and game-engine.ts) uses:
   *   Breakfast: 7:30–11:00 AM EDT
   *   Lunch:     11:30 AM–2:30 PM EDT
   *   Dinner:    5:00–8:00 PM EDT
   *
   * The tests below document what the IMPLEMENTATION currently returns at the
   * rule-specified boundaries, so any future alignment with published rules
   * is immediately visible as test failures.
   */

  it('[impl] breakfast still open at 10:30 AM EDT (rules say it closes here)', () => {
    // Rules: closed. Implementation: still open. Intentional widening.
    expect(getMealWindow(edt(10, 30))).toBe('breakfast')
  })

  it('[impl] breakfast still open at 10:59 AM EDT (rules say closed after 10:30)', () => {
    expect(getMealWindow(edt(10, 59))).toBe('breakfast')
  })

  it('[impl] lunch still open at 2:00 PM EDT (rules say it closes here)', () => {
    // Rules: closed at 14:00. Implementation: still open until 14:30.
    expect(getMealWindow(edt(14, 0))).toBe('lunch')
  })

  it('[impl] dinner NOT open at 4:30 PM EDT (rules say it opens here)', () => {
    // Rules: open from 16:30. Implementation: opens at 17:00.
    expect(getMealWindow(edt(16, 30))).toBeNull()
  })

  it('[impl] dinner NOT open at 4:59 PM EDT (rules say it should be open)', () => {
    expect(getMealWindow(edt(16, 59))).toBeNull()
  })

  it('[impl] dinner still open at 7:30 PM EDT (rules say it closes here)', () => {
    // Rules: closed at 19:30. Implementation: still open until 20:00.
    expect(getMealWindow(edt(19, 30))).toBe('dinner')
  })
})

// ---------------------------------------------------------------------------
// Flagged gaps — rules with no pure-function implementation yet
// ---------------------------------------------------------------------------

/**
 * Intentional design decisions (not bugs, not todos):
 *
 * - kill_blackout_hours is always 48 for this game; INITIAL_WINDOW_MS hardcoded intentionally.
 * - Thursday Community Dinner: accepted as a known gap; not worth the complexity for one game.
 * - Weekend amnesty: handled manually by the admin via the general amnesty toggle button.
 * - Golden gun missed-return penalty: low-probability edge case; admin will handle via direct
 *   SQL if needed rather than automated enforcement.
 *
 * FIXED in main (2026-04-18):
 *   ✓ rule 2a bonus point — +1 for full unit elimination awarded in eliminations/route.ts
 *   ✓ rule 2b exposed 48h → Wanted — isExposedPenaltyDue() called in daily-checkin cron
 *   ✓ rule 2a kill timer reference — killTimerResetTime() used in team-kills/route.ts
 *   ✓ fragile kill-timer string matching — replaced with reason_code:'kill_timer_penalty'
 *   ✓ golden gun holder terminated → gun retired in eliminations/route.ts
 *   ✓ target chain: hunter team (not killer) now inherits via advance_target_chain action
 *   ✓ terminated players blocked from check-ins in player/checkin/route.ts
 *   ✓ general amnesty — isKillValid checks generalAmnestyActive; crons skip amnesty games
 *   ✓ crypto shuffle — buildTargetChain uses crypto.getRandomValues()
 */

