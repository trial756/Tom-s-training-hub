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
  coaching_feedback text
);

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
  run_type text, -- easy | tempo | long | interval | race | recovery | other
  notes text,
  coaching_feedback text
);

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
