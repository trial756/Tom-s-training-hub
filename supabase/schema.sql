-- Tom's Training Hub — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) before starting the app.

create extension if not exists "pgcrypto";

-- ── Workouts ──────────────────────────────────────────────────────────────
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logged_at timestamptz not null default now(),
  raw_text text not null,
  exercises jsonb not null default '[]'::jsonb, -- [{name, sets:[{reps, weight, weight_unit}]}]
  duration_minutes integer,
  notes text,
  coaching_feedback text, -- "Coach Feedback" section
  vs_last_time text, -- "Vs Last Time" section — comparison to the most recent similar workout, null if none found
  adjustments jsonb not null default '[]'::jsonb -- "Adjustments" section — [string]
);

-- Idempotent — safe to re-run against a database created before these columns existed.
alter table workouts add column if not exists vs_last_time text;
alter table workouts add column if not exists adjustments jsonb not null default '[]'::jsonb;
alter table workouts add column if not exists type text; -- e.g. Chest Day, Back Day, Leg Day, Yoga, Rest Day
alter table workouts add column if not exists muscle_groups jsonb not null default '[]'::jsonb; -- [string]
alter table workouts add column if not exists intensity text; -- low | moderate | high
alter table workouts add column if not exists calories_burned_est integer;
alter table workouts add column if not exists summary text; -- one-line AI summary for list views
alter table workouts add column if not exists weekly_note text;

create index if not exists workouts_logged_at_idx on workouts (logged_at desc);

-- ── Runs ──────────────────────────────────────────────────────────────────
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logged_at timestamptz not null default now(),
  raw_text text not null,
  distance_miles numeric,
  duration_seconds integer,
  pace_seconds_per_mile integer,
  avg_hr integer,
  max_hr integer,
  cadence_spm integer,
  elev_gain_ft integer,
  elev_loss_ft integer,
  calories integer,
  temp_f integer,
  humidity_pct integer,
  surface text, -- road | trail | track | treadmill | other
  run_type text, -- Easy | Long | Tempo | Marathon Pace | Interval | Race | Other
  notes text,
  coaching_feedback text, -- "Coach Feedback" section
  vs_last_time text, -- "Vs Last Time" section — comparison to the most recent run of the same type, null if none found
  adjustments jsonb not null default '[]'::jsonb -- "Adjustments" section — [string]
);

-- Idempotent — safe to re-run against a database created before these columns existed.
alter table runs add column if not exists cadence_spm integer;
alter table runs add column if not exists elev_gain_ft integer;
alter table runs add column if not exists elev_loss_ft integer;
alter table runs add column if not exists calories integer;
alter table runs add column if not exists temp_f integer;
alter table runs add column if not exists humidity_pct integer;
alter table runs add column if not exists surface text;
alter table runs add column if not exists vs_last_time text;
alter table runs add column if not exists adjustments jsonb not null default '[]'::jsonb;
alter table runs add column if not exists feel text; -- how the run felt, e.g. Strong, Tired, Sore
alter table runs add column if not exists shoes text;
alter table runs add column if not exists pace_note text; -- pace vs. goal pace commentary
alter table runs add column if not exists summary text; -- one-line AI summary for list views
alter table runs add column if not exists weekly_note text;
-- Interval session detail. Null for non-interval runs. Shape:
-- {mode: 'quick'|'detailed', warmup/cooldown: {distance_miles, pace_seconds_per_mile},
--  work_pace_seconds_per_mile, recovery_pace_seconds_per_mile,  -- quick mode
--  sets: [{reps, distance_value, distance_unit, rep_seconds, recovery_seconds}]} -- detailed mode
alter table runs add column if not exists intervals jsonb;

create index if not exists runs_logged_at_idx on runs (logged_at desc);

-- ── Meals ─────────────────────────────────────────────────────────────────
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logged_at timestamptz not null default now(),
  raw_text text not null,
  meal_type text, -- breakfast | lunch | dinner | snack
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  items jsonb not null default '[]'::jsonb, -- [string]
  notes text,
  coaching_feedback text
);

-- Idempotent — safe to re-run against a database created before this column existed.
alter table meals add column if not exists summary text; -- one-line AI summary for list views

create index if not exists meals_logged_at_idx on meals (logged_at desc);

-- ── Favorites ─────────────────────────────────────────────────────────────
-- Quick-log presets. `type` links back to the source table; `data` stores a
-- snapshot of the structured fields so re-logging doesn't require re-parsing.
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('workout', 'run', 'meal')),
  name text not null,
  raw_text text not null,
  data jsonb not null default '{}'::jsonb
);

-- Idempotent — additive columns for a future meal-only, count-based
-- auto-favoriting model (see CLAUDE.md). Existing type/name/raw_text
-- columns and their NOT NULL constraints are left untouched — the current
-- generic per-type favorites feature keeps working unchanged until it's
-- replaced.
alter table favorites add column if not exists key text; -- dedupe key for auto-favoriting, e.g. normalized meal description
alter table favorites add column if not exists count integer not null default 1; -- times logged, drives auto-favorite threshold
alter table favorites add column if not exists manual boolean not null default false; -- true if user starred it directly
alter table favorites add column if not exists updated_at timestamptz not null default now();

create index if not exists favorites_type_idx on favorites (type);
create unique index if not exists favorites_key_idx on favorites (key) where key is not null;

-- ── Exercise → muscle lookup ──────────────────────────────────────────────
-- Maps a normalized exercise name (see normalizeExerciseName in lib/format)
-- to the fine-grained muscle regions it works, for the body-map avatar and
-- the session planner. Keyed by exercise rather than stored per workout so
-- one correction fixes every past and future session that used the movement.
-- `source` is 'seed' for hand-tagged entries, 'ai' for ones the workout
-- parser proposed the first time it met the exercise.
create table if not exists exercise_muscles (
  key text primary key,
  display_name text not null,
  primary_muscles jsonb not null default '[]'::jsonb, -- [MuscleRegion]
  secondary_muscles jsonb not null default '[]'::jsonb, -- [MuscleRegion]
  source text not null default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Week plans ────────────────────────────────────────────────────────────
-- One persisted plan per Sunday–Saturday training week. Stored rather than
-- regenerated per request so the plan is stable to look at: `sessions` is
-- what the week should contain, `assignments` is which day each session
-- currently sits on. Days that have passed freeze; logging something
-- off-plan re-flows the days still ahead (see lib/planner/schedule.ts).
create table if not exists week_plans (
  week_start date primary key, -- Sunday
  plan_week integer, -- marathon plan week 1-27
  phase text,
  headline text,
  sessions jsonb not null default '[]'::jsonb, -- [PlanSession]
  assignments jsonb not null default '{}'::jsonb, -- {sessionId: date}
  context jsonb, -- the facts packet it was generated from, for explainability
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- This app is single-tenant: all reads/writes go through server-side API
-- routes using the Supabase service role key, which bypasses RLS. RLS is
-- enabled with no policies so the anon/public key (if ever exposed
-- client-side) cannot read or write anything.
alter table workouts enable row level security;
alter table runs enable row level security;
alter table meals enable row level security;
alter table favorites enable row level security;
alter table exercise_muscles enable row level security;
alter table week_plans enable row level security;
