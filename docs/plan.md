# Quincy Assassins Web Platform — Implementation Plan

## Context

Quincy Assassins is a team-based elimination game run at Quincy House, Harvard. It's currently managed entirely via Google Sheets and Google Forms, which is error-prone and time-consuming given the game's complex rule set (player statuses, daily check-ins, 48-hour team kill deadlines, wars, stuns, golden guns, etc.). The goal is a full web platform that automates rule enforcement, gives players a clean interface, and gives admins a management dashboard — ready before April 2026.

This is a greenfield project. `/Users/ssrinivasan/Desktop/Assassins` is currently empty.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database | Supabase (PostgreSQL + file storage for photos) |
| Auth | NextAuth.js v5 with Google OAuth |
| Email | Resend |
| Hosting | Vercel |
| Cron | Vercel Cron Jobs |
| Styling | Tailwind CSS + shadcn/ui |

---

## Database Schema

### Tables

**`games`** — top-level game instance
```sql
id, name, status (setup|active|ended), start_time, end_time,
kill_blackout_hours (default 48), totem_description, created_at
```

**`teams`** — units of up to 6 players
```sql
id, game_id, name, status (active|eliminated), points,
target_team_id (FK self), last_elimination_at, created_at
```

**`players`** — individual agents
```sql
id, game_id, team_id, user_email (matches Google OAuth),
name, photo_url (Supabase storage), role (player|admin),
status (active|exposed|wanted|terminated|amnesty),
is_double_0 (bool), is_rogue (bool), created_at
```

**`eliminations`**
```sql
id, game_id, killer_id, target_id, killer_team_id, target_team_id,
is_double_0, points (1 or 2), status (pending|approved|rejected),
notes, timestamp, approved_at, approved_by
```

**`checkins`**
```sql
id, game_id, player_id, photo_url, meal_date (date),
status (pending|approved|rejected), submitted_at, reviewed_at, reviewed_by
```

**`stuns`**
```sql
id, game_id, attacker_id, stunned_by_id, reason, expires_at (midnight)
```

**`wars`**
```sql
id, game_id, team1_id, team2_id, status (pending|active|ended),
requested_by_player_id, reason, approved_at, ended_at
```

**`golden_gun_events`**
```sql
id, game_id, holder_team_id, released_at, expires_at (9:59 PM), returned_at, status
```

**`status_history`** — full audit log
```sql
id, entity_type (player|team), entity_id, old_status, new_status,
reason, changed_by (null = automated cron), created_at
```

---

## Project Structure

```
/app
  /api
    /auth/[...nextauth]/route.ts       ← NextAuth handler
    /admin/players/route.ts            ← CRUD players
    /admin/teams/route.ts              ← CRUD teams, assign targets
    /admin/eliminations/route.ts       ← Approve/reject kills
    /admin/checkins/route.ts           ← Approve/reject check-ins
    /admin/game/route.ts               ← Start/end game, golden gun
    /admin/wars/route.ts               ← Approve wars
    /player/checkin/route.ts           ← Submit check-in + photo upload
    /player/elimination/route.ts       ← Submit elimination claim
    /player/target/route.ts            ← Fetch current target (auth-gated)
    /cron/daily-checkin/route.ts       ← Auto-expose non-checkin players
    /cron/team-kills/route.ts          ← Auto-expose team member if no kill in 48h
    /cron/stun-cleanup/route.ts        ← Expire stuns at midnight
  /admin
    /layout.tsx                        ← Admin auth guard
    /dashboard/page.tsx                ← Overview, recent activity, stats
    /players/page.tsx                  ← Player table: filter/search/edit status
    /teams/page.tsx                    ← Team table, target chain management
    /eliminations/page.tsx             ← Pending kill approvals
    /checkins/page.tsx                 ← Pending check-in approvals (photo viewer)
    /game/page.tsx                     ← Game control: start/end, golden gun, totem
    /wars/page.tsx                     ← Pending war approvals
    /moderation/page.tsx               ← Review pending team names & player code names
  /(player)
    /layout.tsx                        ← Player auth guard
    /dashboard/page.tsx                ← Status, stuns, quick actions
    /target/page.tsx                   ← Target name + photo (server-rendered)
    /checkin/page.tsx                  ← Photo upload form
    /elimination/page.tsx              ← Elimination submission form
    /leaderboard/page.tsx              ← Team standings, points
    /log/page.tsx                      ← Kill log (48h blackout enforced)
    /rules/page.tsx                    ← Game rules reference
  /signup
    /create-team/page.tsx              ← Create team, get invite code
    /join-team/page.tsx                ← Enter invite code to join team
  /page.tsx                            ← Login / landing
/lib
  /db.ts                               ← Supabase client (server + browser)
  /auth.ts                             ← NextAuth config (Google provider, role injection)
  /game-engine.ts                      ← Rule enforcement functions (pure logic)
  /email.ts                            ← Resend email templates
  /storage.ts                          ← Supabase storage helpers (photo upload)
  /utils.ts                            ← cn() helper
/types
  /game.ts                             ← TypeScript interfaces for all DB types
/components
  /ui/badge.tsx                        ← Status badge component
/docs
  /plan.md                             ← This file
/supabase
  /schema.sql                          ← Full DB schema migration
/middleware.ts                         ← Route protection (admin vs player)
/vercel.json                           ← Cron job schedule definitions
```

---

## Automated Rule Engine (Cron Jobs)

### 1. `/api/cron/daily-checkin` — runs at 11:59 PM daily
- Find all `active/exposed/wanted` players in active games
- Check if they have an `approved` checkin for today
- If no checkin: `active → exposed`, `exposed → wanted`, `wanted → terminated`
- Write to `status_history` with `changed_by = null` (automated)
- Send email notification to affected players

### 2. `/api/cron/team-kills` — runs every hour
- Find all active teams where `last_elimination_at < now() - 48h` (or null)
- Pick one random non-terminated player from that team
- Set status to `exposed` if not already
- Write to `status_history`
- On any elimination approval: if team had this punishment → rescind (revert to `active`)

### 3. `/api/cron/stun-cleanup` — runs at 12:01 AM daily
- Delete all stuns where `expires_at < now()`

---

## Authorization Model

- **Admin**: players with `role = 'admin'` in DB. Set manually by Varun via Supabase dashboard or admin API.
- **Player**: any authenticated Google user whose email matches a `players` record in an active game
- **Middleware** (`/middleware.ts`): redirects `/admin/*` to login if not admin, redirects `/(player)/*` if no matching player record

---

## Key Implementation Details

### Target Visibility (Security)
- `/app/(player)/target/page.tsx` is **server-rendered only**
- Target info fetched server-side using the authenticated session's player ID
- Never expose the full target chain to the client

### Kill Blackout (48h)
- `eliminations` table stores `timestamp`
- `/app/(player)/log/page.tsx` filters: `WHERE approved_at < now() - interval '48 hours'`
- Admin `/admin/eliminations` sees all kills immediately

### Double-0 Scoring
- On elimination approval: if `target.is_double_0 = true` → `points = 2`, else `points = 1`
- Also: Double-0s can eliminate any other Double-0 regardless of team assignment (checked in elimination submission API)

### Photo Upload (Check-ins)
- Client uploads to Supabase Storage via signed upload URL
- Returns `photo_url` stored in `checkins` table
- Admin sees photo inline in `/admin/checkins`

### War Mechanics
- Player submits war request via form with reason
- Admin approves → `wars.status = 'active'`
- Kill submission API checks: if `killer_team_id` and `target_team_id` have an active war → allow even if not the assigned target

### Team Sign-up Flow (Player-driven, Invite Code)
1. Authenticated player visits `/signup/create-team` → enters team name → system generates a unique 6-char invite code → player becomes team captain
2. Captain shares invite code with up to 5 teammates
3. Other players visit `/signup/join-team` → enter invite code → join the team (capped at 6 members)
4. Each player uploads their profile photo during sign-up
5. Each team designates their Double-0 Agent before the game starts
6. Admin sees all teams/players in `/admin/teams` but does not need to create them

**`teams` table additions:** `invite_code (unique, 6-char)`, `captain_player_id`, `name_status (pending|approved|rejected)`, `name_rejection_reason`
**`players` table additions:** `photo_url` uploaded by player during sign-up, `code_name`, `code_name_status (pending|approved|rejected)`, `code_name_rejection_reason`

### Name Moderation Flow
- On team creation: `name_status = 'pending'` — team is visible in admin queue
- On player sign-up: player sets a code name → `code_name_status = 'pending'`
- Admin reviews all pending names in `/admin/moderation` → approve or reject with a reason
- On rejection: player/captain is notified by email and prompted to resubmit a new name
- Game cannot be started until all team names and code names are approved

### Game Setup Flow (Admin)
1. Create game shell (name, start time) → game opens for sign-up (`status = 'signup'`)
2. Players self-organize into teams using invite codes
3. Admin approves/rejects team names and player code names in `/admin/moderation`
4. Admin assigns target chain (circular, random or manual) and sets Double-0s
5. Start game → `game.status = 'active'`, `game.start_time = now()`, membership locked (blocked until all names approved)

---

## Build Order (Phased)

### Phase 1 — Foundation
- `npx create-next-app@latest` with TypeScript + Tailwind
- Supabase project setup, schema migration SQL
- NextAuth Google OAuth with role-based session
- Middleware for route protection
- `/lib/db.ts`, `/lib/auth.ts`, `/types/game.ts`

### Phase 2 — Admin Core
- `/admin/game` — game creation, start/end
- `/admin/players` — add/edit/delete players, upload photos
- `/admin/teams` — create teams, assign target chain

### Phase 3 — Player Actions
- `/player/target` — view assigned target
- `/player/checkin` — photo upload + submission
- `/player/elimination` — submit kill claim

### Phase 4 — Admin Approvals + Automation
- `/admin/eliminations` — approve/reject kills (triggers chain updates)
- `/admin/checkins` — approve/reject check-ins
- Cron jobs: daily check-in enforcement, team kill timer, stun cleanup

### Phase 5 — Game Monitoring
- `/player/leaderboard` — live team standings
- `/player/log` — kill log with blackout
- `/admin/wars` — war management
- Email notifications (Resend) for status changes, target updates
- `/admin/dashboard` — full game overview

### Phase 6 — Polish & Deploy
- Mobile-responsive UI audit
- `vercel.json` cron config
- Environment variables setup in Vercel dashboard
- End-to-end test run with dummy data

---

## Verification Plan

1. **Auth**: Google login redirects player to `/dashboard`, admin to `/admin/dashboard`. Non-players see error.
2. **Target security**: Player A cannot access Player B's target page.
3. **Check-in flow**: Upload photo → appears in admin queue → approve → player's checkin badge turns green.
4. **Kill flow**: Submit kill → pending in admin → approve → target status changes, team points increment, kill log updates.
5. **Automation**: Set `last_elimination_at = now() - 50h` on a team in DB → run cron → verify a player becomes Exposed.
6. **Blackout**: Approve a kill → verify it doesn't appear in `/log` for 48h, then does appear after.
7. **Double-0**: Approve kill of a Double-0 → verify team points += 2.

---

## Deployment Checklist

1. Create Supabase project → run `supabase/schema.sql` in the SQL editor
2. Create a public Supabase Storage bucket named `assassins`
3. Set up Google OAuth at [console.cloud.google.com](https://console.cloud.google.com) — add Vercel domain as authorized redirect URI (`https://yourdomain.com/api/auth/callback/google`)
4. Copy `.env.local.example` → `.env.local`, fill in all values
5. `vercel deploy` — add all env vars in Vercel dashboard
6. Set `CRON_SECRET` in Vercel — must match `.env.local`
7. To grant admin access: set `role = 'admin'` on your player row in Supabase after first login
