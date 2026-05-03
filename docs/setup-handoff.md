# Quincy Assassins — New Admin Setup Guide

This guide walks a new game organizer through getting the platform running from scratch. It assumes you only have access to the GitHub repo and nothing else — no existing Vercel deployment, no Supabase project, no Google OAuth credentials.

**Time budget:** ~2 hours if nothing goes wrong.

---

## Prerequisites

- A computer with Node.js 20+ installed (`node -v` to check)
- npm installed (comes with Node)
- A Harvard Google account (the one you'll use to log in as admin)
- A personal Gmail account (for sending game emails — ideally a dedicated one like `quincyassassins@gmail.com`)
- A GitHub account with access to the repo

---

## Step 1 — Clone the Repo

```bash
git clone <repo-url>
cd Assassins
npm install
```

---

## Step 2 — Supabase (Database + File Storage)

Supabase is the database and photo storage backend.

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Click **New project**. Name it `assassins` (or anything you like). Pick a strong database password and save it somewhere — you won't need it again but it's good practice.
3. Wait ~2 minutes for the project to initialize.

### Run the schema

4. In your Supabase project, click **SQL Editor** in the left sidebar.
5. Open the file `supabase/schema.sql` from the repo.
6. Copy the entire contents and paste them into the SQL editor. Click **Run**.
   - You should see "Success. No rows returned."
   - This creates all the tables, indexes, and migration columns.

### Create the storage bucket

7. In the left sidebar, click **Storage**.
8. Click **New bucket**. Name it exactly `assassins`. Make it **Public** (photos need to be publicly readable). Click **Save**.

### Get your credentials

9. In the left sidebar, click **Project Settings → API**.
10. Copy the following — you'll need them later:
    - **Project URL** (looks like `https://abcdefgh.supabase.co`)
    - **anon public** key (long string under "Project API keys")
    - **service_role** key (click "Reveal" — keep this secret, it bypasses all security rules)

---

## Step 3 — Google OAuth

Players log in with their Harvard Google accounts. You need to register the app in Google Cloud.

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (top-left dropdown → **New Project**). Name it `Quincy Assassins`.
3. In the left menu, go to **APIs & Services → OAuth consent screen**.
   - User Type: **External**
   - Fill in App name: `Quincy Assassins`, your email as support email and developer contact.
   - No scopes to add. Click through to finish.
4. Go to **APIs & Services → Credentials**.
   - Click **Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Assassins Web`.
   - Under **Authorized redirect URIs**, add:
     ```
     https://YOUR-VERCEL-URL.vercel.app/api/auth/callback/google
     ```
     (You'll get the Vercel URL in Step 5. Come back and update this if needed — you can edit it later.)
   - Click **Create**.
5. Copy the **Client ID** and **Client Secret** that appear.

> **Note:** When testing locally, also add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.

---

## Step 4 — Gmail App Password (for sending emails)

The app sends emails via a Gmail account using SMTP. You need a Gmail account and an App Password (not your regular password).

1. Use a dedicated Gmail account (e.g. `quincyassassins@gmail.com`) or create one.
2. In that Google account, go to **Manage your Google Account → Security**.
3. Make sure **2-Step Verification** is turned on.
4. Search for **App passwords** in the search bar.
5. Create a new app password. Name it `Assassins`. Copy the 16-character password that appears — it won't be shown again.

---

## Step 5 — Vercel (Hosting)

1. Go to [vercel.com](https://vercel.com) and sign up or log in.
2. Click **Add New → Project**.
3. Import the GitHub repo.
4. Framework preset will be detected as **Next.js** automatically.
5. **Do not deploy yet.** Click through to the environment variables section first.

### Set environment variables

In the Vercel project settings (or during import), add these environment variables:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | From Step 2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | From Step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | From Step 2 — keep secret |
| `AUTH_SECRET` | Random 32+ character string | Generate one: `openssl rand -base64 32` in terminal |
| `NEXTAUTH_URL` | `https://YOUR-APP.vercel.app` | Use your actual Vercel URL |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID | From Step 3 |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth client secret | From Step 3 |
| `GMAIL_USER` | The Gmail address | e.g. `quincyassassins@gmail.com` |
| `GMAIL_APP_PASSWORD` | The 16-char app password | From Step 4 |
| `CRON_SECRET` | Random string | Generate: `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-APP.vercel.app` | Same as NEXTAUTH_URL |
| `MULTI_PROFILE_EMAILS` | Comma-separated admin emails | Emails that can have both admin + player profiles, e.g. your Harvard email |

6. Click **Deploy**. Wait for the build to complete (~2 minutes).
7. Note your Vercel URL (e.g. `https://assassins-abc123.vercel.app`).
8. Go back to **Step 3** and add that URL to the Google OAuth authorized redirect URIs if you haven't already.

---

## Step 6 — Make Yourself Admin

The app has no built-in admin bootstrap UI — you set your role directly in the database.

1. First, visit the live site and sign in with your Harvard Google account. This creates your player record.
2. Go to your Supabase project → **Table Editor → players**.
3. Find your row (search by your email). Change the `role` column from `player` to `admin`.
4. Sign out and sign back in — you should now see the **Admin** panel in the navigation.

---

## Step 7 — Set Up the Cron Jobs

The game has four automated jobs that must run on schedule:

| Endpoint | Schedule | What it does |
|---|---|---|
| `GET /api/cron/daily-checkin` | 11:59 PM EDT every day | Penalizes players who missed their meal check-in; advances `exposed` players to `wanted` after 48h |
| `GET /api/cron/team-kills` | Every hour | Exposes a random team member if the team hasn't made a kill in 48h |
| `GET /api/cron/wars` | Every 15 minutes | Ends expired wars |
| `GET /api/cron/stun-cleanup` | Every 15 minutes | Expires stun effects |

All cron routes require the header `Authorization: Bearer YOUR_CRON_SECRET`.

### Option A — External scheduler (recommended, free)

Use a service like [cron-job.org](https://cron-job.org) (free):

1. Create an account at cron-job.org.
2. For each of the four routes above, create a cron job:
   - URL: `https://YOUR-APP.vercel.app/api/cron/<route>`
   - Add a request header: `Authorization: Bearer YOUR_CRON_SECRET`
   - Set the schedule (in UTC — EDT is UTC-4):
     - `daily-checkin`: `59 3 * * *` (3:59 AM UTC = 11:59 PM EDT)
     - `team-kills`: `0 * * * *` (every hour)
     - `wars`: `*/15 * * * *` (every 15 minutes)
     - `stun-cleanup`: `*/15 * * * *` (every 15 minutes)

### Option B — Vercel Cron (paid plans)

If the Vercel account is on a paid plan, you can use Vercel's built-in cron. Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/daily-checkin", "schedule": "59 3 * * *" },
    { "path": "/api/cron/team-kills",    "schedule": "0 * * * *" },
    { "path": "/api/cron/wars",          "schedule": "*/15 * * * *" },
    { "path": "/api/cron/stun-cleanup",  "schedule": "*/15 * * * *" }
  ]
}
```

Note: Vercel crons pass the `Authorization` header automatically using your `CRON_SECRET` env var only when configured via their dashboard. You may need to handle auth differently — check Vercel docs for the `x-vercel-cron-signature` header as an alternative to the bearer token.

---

## Step 8 — Run Through the Admin Workflow (Pre-Game Checklist)

1. **Create a game:** Go to `/admin` → Create Game. Set the game name. Leave it in `setup` status until you're ready.
2. **Open signup:** Move the game to `signup` status. Players can now register at `/signup`.
3. **Approve team names and code names:** Go to `/admin` → Moderation. Review pending submissions.
4. **Start the game:** When all teams are in, go to the game settings and move status to `active`. This assigns target chains and starts the clock.
5. **During the game:** Approve kills and check-ins from the Admin panel. Use the Wars page to manage wars. Release the Golden Gun from the admin panel when desired.
6. **End the game:** Move status to `ended`.

---

## Local Development

To run the app locally for testing:

1. Copy `.env.local.example` to `.env.local` and fill in all values. For `NEXTAUTH_URL` use `http://localhost:3000`.
2. Run `npm run dev`.
3. Visit `http://localhost:3000`.

Make sure `http://localhost:3000/api/auth/callback/google` is in your Google OAuth redirect URIs.

To run the test suite:

```bash
npm test
```

---

## Troubleshooting

**I can't log in / OAuth error**
- Verify the redirect URI in Google Cloud matches your deployment URL exactly (including `https://`).
- Check that `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, and `NEXTAUTH_URL` are all set in Vercel.

**Emails aren't sending**
- Check that `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set.
- Confirm 2FA is enabled on the Gmail account and the App Password was created *after* enabling 2FA.
- Check Vercel function logs for the specific error.

**Database errors on first load**
- Make sure you ran the full `supabase/schema.sql` in the Supabase SQL editor.
- Double-check that the `SUPABASE_SERVICE_ROLE_KEY` is the service role key, not the anon key.

**Photos not uploading**
- Confirm the `assassins` storage bucket exists in Supabase and is set to **Public**.

**Cron jobs not running**
- Test a cron endpoint manually: `curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-APP.vercel.app/api/cron/daily-checkin`
- Should return `{"accepted":true}`.

---

## Key Files Reference

| File | What it does |
|---|---|
| `supabase/schema.sql` | Full database schema — run this once in Supabase |
| `.env.local.example` | Template for all environment variables |
| `lib/game-engine.ts` | Core game rule logic |
| `lib/auth.ts` | Authentication config (Google OAuth via NextAuth) |
| `lib/email.ts` | Email sending via Gmail SMTP |
| `app/admin/` | All admin UI routes |
| `app/api/cron/` | Scheduled job handlers |
| `docs/plan.md` | Full architecture and implementation notes |

## Game Rules Reference

The full rules are at: https://quincyassassins.wordpress.com/rules/
