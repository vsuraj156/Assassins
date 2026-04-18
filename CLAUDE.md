# Quincy Assassins — Claude Instructions

## Project

Web platform for the Quincy House Harvard Assassins game. Replaces Google Sheets/Forms with automated rule enforcement. See `docs/plan.md` for the full implementation plan and architecture.

**Deadline:** April 2026 (before the game starts). Prefer practical simplicity over over-engineering.

**Admin:** Varun (game organizer). Sets up games, approves kills/check-ins, manages players.

## Tech Stack

- **Framework:** Next.js (App Router, TypeScript)
- **Database:** Supabase (PostgreSQL + Storage for photos)
- **Auth:** NextAuth.js v5 — Google OAuth only (Harvard accounts)
- **Email:** Resend
- **Hosting:** Vercel + external cron scheduler (cron routes exist at `/api/cron/*`, triggered externally via `CRON_SECRET`)
- **Styling:** Tailwind CSS

## Project Structure

```
app/
  admin/          → /admin/* routes (real directory, NOT route group — gives /admin/ URLs)
  (player)/       → route group for player routes at bare paths (/dashboard, /target, etc.)
  signup/         → team creation and joining flow
  api/            → all API routes
lib/
  auth.ts         → NextAuth config + session type extensions
  db.ts           → Supabase server client (service role) + browser client
  game-engine.ts  → Pure rule logic (kill validation, status progression, etc.)
  email.ts        → Resend email templates
  storage.ts      → Supabase Storage helpers (signed upload URLs)
types/game.ts     → All TypeScript interfaces
middleware.ts     → Route protection
supabase/schema.sql → Full DB schema — run this in Supabase SQL editor
docs/plan.md      → Full implementation plan and architecture decisions
vercel.json       → Vercel config (cron scheduling intentionally removed; crons run via external scheduler)
```

## Key Conventions

- **Admin routes use `app/admin/`** (a real directory), not `(admin)` route group. This matters because route groups don't add URL segments — two groups with the same sub-paths would clash.
- **Server client vs browser client:** Use `createServerClient()` (service role key, bypasses RLS) in API routes and server components. The exported `supabase` constant (anon key) is for browser use.
- **Target page is server-rendered only** — never fetch or expose the full target chain client-side.
- **All status changes must log to `status_history`** — include `changed_by: null` for cron-automated changes.
- **Kill approval cascade** (in `/api/admin/eliminations/route.ts`): terminate target → award team points → check if target team is fully eliminated → if yes, mark team eliminated and advance killer's target to eliminated team's former target.
- **Cron routes are protected** by `Authorization: Bearer ${CRON_SECRET}` header check.

## Environment Variables

See `.env.local.example` for all required vars. Key ones:
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never expose to client
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe for client
- `AUTH_SECRET` — NextAuth secret (32+ chars)
- `CRON_SECRET` — shared between Vercel and the cron route handlers

## Game Rules

**Full rules:** https://quincyassassins.wordpress.com/rules/ — consult this whenever implementing or debugging game logic.

### Summary

- **Statuses:** `active → exposed → wanted → terminated` (also `amnesty`)
- **Daily check-in:** miss one → status advances. Cron runs at 11:59 PM.
- **Team kill timer:** no kill in 48h → random team member exposed. Resets on next approved kill.
- **Double-0:** worth 2 points when eliminated; can kill any other Double-0 regardless of target.
- **Wars:** admin-created and admin-managed only; both teams can kill each other during an active war.
- **Golden Gun:** admin releases to a team; expires at 9:59 PM same day; holder can kill anyone.
- **Rogue agents:** can kill/be killed by anyone.
- **Kill timer penalty:** kill-timer and check-in penalties are independent sources of status change. A kill reverts only kill-timer penalties (step each affected player back one level); check-in penalties stay. E.g. wanted (kill-timer exposed + missed check-in) → exposed after a kill.
- **Kill log blackout:** approved kills hidden from players for 48 hours.
- **Target chain:** circular; when a team is fully eliminated, killer inherits their target.

## What's Not Yet Built

- Push notifications / real-time updates (email-only is intentional; no plan to add)

## Decisions Made

- **Profile photo upload** is embedded in `/signup/create-team` and `/signup/join-team` — no separate `/signup/profile` page needed.
- **Wars are admin-only** — players cannot request wars; only admins create/manage them via `/admin/wars`.
- **Double-0 designation UI** exists in the captain's team roster card (`TeamRosterCard.tsx`) via `POST /api/player/team?action=set_double_0`.
