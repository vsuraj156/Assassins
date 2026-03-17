import { PlayerStatus, WarStatus } from '@/types/game'

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
  killerTeamId: string
  targetTeamId: string
  assignedTargetTeamId: string | null
  activeWars: { team1_id: string; team2_id: string; status: WarStatus }[]
  killerIsDouble0: boolean
  targetIsDouble0: boolean
  killerIsRogue: boolean
  targetIsRogue: boolean
  goldenGunActive: boolean
  goldenGunHolderTeamId?: string | null
}

export function isKillValid(ctx: KillValidationContext): { valid: boolean; reason?: string } {
  // Can't kill own teammate
  if (ctx.killerTeamId === ctx.targetTeamId && !ctx.killerIsRogue) {
    return { valid: false, reason: 'Cannot eliminate a teammate' }
  }

  // Rogue agents can kill/be killed by anyone
  if (ctx.killerIsRogue || ctx.targetIsRogue) {
    return { valid: true }
  }

  // Double-0 can eliminate any other Double-0
  if (ctx.killerIsDouble0 && ctx.targetIsDouble0) {
    return { valid: true }
  }

  // Golden gun holder can kill anyone
  if (ctx.goldenGunActive && ctx.goldenGunHolderTeamId === ctx.killerTeamId) {
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
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5)
  const chain = new Map<string, string>()
  for (let i = 0; i < shuffled.length; i++) {
    chain.set(shuffled[i], shuffled[(i + 1) % shuffled.length])
  }
  return chain
}

// Golden gun expires at 9:59 PM on the day it was released
export function goldenGunExpiresAt(releasedAt: Date): Date {
  const expires = new Date(releasedAt)
  expires.setHours(21, 59, 0, 0)
  // If released after 9:59 PM, it expires same-day at 9:59 (edge case: treat as expired immediately)
  return expires
}

// Stun expires at midnight of the day it was applied
export function stunExpiresAt(appliedAt: Date): Date {
  const expires = new Date(appliedAt)
  expires.setDate(expires.getDate() + 1)
  expires.setHours(0, 0, 0, 0)
  return expires
}
