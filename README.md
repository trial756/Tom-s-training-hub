# Tom's Training Hub

A mobile-first fitness tracking web app: log workouts, runs, and meals in plain
English, and Claude turns each entry into structured data plus a line of
coaching feedback. Built with Next.js (App Router) + Tailwind CSS, persisted
in Supabase (Postgres), and deployed as a standard web app.

## Tabs

- **Stats** (home) — weekly mileage, workout/run counts, today's macros, 8-week mileage trend, latest coaching feedback.
- **Log** — natural-language strength workout entry (exercises, sets, reps, weight).
- **Runs** — natural-language run entry (distance, pace, HR, run type).
- **Fuel** — natural-language meal entry (calories, macros).
- **History** — combined feed of everything logged, plus saved favorites for one-tap re-logging.
- **Marathon** — static 27-week training plan targeting a Dec 13, 2026 race, 3:30 goal, 8:01/mi pace.

## Stack

- **Next.js 14** (App Router, TypeScript) + **Tailwind CSS** — mobile-first, black theme.
- **Supabase (Postgres)** — persistent storage for `workouts`, `runs`, `meals`, `favorites`.
- **Anthropic API** (`claude-sonnet-4-6`, server-side only) — parses free-text entries into structured fields via a forced tool call, and returns coaching feedback in the same response.

All AI parsing and database access happens in Next.js API routes
(`app/api/**/route.ts`), which run server-side — the Anthropic key and the
Supabase service role key are never sent to the browser.

## Setup

### 1. Create the Supabase project and schema

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run the contents of [`supabase/schema.sql`](./supabase/schema.sql). This creates the `workouts`, `runs`, `meals`, and `favorites` tables (with RLS enabled and no public policies — all access goes through the service role key server-side).
3. From **Project Settings → API**, copy the **Project URL** and the **`service_role` secret key**.

### 2. Get an Anthropic API key

Create a key at [console.anthropic.com](https://console.anthropic.com) if you don't have one.

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the three values:

```bash
cp .env.example .env.local
```

```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Install and run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — resize your browser to a
phone width (or open on an actual phone) to see the intended mobile layout.

## Deploying

This is a standard Next.js app — deploy it anywhere Next.js runs (Vercel is
the simplest path since API routes need a Node.js server, not a static host):

1. Push this repo to GitHub.
2. Import it in [Vercel](https://vercel.com/new).
3. Add the same three environment variables (`ANTHROPIC_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) in the Vercel project settings.
4. Deploy. Every push to your default branch redeploys automatically.

Any other Node-capable host (Render, Railway, Fly.io, a VPS with `next start`,
etc.) works the same way — set the three env vars and run `npm run build && npm start`.

## Notes on the data model

- Every log entry stores the original free-text (`raw_text`) alongside the
  AI-parsed structured fields and a `coaching_feedback` string — so nothing is
  lost if the parse is imperfect, and you can always see what was originally typed.
- `favorites` snapshot the parsed structured data for a past entry, so
  "log again" from History re-inserts a new row instantly without calling
  Claude a second time.
- The marathon plan (`lib/marathonPlan.ts`) is fully static/deterministic —
  it computes each week's date range backward from the race date and requires
  no database or API calls.
