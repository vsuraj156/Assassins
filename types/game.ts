export type GameStatus = 'setup' | 'signup' | 'active' | 'ended'
export type TeamStatus = 'active' | 'eliminated'
export type PlayerStatus = 'active' | 'exposed' | 'wanted' | 'terminated' | 'amnesty'
export type PlayerRole = 'player' | 'admin'
export type EliminationStatus = 'pending' | 'approved' | 'rejected'
export type CheckinStatus = 'pending' | 'approved' | 'rejected'
export type WarStatus = 'pending' | 'active' | 'ended'
export type GoldenGunStatus = 'active' | 'returned' | 'expired'
export type EntityType = 'player' | 'team'
export type NameStatus = 'pending' | 'approved' | 'rejected'

export interface Game {
  id: string
  name: string
  status: GameStatus
  start_time: string | null
  end_time: string | null
  kill_blackout_hours: number
  totem_description: string | null
  created_at: string
}

export interface Team {
  id: string
  game_id: string
  name: string
  status: TeamStatus
  points: number
  target_team_id: string | null
  last_elimination_at: string | null
  invite_code: string
  captain_player_id: string | null
  name_status: NameStatus
  name_rejection_reason: string | null
  created_at: string
}

export interface Player {
  id: string
  game_id: string
  team_id: string | null
  user_email: string
  name: string
  photo_url: string | null
  role: PlayerRole
  status: PlayerStatus
  is_double_0: boolean
  is_rogue: boolean
  code_name: string | null
  code_name_status: NameStatus
  code_name_rejection_reason: string | null
  created_at: string
}

export interface Elimination {
  id: string
  game_id: string
  killer_id: string
  target_id: string
  killer_team_id: string
  target_team_id: string
  is_double_0: boolean
  points: number
  status: EliminationStatus
  notes: string | null
  timestamp: string
  approved_at: string | null
  approved_by: string | null
}

export interface Checkin {
  id: string
  game_id: string
  player_id: string
  photo_url: string
  meal_date: string
  status: CheckinStatus
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export interface Stun {
  id: string
  game_id: string
  attacker_id: string
  stunned_by_id: string
  reason: string | null
  expires_at: string
}

export interface War {
  id: string
  game_id: string
  team1_id: string
  team2_id: string
  status: WarStatus
  requested_by_player_id: string
  reason: string | null
  approved_at: string | null
  ended_at: string | null
}

export interface GoldenGunEvent {
  id: string
  game_id: string
  holder_team_id: string
  released_at: string
  expires_at: string
  returned_at: string | null
  status: GoldenGunStatus
}

export interface StatusHistory {
  id: string
  entity_type: EntityType
  entity_id: string
  old_status: string
  new_status: string
  reason: string | null
  changed_by: string | null
  created_at: string
}

// Joined types for UI
export interface PlayerWithTeam extends Player {
  team?: Team
}

export interface EliminationWithPlayers extends Elimination {
  killer?: Player
  target?: Player
  killer_team?: Team
  target_team?: Team
}

export interface CheckinWithPlayer extends Checkin {
  player?: Player
}

export interface TeamWithPlayers extends Team {
  players?: Player[]
  target_team?: Team
}
