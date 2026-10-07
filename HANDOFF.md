# Handoff — Tom's Training Hub

Running state for picking this up in a fresh session. Read `CLAUDE.md` first
(the project spec); this covers what's true *now* and what isn't finished.

**Last updated:** 2026-10-07 · branch `claude/toms-training-hub-app-oki1z4` ·
HEAD `4519137` · working tree clean, everything pushed.

---

## 1. The decision that frames everything

Tom is 67 days from the **Dec 13 2026 marathon**, goal **3:30:00 (8:01/mi)**.

I ran the analysis on his real logs and told him plainly it isn't achievable:
~12 mi/wk actual against a 40–55 norm, longest run 15mi, best sustained
goal-pace effort 3.13mi, two blank weeks in August. Riegel equivalents from
his best efforts cluster at 3:57–4:14, and those flatter the marathon for a
low-volume runner.

**He considered it and chose to keep both the race and the goal.** That is a
settled decision — do not re-litigate it. The job now is to give the attempt
its best shot and tell him the truth as evidence arrives. He is not fragile
about honest numbers; he asked for them directly.

---

## 2. Current state — all four planned phases shipped

| Phase | What landed |
|---|---|
| 1 | 17-region muscle vocabulary, `exercise_muscles` lookup, resolver |
| 2 | Week planner: context packet, AI generation, deterministic scheduler |
| 3 | Today homepage (plan on top, stats below, chart carousel) |
| 4 | Body map avatar (front/back, 7-day rolling + all-time) |

Plus, after those: mileage reconciler, the 3:30 rescale and readiness
tracker, and the timezone fix.

### Architecture worth knowing

- **Planner split**: facts are computed in code (`lib/planner/context.ts`),
  the model only *plans* (`generateWeekPlan` in `lib/anthropic.ts`), and
  placing/re-placing sessions on days is deterministic
  (`lib/planner/schedule.ts`). A reshuffle costs no AI call.
- **Mileage reconciler** (`lib/planner/mileage.ts`) runs after scheduling.
  The scheduler only *moves* sessions; the reconciler *creates* them when the
  week is short. `PROGRESSION_CEILING = 1.5` — at the original 1.15 it vetoed
  the planned build every week.
- **Muscle tags live in a lookup keyed by normalized exercise name**, not on
  each workout, so one correction fixes all history. 59 keys hand-seeded
  covering his entire back catalogue; the parser files new exercises itself
  and never overwrites existing rows.
- **Dates resolve in `APP_TIMEZONE`** (`America/Chicago`), never machine-local.
  Use `localDateKey` / `startOfLocalDay` / `startOfWeekSunday` / `shiftDays`
  from `lib/format.ts`. Never `setDate` arithmetic — it drifts an hour across
  DST and **Nov 1 is inside this block**.

---

## 3. Verified vs. not

**Verified against live data:** context packet (resolves to Peak wk 18),
scheduler incl. the off-plan reshuffle, mileage reconciler across all three
cases, muscle resolver (chest 20 primary sets vs side delts 0; abs/obliques
never trained), exercise-name normalization against all 64 real names,
weekly bucketing cross-checked in SQL, timezone fix against the exact
mis-dated instant. Charts and the Today/body-map UI screenshot-reviewed at
390px.

**NOT verified live — the main risk:** `generateWeekPlan`. No
`ANTHROPIC_API_KEY` has been available in any container, so the AI call has
never run end to end here. His Oct 6 session suggests it works well in
production (it correctly targeted side delts/traps/abs and introduced Pallof
Press), but nobody has watched a cold `/api/plan` generation.

---

## 4. Open items

1. **Watch the first `/api/plan` generation of a new week.** It's slow (one
   AI call) and untested from cold.
2. **Two junk rows in `runs`**: a duplicate 9/14 interval (6.02mi logged
   twice) and an 8/2 "Easy 5mi" with a 2:36 duration / 14:15 pace — the
   latter is the visible spike in the Pace Trend chart. He knows; deleting
   from History works.
3. **After Dec 13 the lifting prompt should flip.** It currently tells the
   planner that lifting serves running and yields when the week is tight —
   correct for a race build, wrong for an off-season hypertrophy block
   (he asked whether one exercise per muscle is optimal; it isn't for growth,
   only for maintenance during this build).
4. **`week_plans` has no UI for editing a generated session** — he can
   replan the whole week or log off-plan, nothing in between.

---

## 5. Training plan as it now stands

Weeks 18–27 were rescaled off his real base (details and rationale in
`CLAUDE.md`). Peak moved to week 24.

```
wk18 20mi/long15   wk19 24/16   wk20 27/18   wk21 22/13 cutback
wk22 30/20         wk23 31/16   wk24 33/21 peak
wk25 26/14         wk26 18/10   wk27 12/6 race week
```

**The two sessions that decide it:** the long run, and goal-pace volume
inside it (3×2mi at 8:01 → 2×4 → 8 continuous by wk 23).

**Readiness markers** (Marathon tab, `lib/readiness.ts`) as of Oct 7:

| Marker | Now | Target | By | Status |
|---|---|---|---|---|
| Longest run | 15 | 20mi | wk 24 | on track |
| Longest run ≤8:15/mi | 3.1 | 10mi | wk 23 | on track |
| Weekly volume (3wk avg) | 10.8 | 30mi | wk 24 | **behind** |

Graded on whether the remaining gap is closable at a safe weekly rate, not
on elapsed time — an elapsed-time model reads "on track" all block then
flips to "critical" exactly when the warning is useless.

**Decision point: week 23 (Nov 14)**, the 8mi-at-goal-pace session. Hit it
and 3:30 is live; miss it and the smart race is 3:45 pace with a negative
split.

---

## 6. Environment gotchas (these cost real time)

- **Fresh containers have no `.env.local`** (gitignored) and no
  `ANTHROPIC_API_KEY`/Supabase vars. You cannot run the app against live data.
  `npm run build` and `npx tsc --noEmit` work; API routes don't.
- **Supabase MCP works** — use it for migrations (`apply_migration`) and
  queries (`execute_sql`). Project `yqprtirfgtdxdmkktoya`. **Deletes require
  user approval**; inserts don't. Don't leave test rows behind.
- **Verify logic against real data** by pulling rows via MCP into a fixture
  in the scratchpad and running pure functions with `npx tsx`. That's how
  everything here was checked.
- **Playwright**: installed globally, not locally. Load via
  `createRequire(process.env.GLOBAL_NM + '/')` with `GLOBAL_NM=$(npm root -g)`;
  ESM `import` and `NODE_PATH` both fail. Chromium is at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **`_`-prefixed folders in `app/` don't route** (Next treats them as
  private). Name temporary harness pages `something-tmp` and delete them.
- **Deleting a harness page leaves stale `.next/types`** that make `tsc` fail
  on a module that no longer exists — `rm -rf .next` and rebuild.
- Dev server: `NODE_USE_ENV_PROXY=1 nohup npm run dev &`, then
  `curl 127.0.0.1:3000` (not `localhost`). `pkill -f "next dev"` returns exit
  144; that's fine.

---

## 7. Conventions not to break

- Every field on the Runs form is optional, including run type.
- Deletes use the 5-second undo toast, never a confirm dialog.
- Duration/pace inputs auto-format from raw digits — no typed colons.
- Charts: single-series keeps brand accent; 2+ series uses the validated
  colorblind-safe set (amber `#c98100`, blue `#4b9bd4`, magenta `#c364b0`).
  Run the dataviz skill's `validate_palette.js` before adding a new one.
- The per-workout coach stays backward-looking (what you just did); the
  planner owns everything forward-looking. Don't let both speak about the
  week or they'll contradict each other on the same screen.
