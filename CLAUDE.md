# Tom's Training Hub — Project Spec

This app is being migrated from a Claude.ai artifact (React + local key-value storage) to a real hosted app: **React + Tailwind + Supabase (Postgres) + Vercel**. This document captures everything the artifact version already does, so the rebuild matches it feature-for-feature before extending further.

**Supabase project ID:** `yqprtirfgtdxdmkktoya` — tables already created: `workouts`, `runs`, `meals`, `favorites` (RLS on, zero public policies — app talks to Supabase via service-role key server-side only).

---

## Runner Profile (hardcoded constants)
- Race: **December 13, 2026**
- Also entered: **half marathon, February 28, 2027** — for fun, no dedicated training block
- After Dec 13 the focus becomes **muscle and athleticism** (hypertrophy plus power, speed, agility, conditioning)
- Goal time: **3:30:00** · Goal pace: **8:01/mi**
- Bodyweight: **160 lbs**
- Training block: 27 weeks, Sunday–Saturday training weeks

---

## Design System
- Background `#080808` · Cards `#0f0f0f` · Borders `#242424`
- Text `#f5f5f5` · Muted `#9a9a9a` · Faint `#6b6b6b`
- Accent/primary (electric green) `#00e676` · Danger `#ff5277`
- Dark theme throughout, mobile-first, minimum 44px tap targets
- Font: Inter / system-ui

---

## Data Model

**workouts**: id, date, raw (original text), summary, type (strength|cardio|flexibility|hiit|run|other), exercises[] (name, sets, reps, weight, duration_min, notes), total_duration_min, intensity (low|moderate|high), muscle_groups[], calories_burned_est, feedback, adjustments[], weekly_note, comparison

**runs**: id, date, raw, summary, fields{runType, distance, duration, avgPace, avgHR, maxHR, cadence, elevGain, elevLoss, calories, temp, humidity, surface, shoes, feel, notes}, parsed{distance_mi, duration_min, avg_pace_s_per_mi, avg_hr, calories_burned_est, run_type, feel}, pace_note, feedback, weekly_note

**meals**: id, date, raw, summary, items[] (name, calories_est, protein_g, carbs_g, fat_g), total_calories_est, meal_type, note

**favorites**: key (normalized text), text (display text), count (times logged), manual (bool — explicitly starred)

**exercise_muscles**: key (normalized exercise name), display_name, primary_muscles[], secondary_muscles[], source ('seed' | 'ai'). Keyed by exercise rather than tagged per workout, so correcting a tag fixes every past and future session using that movement. The parser proposes tags for exercises it hasn't met; existing rows are never overwritten.

**week_plans**: week_start (Sunday, PK), plan_week, phase, headline, sessions[] (what the week should contain), assignments{sessionId: date} (where each currently sits), context (the facts packet it was generated from)

---

## Tabs & Features

### Today (home tab — this is the default landing tab)
- **Week plan**: an 11-day strip with today in the middle (5 back, 5 ahead), scrolling sideways and labelled by training week, showing each day's state (done / off-script / missed / today / upcoming) and a card for the selected day. Training weeks stay Sunday–Saturday; the strip stitches together the two or three weeks it touches, and next week is planned as soon as it enters the strip — session title, why it's there, target muscle regions, and exercises with loads anchored to recent top sets. Movements with no history get a one-line form cue and a "new" tag.
- **No off days.** Every day is a training day, and light work is stacked to save time: an easy run carries a mobility / yoga / stretch / core block in the same session, so mobility never takes a day of its own and the freed day goes to a lift or quality work. Recovery comes from easy days staying easy.
- **Run block** on any day with a run: miles, run type, target pace and the breakdown (warm-up / reps / cool-down). Target paces always come from the pace zones in code (`lib/planner/runPlan.ts`), never the model; structured runs also show the easy pace for warm-up and recoveries. Lift muscle chips come from the exercises only, so a pull day doesn't show the run's leg regions.
- **Logging splits by half.** A run + lift day gets "Log run" and "Log lift" (a run + mobility day: "Log run" and "Log mobility"); each flips to ✓ once that half is logged. "Log run" opens the Runs form prefilled (type, distance, pace for steady runs, the plan's target in notes); "Log lift" opens the Log tab one exercise per line. Everything stays editable. "Replan week" forces regeneration.
- **Body Map**: front/back figure, 17 muscle regions, filled by a rolling 7-day window (toggleable to all-time). Gym load fills green, run load teal — running credits quads/hamstrings/glutes/calves, otherwise a marathoner's legs read as neglected. Tap a region for last-trained and set counts.
- Stats (below the plan) — everything in the section that follows, with the trend charts in a snap-scrolling carousel.

### Stats (now a section of the Today tab)
- 7-day / Monthly toggle
- Stat cards: Workouts, Runs, Cal Burned, Cal Consumed, Protein (g), Net Calories
- Muscle Groups Hit — horizontal bar chart, frequency count by muscle group
- Avg Pace / Gym Time mini cards
- Daily Summary — per-day breakdown of workouts/runs/meals in range
- **AI Coaching Summary** — on-demand button generates: headline, summary, wins[], watchouts[], next_week_focus. See "Meal logging gap awareness" below.
- Data Backup — export all data as JSON text (copy/paste), import/restore by merging on id (never deletes)

### Log (workout entry)
- Quick Log chips: Chest Day, Back Day, Leg Day, Shoulders, Arms, Core, Yoga, Rest Day (prefill text, don't auto-submit)
- Date picker (defaults today, can backdate)
- Free-text box, AI-parsed on submit (see AI Behaviors)
- Recent list (last 4 workouts+runs combined)

### Runs
- Structured form, **every field optional**:
  - Run Type chips: Easy, Long, Tempo, Marathon Pace, Interval, Race, Other
  - Distance (mi), Duration (h:mm:ss), Avg Pace (mm:ss), Avg HR, Max HR, Cadence (spm)
  - Elev Gain/Loss (ft), Calories, Temp (°F), Humidity (%), Surface, Shoes, Notes
  - Feel chips: 🔥 Great / 😊 Good / 😐 Okay / 😓 Tough / 💀 Rough
- **Duration & Avg Pace auto-format colons as digits are typed**, building from the right: last 2 digits = seconds, next 2 = minutes, rest = hours. E.g. typing `10517` → `1:05:17`; typing `844` → `8:44`.
- "Copy last run" button prefills type/surface/shoes from most recent run
- "Today's plan" banner with **Use plan** when today has an unlogged planned run
- **Edit**: each recent run (and "Edit run" in History) reopens this form filled in and saves over the original (`PATCH /api/runs/[id]`, no AI call). Of distance / time / pace, whichever wasn't touched is recomputed from the ones that were
- Search bar; pace vs. 8:01 goal color-coded (green=ahead, amber=close, red=slow)

### Fuel (meal entry)
- **Favorites row** at top — meals become favorites two ways: (1) manually starred after logging, (2) automatically once logged 3+ times. Sorted starred-first then by frequency. Tapping a favorite **prefills** the text box (does not auto-submit).
- Date picker, free-text box, AI-parsed on submit
- Today's macro pills: Protein / Carbs / Fat (grams)
- Today's meal list (expandable cards, star toggle, delete)
- Meal history list (older days)

### History (workouts)
- Search bar + type filter chips (all/strength/cardio/hiit/flexibility/run/other)
- Expandable cards: exercise count, calorie estimate, intensity score (X/10, color-coded), muscle group tags (first one highlighted, rest muted)
- Expanded view: per-exercise sub-cards (name, sets×reps, weight, notes), Coach Feedback, **"vs Last Time" comparison**, Adjustments, Pattern note, delete
- **Edit workout**: inline row editor (exercise name, per-set reps × weight, add/remove sets and exercises, date, notes) that saves exactly as typed with no AI call (`PATCH /api/workouts/[id]`); "Re-parse from text" re-runs the parser for bigger rewrites

### Marathon
- Live countdown to race day
- **Current Week/Phase card** — auto-calculated from today's date vs. race date (27 weeks back from Dec 13 2026 = program start). Shows week number, phase name, that week's focus sentence, and a progress bar comparing actual logged weekly mileage to that week's target.
- Pace Targets table (see below)
- Shoe Mileage tracker — aggregates run distance by the `shoes` field per run, warns at 350+ mi (typical shoe lifespan ~300–500mi)
- 27-Week Training Plan — 4 expandable phase cards; **each week row inside is individually expandable**, showing: long run distance, remaining easy/moderate mileage (total − long), and a contextual coaching tip (different for recovery weeks, 20-milers, tempo, marathon-pace, taper, race day, strides — keyword-matched off that week's focus text)
- **3:30 Readiness** — the goal attempt judged on evidence: longest run (target 20mi by wk 24), longest run held at ≤8:15/mi (target 10mi by wk 23), and 3-week average weekly volume (target 30mi by wk 24). Each marker is graded on whether the remaining gap is still closable at a safe rate, not on elapsed time, so a warning arrives while there's time to act. Also shows a Riegel race equivalent from the best logged effort, labelled as a ceiling rather than a prediction.
- Race Day Game Plan (by mile segment)
- Race Fueling Strategy (pre-race, mi 6–22, mi 22–finish, post-race)

---

## Pace Targets
| Zone | Pace | Purpose |
|---|---|---|
| Easy / Recovery | 9:30–10:30/mi | ~80% of runs |
| Long Run | 9:00–9:30/mi | Weekly long run |
| Marathon Pace | 8:01/mi | MP segments |
| Tempo / LT | 7:20–7:40/mi | Threshold work |
| Strides | 6:30–7:00/mi | 2–3× weekly |

## Training Phases
| Phase | Weeks | Mi/wk | Focus |
|---|---|---|---|
| Base Building | 1–8 | 25–35 | Easy aerobic, zone 2, establish routine |
| Stamina | 9–16 | 35–45 | Lactate threshold, MP runs, longer longs |
| Peak | 17–24 | 20–33 | Race simulation, goal-pace volume, peak longs |
| Taper | 25–27 | 12–26 | Reduce volume, maintain sharpness |

**Weeks 18–27 were rescaled in Oct 2026.** The original curve assumed a 40–50mi base that never materialised — actual volume through week 17 averaged ~12mi/wk, so the plan was opening every week 30+ miles behind and the number had stopped meaning anything. The rescaled ramp (20 → 24 → 27 → 22 cutback → 30 → 31 → 33, then taper) is an aggressive but executable build off the real base, front-loading long-run and goal-pace volume because with nine weeks left specific endurance is buildable and a 50mi aerobic base is not. The goal time was **not** changed — the athlete chose to keep the 3:30 attempt on Dec 13 after seeing the analysis.

*(Full week-by-week mileage/long-run/focus-text data for all 27 weeks exists in the current artifact code — pull directly from the `PLAN_PHASES` constant rather than retyping; it's the same array used to drive the countdown, current-week detection, and expandable plan UI.)*

## Race Day Game Plan
- Mi 1–6: Conservative, 8:10–8:15/mi
- Mi 7–13: Settle into 8:01 goal pace
- Mi 14–18: Discipline, check in every 2mi, fuel every 45min
- Mi 19–22: "The race begins," shorten stride if tight
- Mi 23–26.2: Dig in, pick it up if possible

## Fueling Strategy
- Pre-race (2hr out): 200–300 cal familiar food
- Mi 6–22: gel/chew every ~45min, 60g carbs/hr
- Mi 22–finish: sip sports drink, trust glycogen
- Post-race: chocolate milk + banana within 30min, 20–30g protein within 2hr

---

## AI Behaviors (all calls use Claude Sonnet 4.6 via Anthropic API)

**Every AI prompt includes a `todayContext()`** — today's actual weekday/date plus an explicit note that the training week runs Sunday–Saturday, instructing the model to reference *next* week rather than implying days that don't exist if it's late in the week (Fri/Sat). This fixed a real bug where Saturday-logged runs generated advice like "add 2 more runs this week."

**parseWorkout**: structured exercises/type/muscle_groups/intensity/calories + coaching feedback + adjustments + weekly pattern note + **comparison** — checks up to the last 10 workouts for the most recent one sharing a muscle group, names the specific exercise, compares weight/reps/volume, and states days since.

**parseRun**: structured distance/duration/pace/HR/calories/type/feel + pace_note (vs. 8:01 goal) + coaching feedback + weekly pattern note.

**parseMeal**: itemized macros (protein/carbs/fat/calories per item) + meal_type + short supportive note.

**summarizeTraining** (weekly/monthly review): headline + 3-4 sentence summary + wins[] + watchouts[] + next_week_focus. **Includes meal-logging coverage awareness**: computes how many distinct days in the range had ≥1 meal logged, tells the model this reflects logging habits not actual eating, and instructs it to never assume gaps mean "didn't eat" — if coverage is under 50%, gently flag inconsistent logging and encourage more consistent tracking (supportive, not preachy); say nothing if coverage is already good.

---

**generateWeekPlan**: produces one training week's sessions from a context packet that is computed in code (marathon phase and target, miles so far, per-region staleness, inferred lift/run cadence, per-lift top-set anchors) — the model plans, it never infers history. Prompt enforces: no rest days and no blank days, easy runs stacked with mobility/core work, and a strength philosophy rather than a template (`lib/planner/strength.ts`):
- **Dose is computed, exercises are chosen.** `strengthDoseFor()` sets lift-session count and heavy-lower count from block position — Base/Stamina: 4–5 sessions (heavy lower + power/single-leg + heavy push and pull); Peak: 4 (one heavy lower on a quality-run day + three heavy upper); cutback: 3–4, no heavy lower; Taper: 3, half volume at the same load; final 10 days: 2 light upper/core; post-race: 4–5 day hypertrophy + power split. Upper body trains heavy in every phase but the last ten days (Tom's call, Oct 2026: accessory-only days were too light). Never two days in a row without a gym session; the day before the long run is an upper day. A plan more than one lift short of the dose is regenerated once. The model picks the movements.
- **Principles:** hard days hard (heavy legs stacked on a quality run as one `lift_and_run`), easy days easy; heavy low-rep single-leg lower work; calves and hip stability weekly; anti-rotation core twice weekly; dynamic warm-up before key runs, static work after easy runs; pull-biased upper body.
- **Adjusts to the logs:** `recentLifts` drives week-to-week exercise rotation; `adjustments[]` flags (2+ tough/rough runs in 7 days, a rough most-recent run, mileage target ≥1.3× recent volume, no lower-body lifting in 14 days) each change the week and are named in the affected session's rationale.

**Mileage is enforced in code** (`fitWeekToTargets` in `lib/planner/mileage.ts`, on every generation): the long run is set to the block's long-run distance, titles are rewritten to state the miles actually planned, and a week over its target by more than 15% has its easy runs trimmed (never the long run or quality sessions). MP inside a long run stays to the last 3–5 miles in this build.

Placing sessions onto days — and re-placing them when a day goes off plan — is deterministic (`lib/planner/schedule.ts`), so a reshuffle is instant and costs no AI call. Past days freeze. A lift session only counts as done when the regions actually trained overlap what it targeted, so training chest on the planned legs day marks the day off-script and returns legs to the pool. Leg-taxing sessions are kept off the days either side of a key run and spaced apart from each other (placed first, so they get the room).

## Known Bugs Already Fixed (don't reintroduce)
1. **Timezone rollover** — use a local-date helper (year/month/day from `Date` object directly) rather than `.toISOString()` slicing, which rolls to UTC and can shift the date near midnight.
2. **Concurrent write race condition** — in the artifact's key-value storage, firing two async saves back-to-back without awaiting the first caused silent data loss (meals were being overwritten by a near-simultaneous favorites write). With a real Postgres backend this is far less likely, but any client-side optimistic-update + async-persist pattern should still await sequentially rather than fire-and-forget.
3. **Duration/pace fields must not require exact typed colons** — auto-format from raw digit entry (see Runs section above); don't make users type punctuation on mobile.
4. **Delete actions use an undo-toast pattern** (5-second window to undo) rather than a confirm dialog — fewer taps, still safe.

---

## What Tom Actually Needs From You Right Now
1. Rebuild the six tabs above against the existing Supabase schema (already created — don't recreate tables).
2. Wire the AI parsing calls server-side (API routes), reading `ANTHROPIC_API_KEY` from environment variables — never expose it client-side.
3. Match the design system exactly (colors above) — this is a personal app he's used daily for weeks and knows well visually.
4. Preserve the mobile-first, all-optional-fields, minimal-typing philosophy throughout — he logs everything from his phone, often one-handed, often mid-workout or post-run.
