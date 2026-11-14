# Tom's Training Hub — Project Spec

This app is being migrated from a Claude.ai artifact (React + local key-value storage) to a real hosted app: **React + Tailwind + Supabase (Postgres) + Vercel**. This document captures everything the artifact version already does, so the rebuild matches it feature-for-feature before extending further.

**Supabase project ID:** `yqprtirfgtdxdmkktoya` — tables already created: `workouts`, `runs`, `meals`, `favorites` (plus `exercise_muscles`, `week_plans`, `sync_state`, `garmin_daily`, `trusted_devices`, `goals`) (RLS on, zero public policies — app talks to Supabase via service-role key server-side only).

---

## How the app decides (Tom, Nov 2026)
Tom sets a goal; the app prescribes the plan. He does not want to pick exercises or manage the programme.
1. **The goal comes first.** Every week is built backwards from the active goal (a race, a focus, anything added later); lifting, running, mobility and calories all serve it.
2. **No goal set means muscle and athleticism** (`DEFAULT_FOCUS` in `lib/goals.ts`) — never "general fitness".
3. **The plan is fluid.** Structure (phases, doses, floors, caps) is code; what goes inside it re-plans from what is actually logged.
4. **New exercises are welcome.** The planner picks whatever movement best serves the goal, familiar or not; the anchor list is history, not a menu. Don't build exercise menus or preference lists for Tom to manage.

## Runner Profile (hardcoded constants)
- Race: **December 13, 2026**
- Also entered: **half marathon, February 28, 2027** — for fun, no dedicated training block
- After Dec 13 the focus becomes **muscle and athleticism** (hypertrophy plus power, speed, agility, conditioning)
- Goal time: **3:30:00** · Goal pace: **8:01/mi**
- Bodyweight: **158 lbs** (Nov 2026; down from 173 lbs in Feb 2026)
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

**goals** (`lib/goals.ts`, store in `lib/goalsStore.ts`): id, kind ('race' | 'focus'), title, date (race day or focus start), priority (A/B/C), distance_mi, target_seconds, focus ('athleticism' | 'strength' | 'hypertrophy' | 'endurance' | 'general'), notes, plan_key (a hand-built plan in code, e.g. 'dallas-2026' → `buildMarathonPlan`), status. Seeded with the Dallas Marathon (A), the Feb 28 2027 half (C, for fun) and "Muscle & athleticism" (focus from Dec 14 2026); `DEFAULT_GOALS` mirrors them if the table is empty or unreadable. `blockForWeek()` decides what each week is for: **race** (inside an A/B race's build — the hand-built plan if it has one, else a generated build: 18/12/8/6 weeks by distance, climb from 65% of peak with a cutback every 4th week, then a 3/2/1-week taper), **recovery** (2 weeks after a marathon, 1 after a half; a Sunday race's own week counts), **focus** (the latest started focus goal), else **base**. C races get no block, only a heads-up in `upcoming` within 3 weeks. The planner context carries `block` (kind, goal, upcoming) and `marathon` (the race block, whatever the distance — the name predates goals); the strength dose, whole-athlete floors (mobility only during recovery) and the AI's framing (`frameFor`) all follow the block.

**One name per lift** (`lib/exerciseNames.ts`): every grouping (trends, progression, stall checks, "new" tags, muscle lookups) goes through `normalizeExerciseName` → `exerciseKey`, which tidies a name and maps known aliases to the lift's standard name in any word order (`EXERCISE_ALIASES`: e.g. Incline Bench Press / Incline Barbell Press → Incline Barbell Bench Press; Tricep Pulldown / Cable Tricep Pulldown → Tricep Pushdown). Only true synonyms are aliased; a different grip, implement or one-arm version stays its own lift. Stored workouts keep the words as logged; AI-parsed logs are saved under the standard name and the parser is given the standard names. Names with no alias keep their old key, so `exercise_muscles` rows still match; rows under an alias key are also found under the standard key. Add an alias whenever a new variant shows up. A pec dec used for the delts ("pecdec deltoid flys", reverse pec dec) is **Rear Delt Fly**, not Pec Dec Fly; cable flys are their own lift (Nov 13 2026: a rear-delt pec dec logged as Pec Dec Fly put a 50 lb chest fly in the plan).

**water_logs**: id, logged_at, oz (0–200), client_id (unique when set). **push_subscriptions**: endpoint (PK), p256dh, auth.

**weigh_ins** (`lib/weight.ts`): date (PK, one per day; a second weigh-in that day replaces the first), weight_lb, note. Seeded with 173 (Feb 2026, day not recorded) and 158 (Nov 9 2026). The trend is a time-aware moving average (each day moves it 10% toward the scale); the rate is the least-squares slope of the last 28 days. `BODYWEIGHT_LB` stays as the fallback constant.

**Pace zones** (`lib/paceZones.ts`, loaded by `lib/paceZonesStore.ts`): computed on each plan load, not stored. Max HR = highest `max_hr` a run recorded in the last year (150–215 only; default 185); easy cap 80% and long cap 84% of it. Easy and long paces = a recency-weighted (30-day half-life) fit of pace on average HR over the last 90 days of steady runs ≥3 mi (not tempo/interval/MP/race; ≥6 runs, else the offsets below), read at each cap: easy = fit − 0:15 to + 0:45, long = fit at the long cap to + 0:30, clamped to MP + 0:45…3:00. Quality paces hang off a reference MP: the race goal's pace (carried to the marathon by Riegel) while a race block is on, else the best run of the last 12 weeks carried to the marathon (labelled an estimate). Offsets from MP: easy +1:29–2:29, long +0:59–1:29, tempo −0:41–−0:21, intervals −1:01–−0:21 (8:01 gives the original table). The plan carries them (`WeekPlan.zones`); `plannedRunFor(session, zones)` and `runPrefillQuery(…, zones)` read them, defaulting to the fixed table.

**foods** (`lib/foods.ts`): Tom's food library — key (`foodKey`: lower case, no punctuation, portion notes like "(x2)" / "(half)" / "(~1.5 tbsp)" dropped), name (as he wrote it, amount included), calories, protein_g, carbs_g, fat_g, source ('edit' | 'seed' | 'manual'), times_corrected. Filled by meal edits (only items he changed, never the AI's untouched guesses). Seeded Nov 2026 with Dave's Killer Bread Cinnamon Raisin Remix bagel, honey butter and the Chick-fil-A chicken biscuit. **meal_corrections**: meal_id, before {summary, items}, after {summary, items} — every meal edit. Why (Nov 2026): the model doesn't learn from corrections, so the app does — a sliced bagel read as "2 glazed crumb donuts" is in the library and the corrections from then on.

**week_plans**: week_start (Sunday, PK), plan_week, phase, headline, sessions[] (what the week should contain), assignments{sessionId: date} (where each currently sits), context (the facts packet it was generated from)

---

## Sign-in (trusted devices)
One person's app, so no accounts: `middleware.ts` + `lib/deviceAuth.ts`. A passcode (`APP_PASSCODE`, Vercel env) signs a device in once at `/login`; "Trust this device" (default) sets a signed, httpOnly cookie good for ~400 days and re-signed as it's used, so a phone in daily use never signs out; unticked, it's a 12-hour browser session. Each device is a `trusted_devices` row, listed at `/devices` (linked from Progress) where any device can be signed out; revocation reaches the middleware within ~5 minutes. Every page and API route needs a device except `/login`, `/api/auth/login`, the manifest, and the daily Garmin cron (`CRON_SECRET` bearer if set, else Vercel's cron user agent; that route only imports and returns counts). Five wrong passcodes in 15 minutes locks sign-in for 15 minutes. The cookie is signed with a key derived from `SESSION_SECRET`, else the service-role key. With no `APP_PASSCODE` set, the app is open, as before, and `/devices` says so. `components/AuthGuard.tsx` sends the browser to `/login` whenever our own API answers 401, since a page shown from the browser's cache (restored tab, back/forward) never reaches the middleware's redirect.

## Offline
- **The app opens with no signal** (`public/sw.js`, registered by `components/ServiceWorker.tsx` in production; `/sw.js` is public in the middleware). Built assets are cache-first; pages and API reads are network-first with the last good copy as fallback (never a redirect or an error), and the main tabs are warmed when a new worker activates. A page never opened on the phone shows a short offline note. Writes are never handled by the worker.
- **Logging works offline** (`lib/outbox.ts`): workouts, runs (new ones; edits and Garmin confirmations need signal), meals (photo included), weigh-ins and finished workout-mode sessions go through `postOrQueue`. With no connection, or if it drops mid-request, the entry is kept in `localStorage` with its original `logged_at`, the form says it's saved on the phone, and `components/OfflineBar.tsx` (top of every page) shows "Offline · N waiting". The outbox flushes oldest-first on reconnect, on returning to the app and every 30 s while anything waits; a server error retries later, a rejection (4xx) is marked failed with Discard.
- **No duplicates:** every entry carries a `client_id` from the phone; `workouts`, `runs` and `meals` have a unique `client_id` column, and a POST whose id already exists returns the saved row (no second AI call) — `lib/clientId.ts`. Weigh-ins are one per day already.

## Tabs & Features

**Navigation** (`components/BottomNav.tsx`): Today · Progress · **+** · History · Goals. The raised **+** opens the Log sheet (`components/LogSheet.tsx`): Run (`/runs`), Lift or mobility (`/log`), Meal (`/fuel`), and Weigh-in, which saves right in the sheet. The log pages have no tabs of their own; the + is ringed while one is open. Icons live in `components/NavIcons.tsx`.

### Today (home tab — this is the default landing tab)
- **Readiness** (top card, `components/ReadinessCard.tsx`, `GET/POST /api/readiness`, maths in `lib/dailyReadiness.ts` — not `lib/readiness.ts`, which is the 3:30 goal check): a three-tap morning check-in (sleep, energy, soreness, 1–5; the third tap saves; one per day in `readiness_checkins`) and a 0–100 score with up to four reasons and a 7-day dot strip. Parts, each 0–100, averaged over what's there: check-in 50%, load balance 30% (last 7 days vs the 28-day average week; runs use Garmin's training load, else minutes × effort × 0.7; lifts minutes × effort × 0.5; 0.8–1.3 is the sweet spot, >1.5 a red flag; a big day yesterday −10), Garmin 20% when that day has data (morning Body Battery high; last-night HRV vs weekly average). A tough/rough run in the last two days takes 6/12 points off. Today's own training never counts against the morning. Bands: ≥75 Ready to push, 55–74 Train as planned, 35–54 Keep it easy, <35 Back off; on a low day with a hard session planned (key run or heavy legs) the card says to run by effort / cut it short / swap with Replan week. Without a check-in or watch data it's labelled an estimate. Why a check-in: as of Nov 2026 the watch is mostly worn for runs, so Body Battery is there about one day in three and overnight HRV almost never — wearing it overnight would make the Garmin part count.
- **Water** (`components/WaterCard.tsx`, `GET/POST /api/water`, `DELETE /api/water/[id]`, maths in `lib/water.ts`, data in `lib/waterStore.ts` → `water_logs`): quick buttons **12 / 20 / 30 oz** (30 oz is Tom's usual bottle) and **Other** for any amount; each tap logs one drink (offline via the outbox, `client_id` dedupe) with an Undo toast; tap the heading for the target's breakdown and today's drinks (✕ removes, undo toast). Target = 0.5 oz per lb of bodyweight (latest weigh-in) + 16 oz per hour of running (logged, else the plan's miles × 10 min) + 8 oz per lift + 16 oz at 80°F+ / 24 oz at 90°F+ (hottest run that day), rounded to 4 oz. **5pm reminder** (Tom's choice, Nov 2026: one reminder, only if behind): Web Push (`lib/push.ts`, `web-push`; VAPID keys made on first use and kept in `sync_state.vapid`; phones in `push_subscriptions`, gone ones pruned on send; push/click handlers in `public/sw.js`). "Turn on" on the card asks for notification permission and subscribes (`/api/push`). A Vercel cron at 23:00 UTC hits `/api/water/remind` (a cron path in the middleware), which sends only if the day is under 60% of its target and it's 4–7pm in Tyler — so 5pm in winter, 6pm in summer, and on the Hobby plan anywhere within that hour.
- **Week plan**: an 11-day strip with today in the middle (5 back, 5 ahead), scrolling sideways and labelled by training week, showing each day's state (done / off-script / missed / today / upcoming) and a card for the selected day. Training weeks stay Sunday–Saturday; the strip stitches together the two or three weeks it touches, and next week is planned as soon as it enters the strip — session title, why it's there, target muscle regions, and exercises with loads anchored to recent top sets. Movements with no history get a one-line form cue and a "new" tag.
- **No off days.** Every day is a training day, and light work is stacked to save time: an easy run carries a mobility / yoga / stretch / core block in the same session, so mobility never takes a day of its own and the freed day goes to a lift or quality work. Recovery comes from easy days staying easy.
- **Run block** on any day with a run: miles, run type, target pace and the breakdown (warm-up / reps / cool-down). Target paces always come from the pace zones in code (`lib/paceZones.ts` via `lib/planner/runPlan.ts`), never the model; structured runs also show the easy pace for warm-up and recoveries. Lift muscle chips come from the exercises only, so a pull day doesn't show the run's leg regions.
- **Logging splits by half.** A run + lift day gets "Log run" and "Log lift" (a run + mobility day: "Log run" and "Log mobility"); each flips to ✓ once that half is logged. "Log run" opens the Runs form prefilled (type, distance, pace for steady runs, the plan's target in notes); "Log lift" opens the Log tab one exercise per line. Everything stays editable. "Replan week" regenerates only the days still ahead: past days, and today once anything is logged on it, keep their sessions pinned (`frozen`), the model plans from `planFrom` (tomorrow when today is logged), the lift dose is net of gym days already logged this week, and the strength rules count what earlier days already did (a pattern that went heavy Sunday gets its volume day later).
- **Body Map**: front/back figure, 17 muscle regions, filled by a rolling 7-day window (toggleable to all-time). Gym load fills green, run load teal — running credits quads/hamstrings/glutes/calves, otherwise a marathoner's legs read as neglected. Tap a region for last-trained and set counts. Rendering (`components/BodyMap.tsx`, polished Nov 2026): every muscle gets a shared "sheen" overlay (highlight top-left, shade at the far edge) so bellies read as rounded, dark grooves between muscles, a lighter sculpted slate for untrained muscles so the anatomy reads even on an empty week, a glow on the selected muscle, and a soft ground shadow. Tom chose this over a bought 3D model (Nov 2026): a marketplace sculpt has no muscle regions to colour, is heavy for a phone, and shipping it to the browser can breach its license.
- Goal countdown (`GoalCountdown`) below the body map. Stats moved to the Progress tab.

### Progress (tab, `/progress`)
- **Lifts** (`components/LiftProgress.tsx`, `GET /api/lifts`): every lift with 2+ loaded sessions, newest-trained first (six, then "Show all"): status chip (Progressing / Stalled / Slipping / New, from `liftTrends`), best set and e1RM, × bodyweight for compound lifts (latest weigh-in, else `BODYWEIGHT_LB`), last set, and an e1RM sparkline
- **Body**: the weigh-in card (`components/WeightCard.tsx`) and a 14-day water trend (`components/WaterTrend.tsx`, `/api/water?history=1`; bars against today's target)
- **Stats** — everything below, with the trend charts in a snap-scrolling carousel; then signed-in devices and data backup

Refresh signals (`lib/refresh.ts`) gained a `weight` kind for weigh-ins.

#### Stats
- 7-day / Monthly toggle
- Stat cards: Workouts, Runs, Cal Burned, Cal Consumed, Protein (g), Net Calories
- Muscle Groups Hit — horizontal bar chart, frequency count by muscle group
- Avg Pace / Gym Time mini cards
- Daily Summary — per-day breakdown of workouts/runs/meals in range
- **AI Coaching Summary** — on-demand button generates: headline, summary, wins[], watchouts[], next_week_focus. See "Meal logging gap awareness" below.
- Data Backup — export all data as JSON text (copy/paste), import/restore by merging on id (never deletes)

### Workout mode (`/workout`)
- Started from **Start workout** on today's lift session (prefilled from the plan: sets, reps, load, the progression note, a cue for new movements) or **Start a workout** in the Log sheet (empty; add exercises by name). The workout lives on the phone (`localStorage`, `lib/workoutSession.ts`), so it survives switching apps, a locked screen or a reload; a "workout in progress" pill (`components/ActiveWorkoutPill.tsx`) leads back to it from any page.
- Each set: weight (decimal keypad) × reps (number pad) and a 44px ✓. Changing a number carries to the later unticked sets that still had the old one. + Set / − Set, add exercise, notes.
- Ticking a set starts the **rest timer** (bar above the nav: −15 / +15 / Skip), sized by the work: ≤5 reps 3:00, ≤7 2:00, ≤12 1:30, more 1:00, core/mobility 0:45. It runs off an end timestamp, so a sleeping phone still counts it; at zero it buzzes and plays three loud square-wave pips (louder since Nov 2026). The screen is kept awake (Wake Lock) where supported.
- **Holds are timed** (Nov 2026: side planks were being logged as "30 reps"). An exercise prescribed in seconds ("30-40s per side", "1 min") or named as a hold (plank, wall sit, dead hang…) gets a seconds box and **▶ Start**: a countdown bar, and for two-sided holds (per side / each side, side plank, Copenhagen) a 5-second "Switch sides" before the second side; at the end the set ticks itself and the rest starts. Stop cancels; ✓ still logs a set by hand. Timed sets are stored as `seconds` (per side), not reps, and shown as "30s" in History and the parser text.
- **Finish & log** posts the ticked sets to `POST /api/workouts` with `exercises` (stored exactly, standard lift names) and `duration_minutes` (elapsed), plus the matching text for the parser, so coaching and "vs last time" work as for a typed log; a failed save keeps the workout on the phone. Discard uses the undo toast.

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
- **Garmin import** (`lib/garminSync.ts`, Garmin Connect Personal API, key in `GARMIN_PERSONAL_API_KEY`): runs from the watch arrive on their own — synced whenever the app opens or returns to the foreground (server-throttled to every 10 min) plus a daily Vercel cron. One-time backfill from Jun 14 2026 (block start), in chunks. Each Garmin activity is imported once (`runs.garmin_activity_id`, unique) and never rewritten, so app edits stick. A Garmin run on a day with a hand-logged run: within 10% on distance and time → Garmin's numbers, keeping feel/notes/shoes/run type; further apart → the logged numbers stay (blanks filled), entry linked; distances >50% apart → a separate run (double day). New imports take run type from that day's plan (else pace) and the last-used shoes.
- **Confirming Garmin runs** (`lib/runReview.ts`): a new Garmin run from the last 2 days lands as `review_status = 'pending'` — it counts toward mileage, plan and body map at once, but gets no coaching yet. A pop-up (app-wide, `components/PendingRunReview.tsx`) shows it prefilled with the day's plan and Garmin extras; the athlete adds feel, fixes anything and confirms (`POST /api/runs/[id]/confirm`), which writes coaching for the run type they chose — told what the plan had, so an off-plan run is coached as itself with the swap noted. The X closes the pop-up for good and opens the Runs tab, where the run waits prefilled ("Confirm Garmin Run") until confirmed or deleted. When a newer Garmin run arrives, a run still waiting is confirmed as it stands. Backfilled runs never pop up or get coaching. Deleting a Garmin run records its id (`sync_state.garmin_ignored`) so it isn't re-imported. Extras (training effect, load, HR zones, fastest splits, Body Battery change) live in `runs.garmin_data`. Imported runs show a GARMIN tag; Edit works as for any run.
- **Garmin daily wellness** (`lib/garminWellness.ts` → `garmin_daily`, one row per day): Body Battery (charged, drained, daily high/low) and HRV (last-night and weekly average), the only wellness data the personal key returns (`/api/garmin/probe` checks which endpoints answer; sleep, resting HR, VO2 max, stress and weight 404). Rides along with each due sync; backfilled from Jun 14 in 28-day chunks, then the last 7 days refreshed each time. A wellness failure never blocks the run sync.

### Fuel (meal entry)
- **Favorites row** at top — meals become favorites two ways: (1) manually starred after logging, (2) automatically once logged 3+ times. Sorted starred-first then by frequency. Tapping a favorite **prefills** the text box (does not auto-submit).
- Date picker, free-text box, AI-parsed on submit
- **Meal photo**: "Take photo" (an input with `capture="environment"`, so Android opens the camera rather than the gallery) or "Choose photo" (library). The phone shrinks it to 1280px JPEG (`lib/imageResize.ts`, also drops EXIF/location) and it's sent with the text as `image: { media_type, data }` (base64) to `POST /api/meals`; Claude reads the plate, and any typed text wins over the photo (portions, oil, what was actually eaten). Text is optional with a photo. The photo is used for parsing only, never stored; a photo-only meal is saved under Claude's summary as its `raw_text`, so it can be starred and re-logged as text
- **Calorie bar** (`components/CalorieBar.tsx`, `GET /api/calories`; maths `lib/calories.ts`, data `lib/caloriesStore.ts`): eaten / target with "N left" or "N over", the mode, and on tap the breakdown. **Body goal** (Tom, Nov 2026): about **155 lb while adding muscle** (5'8"), kept in `sync_state.body_goal` (`PUT /api/calories`, edited from the weight card's goal row). Target = baseline (14 cal/lb, blended half-and-half with what the log measures — average intake minus the weight trend's 3,500 cal/lb, minus average training — once there are 4+ weigh-ins over 21+ days and meals on 60%+ of 28 days, clamped ±400) + the day's training (Garmin/logged calories, else 0.63 cal per lb per mile and 250 per lift; planned if not yet done) + the mode: **fuel** (6 weeks before an A/B race and its recovery: maintenance), **trim** (trend more than 0.5 lb over goal: −350, none on long-run days), **build** (at goal: +200).
- Today's macro pills: Protein / Carbs / Fat (grams)
- Today's meal list (expandable cards, star toggle, **Edit**, delete)
- **Edit a meal** (`components/MealEditor.tsx`, `PATCH /api/meals/[id]`, no AI call): items (name with the amount, calories, protein, carbs, fat), add/remove items, meal type; totals are the items added up. Items whose name or numbers changed are saved to the **food library** and the edit is stored as a before/after **correction**; the meal's name follows its items and its coaching is cleared (it described the old numbers).
- **My foods** (`components/FoodLibrary.tsx`, `GET/DELETE /api/foods`): collapsible list of what the AI has learned; ✕ forgets a food (undo toast).
- Meal history list (older days)

### History (workouts)
- Search bar + type filter chips (all/strength/cardio/hiit/flexibility/run/other)
- Expandable cards: exercise count, calorie estimate, intensity score (X/10, color-coded), muscle group tags (first one highlighted, rest muted)
- Expanded view: per-exercise sub-cards (name, sets×reps, weight, notes), Coach Feedback, **"vs Last Time" comparison**, Adjustments, Pattern note, delete
- **Edit workout**: inline row editor (exercise name, per-set reps × weight, add/remove sets and exercises, date, notes) that saves exactly as typed with no AI call (`PATCH /api/workouts/[id]`); "Re-parse from text" re-runs the parser for bigger rewrites

### Goals (bottom-nav tab, `/goals`; replaced the Marathon tab)
- "This week" card states what the current week is for (`blockForWeek` summary)
- Races (upcoming, active), Focus, Past sections; each card shows date and days to go, priority (A Main / B Secondary / C For fun), distance, goal time and pace, notes, and "This week: …" when it drives the current week
- Add / edit inline: name, date, distance chips (5K, 10K, Half, Marathon, or custom miles), goal time typed as digits (auto-colons), priority, focus, notes. Mark done / make active; delete uses the undo toast. `GET/POST /api/goals`, `PATCH/DELETE /api/goals/[id]` (`sanitizeGoal` validates)
- **Running zones** card: today's paces and HR caps with where each came from (`/api/goals?zones=1`)
- **Body** card (now on the Progress tab): log a weigh-in (decimal keypad, date defaults today), latest / change since start / lb per week over 4 weeks, trend chart (dots = scale, green line = trend), last five with delete (undo toast). `GET/POST /api/weight`, `DELETE /api/weight/[date]`
- A race with a hand-built plan links to it ("Race plan →" opens `/marathon`, still reachable and highlighted under Goals)
- Today's countdown (`components/GoalCountdown.tsx`) follows the next active race, or the current focus when no race is ahead

### Marathon (`/marathon`, reached from the Dallas goal)
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
The table below is the fallback for the 8:01 goal. Live zones come from the runs and goals (see **Pace zones** above) and show on the Goals tab, the Marathon page and every planned run.

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
Each segment shows the pacing plus what the BMW Dallas Marathon course does there (`RACE_DAY_PLAN` in `lib/marathonPlan.ts`, from the official course map, Nov 2026; hill notes not yet checked against the official elevation profile).
- Mi 1–6: Conservative, 8:10–8:15/mi — downtown → Turtle Creek → Highland Park; flat start in the half-marathon crowd
- Mi 7–13: Settle into 8:01 goal pace — climb over US-75 (~7), Greenville Ave, half splits off ~9, Lakewood rollers (~10), White Rock Lake at 11
- Mi 14–18: Discipline, check in every 2mi, fuel every 45min — White Rock Lake loop; flat, exposed, often windy
- Mi 19–22: "The race begins," shorten stride if tight — Winsted Dr hills (~20), Tokalon/Lakewood back to Skillman; run by effort
- Mi 23–26.2: Dig in, pick it up if possible — Swiss Ave, Gaston, Deep Ellum to the downtown finish; gently downhill, short overpass rises late

The course averages roughly 20–27 ft of climb per mile vs 33–60 ft/mi on Tom's Tyler (Smith County) long-run routes; Dallas's climbing is bunched (US-75 overpass, Lakewood, Winsted at mi 20, late overpasses), Tyler's is spread out.

## Fueling Strategy
- Pre-race (2hr out): 200–300 cal familiar food
- Mi 6–22: gel/chew every ~45min, 60g carbs/hr
- Mi 22–finish: sip sports drink, trust glycogen
- Post-race: chocolate milk + banana within 30min, 20–30g protein within 2hr

---

## AI Behaviors (all calls use Claude Sonnet 4.6 via Anthropic API)

**Every AI prompt includes a `todayContext()`** — today's actual weekday/date plus an explicit note that the training week runs Sunday–Saturday, instructing the model to reference *next* week rather than implying days that don't exist if it's late in the week (Fri/Sat). This fixed a real bug where Saturday-logged runs generated advice like "add 2 more runs this week."

**parseWorkout**: structured exercises/type/muscle_groups/intensity/calories + coaching feedback + adjustments + weekly pattern note + **comparison**. It's told what the plan prescribed that day (`plannedFor(date).session`), and judges against it: an exercise prescribed with no load isn't flagged for having none, and "30s" is a hold, not reps — checks up to the last 10 workouts for the most recent one sharing a muscle group, names the specific exercise, compares weight/reps/volume, and states days since.

**parseRun**: structured distance/duration/pace/HR/calories/type/feel + pace_note (vs. 8:01 goal) + coaching feedback + weekly pattern note.

**parseMeal**: itemized macros (protein/carbs/fat/calories per item, each for the whole amount eaten: "4 cookies" is one item with all four) + meal_type + 1–2 sentences on **the day's nutrition as a whole**, not the meal alone (Tom, Nov 2026: a breakfast eaten in two parts got "add Greek yogurt" an hour after the yogurt, and feedback read everything as run fuel). `lib/mealContext.ts` gives the parser the day around the meal: meals already eaten that day with times and the running totals, training logged and planned that day (tomorrow's too from 3pm), bodyweight with a protein range (1.6–2.2 g/kg), water logged so far, the last 7 days' logged averages framed as logging coverage, **the calorie target** (mode, reason, breakdown) with what was eaten before this meal, what he usually eats later in the day on logged days, and swap material from his own log (his leanest high-protein items, and his heavy regulars). **Over, or on pace to be over, the target → a firm, reasoned warning** (the numbers, why: the 155 goal with muscle, or fuelling in race season) **plus one concrete fix from foods he eats**, with its calories and protein; vague lines ("almost at your limit", "be mindful") are banned; a little wit is welcome, shaming and body words are not (Tom, Nov 2026). It's also given Tom's food library (up to 80 foods, newest first) and his last 8 corrections, and told to use a library food's numbers (scaled to the portion) whenever an item is the same food, to keep its name, not to repeat a corrected mistake, and to say in notes when it used the library. It never suggests a food already eaten today and mentions training only when it matters for that meal (fuel before a long/hard session, recovery after). Items that don't add up to the meal total (>15% off) are scaled to it (`lib/mealItems.ts`). A photo meal is saved under Claude's summary even when text came with it (the text is usually a correction like "ate half"). With a photo, the image goes in the same message (`parseWithTool`'s `image`), with rules to estimate portions from what's in frame, read labels, let the athlete's text win, and flag a photo with no food.

**summarizeTraining** (weekly/monthly review): headline + 3-4 sentence summary + wins[] + watchouts[] + next_week_focus. **Includes meal-logging coverage awareness**: computes how many distinct days in the range had ≥1 meal logged, tells the model this reflects logging habits not actual eating, and instructs it to never assume gaps mean "didn't eat" — if coverage is under 50%, gently flag inconsistent logging and encourage more consistent tracking (supportive, not preachy); say nothing if coverage is already good.

---

**generateWeekPlan**: produces one training week's sessions from a context packet that is computed in code (marathon phase and target, miles so far, per-region staleness, inferred lift/run cadence, per-lift top-set anchors) — the model plans, it never infers history. Prompt enforces: no rest days and no blank days, easy runs stacked with mobility/core work, and a strength philosophy rather than a template (`lib/planner/strength.ts`):
- **Dose is computed, exercises are chosen.** `strengthDoseFor()` sets lift-session count and heavy-lower count from block position — Base/Stamina: 4–5 sessions (heavy lower + power/single-leg + heavy push and pull); Peak: 4 (one heavy lower on a quality-run day + three heavy upper); cutback: 3–4, no heavy lower; Taper: 3, half volume at the same load; final 10 days: 2 light upper/core; post-race: 4–5 day hypertrophy + power split. Upper body trains heavy in every phase but the last ten days (Tom's call, Oct 2026: accessory-only days were too light). Never two days in a row without a gym session; the day before the long run is an upper day. A plan more than one lift short of the dose is regenerated once. The model picks the movements.
- **Principles:** hard days hard (heavy legs stacked on a quality run as one `lift_and_run`), easy days easy; heavy low-rep single-leg lower work; calves and hip stability weekly; anti-rotation core twice weekly; dynamic warm-up before key runs, static work after easy runs; pull-biased upper body.
- **Run-day add-ons get loads too** (Nov 2026): exercises on a run or mobility day (calf raises, hip work) take their load and reps from the log by the same progression rules, so a calf raise last done at 135×10 isn't planned at bodyweight. A lift session's title drops the run's miles ("core & hips", not "core & hips 8mi").
- **Adjusts to the logs:** `recentLifts` drives week-to-week exercise rotation; `adjustments[]` flags (2+ tough/rough runs in 7 days, a rough most-recent run, mileage target ≥1.3× recent volume, no lower-body lifting in 14 days) each change the week and are named in the affected session's rationale.
- **Progression is computed, not guessed** (`lib/planner/progression.ts`): every logged lift gets an e1RM trend (Epley, sets of 1–15 reps) and a status — progressing, stalled (no new best in 3+ sessions over 21+ days) or regressing (last two sessions under 94% of best). For any lift with history the load, reps and a one-line `note` are set in code by double progression (top of range → +5 lb upper / +10 lb lower; inside → one more rep; regressing → hold; fatigued weeks freeze leg jumps); the model's target is overwritten. The trends go to the model as `progress`.
- **Stall breakers** (`lib/planner/stallBreakers.ts`): a stalled or regressing lift gets one complementary movement per week from a fixed list for its pattern (e.g. stalled incline → close-grip bench for lockout), beside its first appearance; if the session already has that pattern, it takes the slot of the isolation exercise it overlaps.
- **Session structure is enforced** (`lib/planner/strengthRules.ts`, after `fitWeekToTargets`): at most one heavy lift per family (push/pull/legs/…) and two per session, each movement pattern heavy once a week (later sessions get its 8–10 volume day), order heavy compound → compound → isolation → core → mobility. Movement patterns live in `lib/planner/patterns.ts`.
- **Whole-athlete floors** (`lib/planner/gaps.ts`, before the strength rules): the Nov 2026 whole-body analysis found legs at ~1.5 sets/week per muscle (squat 1.15× and RDL 1.14× bodyweight vs upper body at or above intermediate), no power or speed work at all, two mobility sessions in eight weeks and easy runs ~98% in zones 3–5. Every week now has floors, scaled by block (`floorsFor`): squat-pattern and hinge sets, calf and hip-stability (Copenhagen / band) sets, max-intent jumps (pogo hops, box/broad jumps), strides on easy runs, and three post-run mobility blocks. Only what's missing is added: heavy legs and jumps go on the lower / quality-run day (never an easy-run day), strides lead easy runs, calves and hips go on any gym day, mobility after runs. Final 10 days: strides and mobility only; post-race floors rise (8 squat, 6 hinge, 2 power). Days already behind us count toward the floors by what was **logged** on them (a kept day with nothing logged counts what it planned) — `doneThisWeek` (Nov 13 2026: calves lifted Thursday on a day the plan had moved its session away from didn't count, so the replan put calves on Friday too).
- **Core variety** (`varyCore` in `lib/planner/gaps.ts`, Tom, Nov 2026: Pallof presses and dead bugs were in nearly every session): no core movement more than twice a week, counting what's done; a third becomes the first unused of cable woodchop, hanging knee raise, suitcase carry, ab wheel rollout, bird dog, hollow hold. Copenhagen planks (the hip floor) are exempt.
- **Easy means easy:** easy runs show a heart-rate ceiling and long runs a slightly higher one (80% / 84% of the max HR the runs have recorded: 148 / 155 from 185), alongside the pace (`lib/paceZones.ts`; `EASY_HR_CAP` / `LONG_HR_CAP` in `runPlan.ts` are the defaults).
- **"new" comes from the full log**, not the planner's 120-day window — any exercise ever logged is never tagged new.

**Mileage is enforced in code** (`fitWeekToTargets` in `lib/planner/mileage.ts`, on every generation): the long run is set to the block's long-run distance, titles are rewritten to state the miles actually planned, and a week over its target by more than 15% has its easy runs trimmed (never the long run or quality sessions). MP inside a long run stays to the last 3–5 miles in this build.

Placing sessions onto days — and re-placing them when a day goes off plan — is deterministic (`lib/planner/schedule.ts`), so a reshuffle is instant and costs no AI call. Past days freeze. A lift session only counts as done when the regions actually trained overlap what it targeted, so training chest on the planned legs day marks the day off-script and returns legs to the pool. Likewise a planned key run (long, tempo, MP, intervals) only counts when a run of that type was logged (a long run also counts at 80% of its distance), so a long run logged as Easy goes off-script and the long run moves to a later day. A run + lift session counts as done when either half matches (Nov 12 2026: heavy legs lifted without the easy run were re-placed whole the next day — the day before the long run — repeating the leg workout); missed run miles come back through the mileage reconciler and a replan nets the lift dose. Hard sessions (key runs by run type — not the model's `taxes_legs` flag — and heavy legs) are placed first, long run first: a model's day preference is honoured only if it keeps hard days apart, and without one the long run takes the latest well-spaced day (usually Saturday) while other hard days go earliest. A preference for a day already past never pushes a key session into a bad slot (Nov 2026: a 20-miler asked for 'Sunday' landed the day after MP intervals + heavy legs). The model is told Sunday is the week's first day and not to name weekdays in titles or rationales, since placement can move.

**Weekly check** (`lib/planner/validate.ts`, every load, after placement and mileage, current and next week): never two hard days in a row (across the week boundary too), no leg work the day before the long run, mileage within 25% of target. It fixes what it can by swapping days still to come (never today, past or frozen days) — each swap must reduce the broken rules — and says so on the card (`adjustNote`); what it can't fix shows as a `warning`, and off-target mileage as a week warning. It also strips weekday names from model text and gives each day a `contextNote` placing it against the long run.

**Race day, the days around it, and recovery** (`lib/planner/raceDays.ts`; Nov 2026 review: the planner didn't know race day existed — Dallas is a Sunday, the first day of the *recovery* week, so the card would have read "easy run", the watch run would have imported as Easy, race week could put its 6-mile "long run" on the Saturday, and recovery resumed running the next day with no cap). Sessions made in code and pinned to a date (`PlanSession.fixedDate`; the scheduler places them there and nowhere else, the weekly check never swaps them, the mileage top-up never touches them): **race day** for every race (a Race-type run at the race distance, so Garmin imports it as Race; logged under any label it counts at 80% of the distance), a **2-mile shakeout with strides the day before**, **walk + mobility two days before** (A/B races, half and up), and **no running after** (3 days after a marathon, 1 after a half). The model is told which days are set (`context.fixedDays`) and plans only the others; extra sessions are dropped by priority. **Race week** (`applyRaceWeekRules`): no long run (it becomes an easy run ≤5 mi), at most one sharpener ≤5 mi placed early, no leg lifting or jumps (strides stay). **Recovery weeks** (`applyRecoveryRules`, after the strength rules; `context.recovery`): easy runs only, capped per run and per week — marathon 3 mi / 8 mi in week 1, 6 / 15 in week 2; half 5 / 12 — legs, calves and jumps out in week 1, two light sets in week 2; dose 2 upper sessions then 3. Recovery covers every week starting within 14 days of a marathon (7 of a half), and a race marked done still gets it. The race's own miles don't count toward the weekly mileage check.

**The muscle & athleticism programme** (`lib/planner/program.ts`, `context.program`; Nov 2026 review: outside a race block the planner had one paragraph of guidance and the marathon-era rules). The standing programme for any focus goal except endurance, and for no goal at all; it never ends, it cycles. `programFor()` finds the week's place by counting focus weeks back to where the block began: **ramp-in** (the first week after a race block or recovery: ~60% of the sets, 4 lifts, one heavy lower, leg loads at 85% via `easeLegLoads`, no load increases, no intervals), then four-week cycles of **build 1/2/3** (hard sets per muscle ×1.0 / 1.2 / 1.4, 5 lifts, two heavy lowers) and a **deload** (~55% of the sets at the same loads, no increases — `hold` in the progression rules). With no goal the cycle is counted from a fixed Sunday. Base weekly hard sets (athleticism): chest 10, back 12, shoulders 8, quads 8, hamstrings 6, biceps 8, triceps 8, calves 6 (hypertrophy higher, strength lower); `fitVolume` counts sets by movement pattern (presses and pulls give the arms half credit, logged days included), adds sets to movements already there (max 5), then a simple extra movement on a fitting day, and trims a group that is well over (min 2 sets). **Athleticism is coded and progresses** (`applyAthletics`): jumps open the squat-led lower day (pogo + box jump → box + broad jump → broad jump + single-leg bounds), sprints and agility open the hinge-led one (5×20 m + lateral shuffles → 5×30 m + 5-10-5 shuttle → 6×30 m); the model's own power work is replaced. **Running is conditioning with set amounts**: two easy runs, an interval session in build weeks (6×1 min → 8×1 min → 5×2 min hard) on the Lower A day, and a long run of 5 mi (4 in ramp-in/deload) that builds to ~80% of the next race of 6+ mi two weeks out (Dec 27 → Feb 28 half: 4, 5, 5, 6, 5, 8, 9, 10, then the race); these feed the same mileage fit, top-up and weekly check as a race block. Order in `generate`: mileage fit → floors → athletics → core variety → volume → strength rules → eased leg loads. A leg curl is a hinge (hamstrings), not a biceps curl (`patterns.ts`).

**Coaching follows the goal** (`lib/coachingFrame.ts`; Nov 2026 review: run coaching and the periodic review said "3:30 marathon, 8:01/mi" in the prompt itself, so the day after Dallas an easy run would still have been judged against marathon pace). `coachingFrameFor(goals)` gives `generateRunCoaching` and `summarizeTraining` their opening from the current week's block: a race build names the race, goal time and pace; recovery has no pace target; a focus block (or no goal) coaches running as conditioning and mentions any race still ahead ("for fun" for a C race). `/api/goals` returns `goalPace` only inside a race block — the Runs page colours pace against it and leaves pace uncoloured otherwise. The Today countdown shows the week's goal; a C race gets a small line under it, never the headline. A race whose day has come and has a run logged covering 80% of its distance is marked done with the result in its notes (`settleRaces` in `/api/goals`, `raceResult`) — Tom never closes a goal by hand. The parseRun bullet above ("vs. 8:01 goal") now means the current goal's pace. The Progress pace chart draws its goal line from the same `goalPace` (no line outside a race block), and once race day has passed the `/marathon` page shows the result in place of the countdown and drops the 3:30 Readiness card.

**Tests** (`tests/*.test.ts`, `npm test`, Node's test runner via tsx) run as part of `npm run build`, so a Vercel build — and therefore a merge — fails if a planner rule breaks. They cover the Nov 4 2026 long-run bug, hard-day spacing, legs before the long run, off-script key runs, replan pinning, the week boundary, the whole-athlete floors and the final ten days. Add a test for every planner bug fixed.

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
