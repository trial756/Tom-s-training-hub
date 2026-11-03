import type { MuscleRegion } from "@/lib/muscles";
import type { Pattern } from "@/lib/planner/patterns";

// When a lift stalls it stays in, on a new scheme, and one accessory goes in
// beside it that trains its weak link. Chosen from this list so the fix is a
// real one, not whatever the model happens to reach for.

export interface Breaker {
  name: string;
  why: string;
  regions: MuscleRegion[];
}

export const STALL_BREAKERS: Partial<Record<Pattern, Breaker[]>> = {
  horizontal_press: [
    { name: "Close-Grip Bench Press", why: "triceps for lockout", regions: ["triceps", "chest"] },
    { name: "Weighted Dip", why: "triceps and lower chest strength", regions: ["triceps", "chest"] },
    { name: "Dumbbell Incline Press", why: "range and stability on each side", regions: ["chest", "front_delts"] },
  ],
  vertical_press: [
    { name: "Seated Dumbbell Shoulder Press", why: "stability and range without the lower back", regions: ["front_delts", "side_delts", "triceps"] },
    { name: "Cable Lateral Raise", why: "side-delt volume for a stronger press", regions: ["side_delts"] },
    { name: "Overhead Cable Triceps Extension", why: "triceps for lockout overhead", regions: ["triceps"] },
  ],
  horizontal_pull: [
    { name: "Chest-Supported Row", why: "upper back without lower-back fatigue", regions: ["mid_back", "lats", "rear_delts"] },
    { name: "Single Arm Rear Delt Cable Fly", why: "rear delts and upper back for the finish", regions: ["rear_delts", "mid_back"] },
    { name: "Single Arm Dumbbell Row", why: "lats through a longer range", regions: ["lats", "mid_back"] },
  ],
  vertical_pull: [
    { name: "Straight-Arm Cable Pulldown", why: "lat strength without the biceps", regions: ["lats"] },
    { name: "Hammer Curl", why: "elbow flexors that limit the pull", regions: ["biceps", "forearms"] },
  ],
  elbow_flexion: [
    { name: "Incline Dumbbell Curl", why: "biceps from the stretched position", regions: ["biceps"] },
    { name: "Hammer Curl", why: "brachialis and forearms", regions: ["biceps", "forearms"] },
  ],
  elbow_extension: [
    { name: "Overhead Cable Triceps Extension", why: "long head from the stretch", regions: ["triceps"] },
    { name: "Close-Grip Bench Press", why: "heavier triceps loading", regions: ["triceps", "chest"] },
  ],
  hinge: [
    { name: "Hip Thrust", why: "glute lockout", regions: ["glutes", "hamstrings"] },
    { name: "Back Extension", why: "spinal erectors for position", regions: ["lower_back", "glutes"] },
  ],
  squat: [
    { name: "Goblet Squat", why: "position and depth", regions: ["quads", "glutes"] },
    { name: "Single-Leg Step-Up", why: "single-leg strength", regions: ["quads", "glutes"] },
  ],
};
