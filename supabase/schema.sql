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

create index if not exists favorites_type_idx on favorites (type);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- This app is single-tenant: all reads/writes go through server-side API
-- routes using the Supabase service role key, which bypasses RLS. RLS is
-- enabled with no policies so the anon/public key (if ever exposed
-- client-side) cannot read or write anything.
alter table workouts enable row level security;
alter table runs enable row level security;
alter table meals enable row level security;
alter table favorites enable row level security;
