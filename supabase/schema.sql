-- Quincy Assassins Database Schema
-- Run this in your Supabase SQL editor

-- Games
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'signup', 'active', 'ended')),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  kill_blackout_hours INTEGER NOT NULL DEFAULT 48,
  totem_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'eliminated')),
  points INTEGER NOT NULL DEFAULT 0,
  target_team_id UUID REFERENCES teams(id),
  last_elimination_at TIMESTAMPTZ,
  last_kill_penalty_at TIMESTAMPTZ,
  invite_code TEXT NOT NULL UNIQUE,
  captain_player_id UUID,
  name_status TEXT NOT NULL DEFAULT 'pending' CHECK (name_status IN ('pending', 'approved', 'rejected')),
  name_rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exposed', 'wanted', 'terminated', 'amnesty')),
  is_double_0 BOOLEAN NOT NULL DEFAULT FALSE,
  is_rogue BOOLEAN NOT NULL DEFAULT FALSE,
  code_name TEXT,
  code_name_status TEXT NOT NULL DEFAULT 'pending' CHECK (code_name_status IN ('pending', 'approved', 'rejected')),
  code_name_rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from teams to players (captain) after players table exists
ALTER TABLE teams ADD CONSTRAINT fk_captain FOREIGN KEY (captain_player_id) REFERENCES players(id);

-- Eliminations
CREATE TABLE eliminations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  killer_id UUID NOT NULL REFERENCES players(id),
  target_id UUID NOT NULL REFERENCES players(id),
  killer_team_id UUID NOT NULL REFERENCES teams(id),
  target_team_id UUID NOT NULL REFERENCES teams(id),
  is_double_0 BOOLEAN NOT NULL DEFAULT FALSE,
  points INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES players(id)
);

-- Checkins
CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id),
  photo_url TEXT NOT NULL,
  meal_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  meal_time TEXT CHECK (meal_time IN ('breakfast', 'lunch', 'dinner')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES players(id),
  UNIQUE (player_id, meal_date, meal_time)
);

-- Stuns
CREATE TABLE stuns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  attacker_id UUID NOT NULL REFERENCES players(id),
  stunned_by_id UUID NOT NULL REFERENCES players(id),
  reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Wars
CREATE TABLE wars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team1_id UUID NOT NULL REFERENCES teams(id),
  team2_id UUID NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended')),
  requested_by_player_id UUID NOT NULL REFERENCES players(id),
  reason TEXT,
  approved_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- Golden Gun Events
CREATE TABLE golden_gun_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  holder_player_id UUID NOT NULL REFERENCES players(id),
  holder_team_id UUID NOT NULL REFERENCES teams(id),
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  returned_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned', 'expired'))
);

-- Status History (audit log)
CREATE TABLE status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('player', 'team')),
  entity_id UUID NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES players(id),  -- NULL = automated cron
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_players_email ON players(user_email);
CREATE INDEX idx_players_game ON players(game_id);
CREATE INDEX idx_players_team ON players(team_id);
CREATE INDEX idx_teams_game ON teams(game_id);
CREATE INDEX idx_eliminations_game ON eliminations(game_id);
CREATE INDEX idx_eliminations_status ON eliminations(status);
CREATE INDEX idx_checkins_player_date ON checkins(player_id, meal_date);
CREATE INDEX idx_checkins_game_status ON checkins(game_id, status);
CREATE INDEX idx_wars_teams ON wars(team1_id, team2_id);
CREATE INDEX idx_status_history_entity ON status_history(entity_type, entity_id);

-- Supabase Storage bucket (run in Supabase dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('assassins', 'assassins', true);
