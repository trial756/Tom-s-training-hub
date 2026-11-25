import { exerciseKey } from "@/lib/exerciseNames";
import type { PlanExercise } from "@/lib/planner/types";

// ── How to do it ──────────────────────────────────────────────────────
//
// Tom, Nov 2026: "More description of exercises in the plan, especially new
// ones. I don't want to have to look up how to do it — but not a full essay."
// The planner model writes a cue for every exercise (two short sentences for
// a new one, a one-line reminder for a familiar one). These cover the
// movements code adds on its own (volume top-ups, stall breakers, floors)
// and any the model left blank. Setup, then the movement, then one point.

const CUES: Record<string, string> = {
  "Incline Barbell Bench Press": "Bench at 30–45°, grip just outside the shoulders, shoulder blades pinched. Lower to the upper chest, press up and slightly back.",
  "Barbell Bench Press": "Eyes under the bar, shoulder blades back and down, feet planted. Lower to mid-chest, press up in a slight arc.",
  "Machine Incline Press": "Seat so the handles start at upper-chest height, back flat on the pad. Press out without locking hard, lower slowly.",
  "EZ-Bar Skull Crusher": "Lie on a bench, bar above the forehead, upper arms still. Bend at the elbows to lower it toward the forehead, then straighten.",
  "Bent Over Barbell Row": "Hinge to about 45°, flat back, bar hanging at arm's length. Row it to the lower ribs, squeeze, lower under control.",
  "Pull-Up": "Hang with hands just outside the shoulders. Pull the chest toward the bar by driving the elbows down; lower all the way.",
  "Single Arm Lat Pulldown": "One handle on a high cable, kneel or sit tall. Pull the elbow down to your side, then let the lat stretch on the way up.",
  "Narrow Grip Horizontal Cable Pull": "Sit tall, feet braced, close-grip handle at arm's length. Row it to the belly, squeeze the shoulder blades, return slowly.",
  "Barbell Curl": "Stand tall, shoulder-width grip, elbows pinned at your sides. Curl without swinging; lower over two seconds.",
  "Bayesian Curl": "Face away from a low cable, handle in one hand, arm slightly behind you. Curl forward and up; let it stretch back fully.",
  "Barbell Shoulder Press": "Bar at the collarbone, grip just outside the shoulders, glutes tight. Press straight overhead, head through at the top.",
  "Dumbbell Lateral Raise": "Dumbbells at your sides, slight bend in the elbows. Raise out to shoulder height leading with the elbows; lower slowly.",
  "Barbell Shrug": "Hold the bar at arm's length, shoulder-width grip. Shrug straight up toward the ears, pause, lower — don't roll.",
  "Cable Fly": "Cables at chest height, step forward, slight bend in the elbows. Hug the handles together in an arc and squeeze the chest; let them open slowly.",
  "Pec Dec Fly": "Seat so the handles sit at chest height, back flat on the pad. Bring the handles together without bending the elbows more, then open slowly.",
  "Rear Delt Fly": "Face the pec dec pad, handles reversed, arms straight out front. Sweep the arms back to a T with the back of the shoulders; don't shrug.",
  "Lat Pulldown": "Thighs locked under the pad, hands just outside the shoulders. Pull the bar to the top of your chest by driving the elbows down; control it up.",
  "Cable Lateral Raise": "Cable low, handle in the far hand, stand side-on. Raise the arm out to shoulder height, leading with the elbow; lower slowly.",
  "Leg Extension": "Pad on the front of the ankles, knees in line with the machine's pivot. Straighten the legs fully, pause a second, lower slowly.",
  "Leg Curl": "Pad just above the heels, knees in line with the pivot. Curl the heels toward you as far as they go, pause, lower slowly.",
  "EZ-Bar Curl": "Hold the bar on the angled grips, elbows pinned at your sides. Curl to the shoulders without swinging; lower over two seconds.",
  "Tricep Pushdown": "Rope or bar on a high cable, elbows tucked at your sides. Push down until the arms are straight, squeeze, let it back up to 90°.",
  "Seated Calf Raise": "Pad on the knees, balls of the feet on the edge. Drop the heels for a full stretch, pause, then press up as high as you can.",
  "Standing Calf Raise": "Balls of the feet on a step, heels hanging off. Lower until the calves stretch, pause, rise all the way onto the toes.",
  "Close-Grip Bench Press": "Hands shoulder-width on the bar, elbows tucked at about 45°. Lower to the lower chest and press with the triceps to lockout.",
  "Weighted Dip": "Weight on a belt, arms locked on the bars, lean slightly forward. Lower until the shoulders are just below the elbows, press back up.",
  "Dumbbell Incline Press": "Bench at 30°, dumbbells at chest height, palms forward. Press up and slightly in, lower until you feel the chest stretch.",
  "Seated Dumbbell Shoulder Press": "Bench upright, dumbbells at ear height. Press straight up without arching the back; lower to the ears.",
  "Overhead Cable Triceps Extension": "Face away from a high cable, rope behind the head, elbows pointing forward. Straighten the arms overhead, let the rope stretch the triceps back.",
  "Chest-Supported Row": "Chest on an incline bench, a dumbbell in each hand hanging down. Row the elbows back past the ribs, squeeze the shoulder blades, lower.",
  "Single Arm Rear Delt Cable Fly": "Cable at shoulder height, hold it with the opposite hand, arm across the body. Sweep the arm out to the side; lead with the back of the shoulder.",
  "Single Arm Dumbbell Row": "One knee and hand on a bench, back flat. Row the dumbbell to the hip, elbow close to the body; lower to a full stretch.",
  "Straight-Arm Cable Pulldown": "High cable, bar at arm's length, slight hinge at the hips. Keep the arms straight and sweep the bar to the thighs with the lats.",
  "Hammer Curl": "Dumbbells at your sides, palms facing in. Curl up keeping the palms facing each other, elbows still; lower slowly.",
  "Incline Dumbbell Curl": "Lie back on a 45° bench, arms hanging straight down. Curl without letting the elbows drift forward; lower to a full stretch.",
  "Hip Thrust": "Upper back on a bench, bar across the hips, feet flat. Drive the hips up until the body is straight from knees to shoulders, squeeze the glutes.",
  "Back Extension": "Hips on the pad, feet locked, body straight. Hinge down at the hips, then raise to a straight line — not past it.",
  "Goblet Squat": "Hold a dumbbell at your chest, feet shoulder-width. Sit down between the heels, chest up, elbows inside the knees; stand up.",
  "Single-Leg Step-Up": "One foot on a knee-height box. Drive through that heel to stand on the box without pushing off the back foot; step down slowly.",
  "Bulgarian Split Squat": "Back foot on a bench, front foot a stride ahead. Drop the back knee straight down, front shin near vertical; drive up through the front heel.",
  "Romanian Deadlift": "Bar at the hips, soft knees. Push the hips back, sliding the bar down the thighs until the hamstrings stop you; flat back, stand up.",
  "Back Squat": "Bar on the upper back, feet shoulder-width. Sit down and back to at least parallel, knees tracking the toes; drive up.",
  "Box Jump": "Stand a step from a box. Swing the arms, jump up and land softly in a squat; step down, don't jump down.",
  "Broad Jump": "Feet hip-width. Swing the arms back, jump forward as far as you can, land softly with knees bent and hold it.",
  "Pogo Hops": "Stand tall, knees almost straight. Bounce off the balls of the feet with quick, stiff ankles; spend as little time on the ground as possible.",
  "Single-Leg Bound": "From a short run-up, push off one leg and bound forward, landing on the other. Reach with the knee; stop when the snap fades.",
  "Sprint": "Start from a standing split stance. Drive hard with the arms, stay low for the first few steps, then run tall; walk back.",
  "Build-Up Sprint": "Start jogging and build smoothly to about 80% by the end. Relaxed shoulders and hands; walk back.",
  "Lateral Shuffle": "Athletic stance, hips low. Push off the trailing leg to shuffle sideways without crossing the feet; touch the line, come back.",
  "5-10-5 Shuttle": "Three cones five yards apart, start in the middle. Sprint 5 yd and touch, 10 yd back and touch, 5 yd through the middle.",
  "Strides": "After the run: build over 20 seconds to fast but relaxed, then ease off. Walk back and repeat.",
  "Copenhagen Plank": "Side plank with the top leg on a bench, bottom leg hanging. Lift the hips into a straight line; bent top knee on the bench is the easier version.",
  "Side Plank": "On one forearm, elbow under the shoulder, feet stacked. Lift the hips into a straight line and hold; don't let them sag.",
  "Dead Bug": "On your back, arms up, knees over hips. Lower the opposite arm and leg toward the floor keeping the low back pressed down; switch.",
  "Pallof Press": "Stand side-on to a cable at chest height, handle at the chest. Press straight out and hold, resisting the twist; bring it back.",
  "Cable Woodchop": "Cable high, both hands on the handle, side-on. Pull it diagonally down across the body, turning through the hips; control it back.",
  "Hanging Knee Raise": "Hang from a bar, arms straight. Curl the knees toward the chest by tilting the pelvis; lower without swinging.",
  "Suitcase Carry": "Heavy dumbbell in one hand, stand tall. Walk the distance without leaning toward the weight; switch hands.",
  "Ab Wheel Rollout": "Kneel with the wheel under the shoulders. Roll forward as far as the low back stays flat, then pull back with the abs.",
  "Bird Dog": "On hands and knees, back flat. Reach one arm forward and the opposite leg back, pause two seconds, return; switch.",
  "Hollow Hold": "On your back, press the low back into the floor. Lift the shoulders and legs, arms overhead, and hold — lower the legs only as far as the back stays down.",
  "90/90 Hip Stretch": "Sit with both knees bent at 90°, one in front, one to the side. Sit tall and lean over the front shin; switch sides.",
  "Couch Stretch": "Back knee against a wall, shin up the wall, front foot planted. Squeeze the glute and stay tall until the front of the hip stretches.",
  "Leg Swing": "Hold a wall, swing one leg forward and back, relaxed and gradually bigger. Switch legs.",
  "A-Skip": "Skip forward, driving one knee up to hip height while the other foot paws the ground under you. Quick, light contacts.",
  "Walking Lunge": "Step forward into a lunge, back knee just above the floor, then step through into the next one. Stay tall.",
  "World's Greatest Stretch": "Lunge forward, hand inside the front foot. Drop the elbow toward the instep, then rotate that arm to the sky; switch.",
};

const BY_KEY = new Map(Object.entries(CUES).map(([name, cue]) => [exerciseKey(name), cue]));

export function cueFor(name: string): string | null {
  return BY_KEY.get(exerciseKey(name)) ?? null;
}

/** Fills in a how-to wherever an exercise has none. */
export function withCues(exercises: PlanExercise[]): PlanExercise[] {
  return exercises.map((e) => (e.cue?.trim() ? e : { ...e, cue: cueFor(e.name) }));
}
