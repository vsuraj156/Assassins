import { PlayerStatus, WarStatus } from '@/types/game'

export type MealWindow = 'breakfast' | 'lunch' | 'dinner'

// Meal windows in Eastern Daylight Time (UTC-4).
// Breakfast 7:30–11:00, Lunch 11:30–14:30, Dinner 17:00–20:00.
export function getMealWindow(utcDate: Date): MealWindow | null {
  const edtTotalMins = ((utcDate.getUTCHours() * 60 + utcDate.getUTCMinutes() - 4 * 60) % (24 * 60) + 24 * 60) % (24 * 60)
  if (edtTotalMins >= 7 * 60 + 30 && edtTotalMins < 11 * 60) return 'breakfast'
  if (edtTotalMins >= 11 * 60 + 30 && edtTotalMins < 14 * 60 + 30) return 'lunch'
  if (edtTotalMins >= 17 * 60 && edtTotalMins < 20 * 60) return 'dinner'
  return null
}

// Status progression when missing a daily check-in
export function nextStatusAfterMissedCheckin(current: PlayerStatus): PlayerStatus | null {
  switch (current) {
    case 'active': return 'exposed'
    case 'exposed': return 'wanted'
    case 'wanted': return 'terminated'
    default: return null // amnesty/terminated: no change
  }
}

// Generate a random 6-character invite code
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O, 0, 1, I
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Determine points for an elimination
export function eliminationPoints(isDouble0Target: boolean): number {
  return isDouble0Target ? 2 : 1
}

// Check if a kill is valid given the current game state
export interface KillValidationContext {
  killerPlayerId: string
  killerTeamId: string
  targetTeamId: string
  targetStatus: PlayerStatus
  assignedTargetTeamId: string | null
  activeWars: { team1_id: string; team2_id: string; status: WarStatus }[]
  killerIsDouble0: boolean
  targetIsDouble0: boolean
  killerIsRogue: boolean
  targetIsRogue: boolean
  goldenGunActive: boolean
  goldenGunHolderPlayerId?: string | null
  generalAmnestyActive?: boolean
}

export function isKillValid(ctx: KillValidationContext): { valid: boolean; reason?: string } {
  if (ctx.generalAmnestyActive) {
    return { valid: false, reason: 'General amnesty is active — no kills are permitted' }
  }

  // Teammate restriction overrides everything except rogue status
  if (ctx.killerTeamId === ctx.targetTeamId && !ctx.killerIsRogue && !ctx.targetIsRogue) {
    return { valid: false, reason: 'Cannot eliminate a teammate' }
  }

  // Rogue agents can kill/be killed by anyone (including former teammates)
  if (ctx.killerIsRogue || ctx.targetIsRogue) {
    return { valid: true }
  }

  // Double-0 can eliminate any other Double-0
  if (ctx.killerIsDouble0 && ctx.targetIsDouble0) {
    return { valid: true }
  }

  // Golden gun holder (the specific individual) can kill anyone
  if (ctx.goldenGunActive && ctx.goldenGunHolderPlayerId === ctx.killerPlayerId) {
    return { valid: true }
  }

  // Exposed or wanted players are open targets for everyone
  if (ctx.targetStatus === 'exposed' || ctx.targetStatus === 'wanted') {
    return { valid: true }
  }

  // Assigned target
  if (ctx.assignedTargetTeamId === ctx.targetTeamId) {
    return { valid: true }
  }

  // Active war between the two teams
  const atWar = ctx.activeWars.some(
    (w) =>
      w.status === 'active' &&
      ((w.team1_id === ctx.killerTeamId && w.team2_id === ctx.targetTeamId) ||
        (w.team2_id === ctx.killerTeamId && w.team1_id === ctx.targetTeamId))
  )
  if (atWar) {
    return { valid: true }
  }

  return { valid: false, reason: 'Target is not your assigned target and no active war permits this kill' }
}

// Build a circular target chain from a list of team IDs (random order)
export function buildTargetChain(teamIds: string[]): Map<string, string> {
  const shuffled = [...teamIds]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(
      (crypto.getRandomValues(new Uint32Array(1))[0] / 0x1_0000_0000) * (i + 1)
    )
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const chain = new Map<string, string>()
  for (let i = 0; i < shuffled.length; i++) {
    chain.set(shuffled[i], shuffled[(i + 1) % shuffled.length])
  }
  return chain
}

// Golden gun expires at 9:59 PM EDT on the day it was released.
// EDT = UTC-4, so 9:59 PM EDT = 01:59 UTC next day.
export function goldenGunExpiresAt(releasedAt: Date): Date {
  const EDT_OFFSET_MS = 4 * 60 * 60 * 1000
  // Shift releasedAt into EDT "wall clock" as if it were UTC
  const edtDate = new Date(releasedAt.getTime() - EDT_OFFSET_MS)
  edtDate.setUTCHours(21, 59, 0, 0)
  // Shift back to real UTC
  return new Date(edtDate.getTime() + EDT_OFFSET_MS)
}

// Stun expires at midnight of the day it was applied
export function stunExpiresAt(appliedAt: Date): Date {
  const expires = new Date(appliedAt)
  expires.setDate(expires.getDate() + 1)
  expires.setHours(0, 0, 0, 0)
  return expires
}

// Rule 2c: attending all three meals in one day downgrades status by one level.
// Wanted → Exposed, Exposed → Active. Terminated/Amnesty: no change.
export function nextStatusAfterFullDayMeals(current: PlayerStatus): PlayerStatus | null {
  switch (current) {
    case 'wanted': return 'exposed'
    case 'exposed': return 'active'
    default: return null
  }
}

// Rule 2b: a player who has been Exposed for 48+ hours upgrades to Wanted.
// Returns true if the penalty is due given the timestamp they became exposed.
export function isExposedPenaltyDue(exposedSince: Date, now: Date): boolean {
  return now.getTime() - exposedSince.getTime() >= 48 * 60 * 60 * 1000
}

// Rule 2a: the kill timer resets at midnight LOCAL TIME following an approved kill,
// not at the kill timestamp itself.
export function killTimerResetTime(eliminationApprovedAt: Date): Date {
  const midnight = new Date(eliminationApprovedAt)
  midnight.setDate(midnight.getDate() + 1)
  midnight.setHours(0, 0, 0, 0)
  return midnight
}

// Rule 2a: whether a kill-timer penalty is due for a team.
// referenceMs  — epoch ms when the 48h clock started (killTimerResetTime of last kill, or game start)
// lastPenaltyMs — epoch ms of the most recent penalty applied, or null if never penalized
// nowMs         — current epoch ms
// repeatWindowMs — how long between successive penalties (always 24h per rules)
export function isKillTimerPenaltyDue(
  referenceMs: number,
  lastPenaltyMs: number | null,
  nowMs: number,
  initialWindowMs: number,
  repeatWindowMs: number
): boolean {
  if (nowMs - referenceMs < initialWindowMs) return false
  return (
    lastPenaltyMs === null ||
    lastPenaltyMs < referenceMs ||
    nowMs - lastPenaltyMs >= repeatWindowMs
  )
}

// Golden gun off-hours: 10 PM–midnight EDT the gun is not a weapon.
// Returns true if the gun may be used as a weapon at the given UTC time.
export function isGoldenGunHours(now: Date): boolean {
  const edtTotalMins = ((now.getUTCHours() * 60 + now.getUTCMinutes() - 4 * 60) % (24 * 60) + 24 * 60) % (24 * 60)
  // Valid: 0:01–21:59 EDT (1 minute after midnight through 9:59 PM)
  // Invalid: 22:00–23:59 EDT (10 PM–midnight)
  return edtTotalMins < 22 * 60
}
