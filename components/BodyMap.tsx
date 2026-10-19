"use client";

import { memo, useId, useState } from "react";
import type { MuscleRegion } from "@/lib/muscles";

export interface BodyRegionData {
  region: MuscleRegion;
  label: string;
  daysSince: number | null;
  primarySets: number;
  secondarySets: number;
  sessions: number;
  runMiles: number;
  intensity: number;
  source: "lift" | "run";
}

/**
 * An écorché-style figure: individual muscle bellies with fibre texture,
 * drawn here as SVG rather than pulled from licensed artwork. Proportions
 * follow a heroic anatomical reference (broad delts, V-taper, long legs).
 *
 * Coordinates live on a 200×410 canvas centred on x=100. Every shape is
 * authored for the viewer's left half and mirrored, so the figure is
 * symmetrical by construction; centre shapes stop at the midline.
 */
const W = 200;
const H = 410;

// The outer edge, open at the midline. Filled halves overlap the midline by
// a hair (no anti-aliased seam), and only this open edge gets a stroke.
const SILHOUETTE_EDGE =
  "M100 12 C90 12 83 20 83 34 C83 46 86 55 92 63 L90 72 C84 76 70 79 58 82 C46 85 36 92 35 104 " +
  "C34 114 36 122 35 130 C33 142 30 152 28 160 C25 170 23 184 23 198 C22 210 19 222 21 236 " +
  "C23 241 29 241 31 236 C33 230 34 222 36 212 C37 206 38 202 39 198 C42 188 46 176 49 162 " +
  "C52 152 55 140 57 128 C59 122 61 116 62 112 C62 128 66 150 68 176 C69 186 64 196 62 206 " +
  "C61 230 63 258 68 284 C70 296 66 312 67 330 C68 350 73 366 75 380 C74 390 70 398 73 403 " +
  "L94 403 C95 396 93 388 91 380 C91 360 95 340 94 318 C93 300 92 292 92 284 C93 262 95 236 96 214 " +
  "L100 208";
const SILHOUETTE_FILL = `${SILHOUETTE_EDGE} L100.8 208 L100.8 12 Z`;
/** The head — a dark hood, so attention stays on the muscle. */
const HEAD = "M100 12 C90 12 83 20 83 34 C83 46 86 55 92 63 C95 66 98 67 100 67 Z";
/** One eye, slanted slightly; mirrored like everything else. */
const EYE = "M89.5 35.8 C91 34.6 94 34.4 96.4 35.2 C95 36.6 92 37.2 89.5 35.8 Z";
/**
 * Black training shorts, waist to mid-thigh. Drawn over the muscles but under
 * the glow, so trained glutes and upper quads still shine through the fabric.
 */
const SHORTS =
  "M100.8 199 L100 199 C88 199 75 197 64.5 195.5 C61.5 204 59.6 216 59.2 230 C59 238 59.2 245 59.6 251 " +
  "C70 253.5 82 254 95.4 252 C96.3 241 97.2 230 98.6 221 C99.4 219.5 100 219.5 100.8 219.5 Z";
const SHORTS_HEM = "M59.6 251 C70 253.5 82 254 95.4 252";
const SHORTS_WAIST = "M64.5 195.5 C75 197 88 199 100 199";

/**
 * Fibre texture, generated rather than hand-drawn: `n` strokes run from
 * points spread along the origin line to points along the insertion line,
 * bowed sideways by `bow`, and clipped to the muscle. A fan (pec, trap) is
 * just a long origin line meeting a short insertion line.
 */
type Fiber = { from: [number, number, number, number]; to: [number, number, number, number]; n: number; bow?: number };
type Muscle = { d: string; fibers?: Fiber[]; cuts?: string[] };
type Part = { region: MuscleRegion; muscles: Muscle[] };

function fiberPaths(f: Fiber): string[] {
  const out: string[] = [];
  for (let i = 0; i < f.n; i++) {
    const t = (i + 0.5) / f.n;
    const ax = f.from[0] + (f.from[2] - f.from[0]) * t;
    const ay = f.from[1] + (f.from[3] - f.from[1]) * t;
    const bx = f.to[0] + (f.to[2] - f.to[0]) * t;
    const by = f.to[1] + (f.to[3] - f.to[1]) * t;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const bow = f.bow ?? 0;
    const cx = (ax + bx) / 2 + (-(by - ay) / len) * bow;
    const cy = (ay + by) / 2 + ((bx - ax) / len) * bow;
    out.push(`M${ax.toFixed(1)} ${ay.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`);
  }
  return out;
}

// ── Front ────────────────────────────────────────────────────────────
const FRONT: Part[] = [
  {
    region: "side_delts",
    muscles: [
      {
        d: "M51 81 C42 83 35 92 35 104 C35 112 37 119 40 125 C41 116 43 104 46 95 C48 89 50 85 51 81 Z",
        fibers: [{ from: [50, 82, 38, 92], to: [42, 118, 40, 124], n: 6, bow: -1 }],
      },
    ],
  },
  {
    region: "front_delts",
    muscles: [
      {
        d: "M53 82 C48 89 45 99 43 110 C42 116 41 121 41 125 C46 120 52 112 57 104 C60 98 63 92 66 86 C62 83 57 82 53 82 Z",
        fibers: [{ from: [53, 83, 65, 86], to: [41, 122, 43, 121], n: 7, bow: 1.5 }],
      },
    ],
  },
  {
    region: "chest",
    muscles: [
      {
        d: "M99 84 L99 114 C92 118 82 119 72 116 C66 114 62 110 60 106 C59 100 60 94 62 90 C70 86 84 84 99 84 Z",
        // Fans from the sternum and collarbone to the tendon at the armpit.
        fibers: [{ from: [70, 86, 99, 115], to: [60, 99, 62, 106], n: 18, bow: 1.5 }],
      },
    ],
  },
  {
    region: "biceps",
    muscles: [
      {
        d: "M44 126 C40 134 39 146 41 156 C43 160 47 161 50 158 C53 150 55 138 55 128 C52 123 47 122 44 126 Z",
        fibers: [{ from: [44, 126, 54, 127], to: [42, 156, 49, 158], n: 7, bow: -1 }],
        cuts: ["M49 125 C48 138 47 148 46 158"],
      },
    ],
  },
  {
    region: "forearms",
    muscles: [
      {
        // brachioradialis, the ridge along the thumb side
        d: "M28 160 C25 170 24 182 24 195 C26 198 29 198 31 195 C34 184 37 174 40 164 C37 160 32 158 28 160 Z",
        fibers: [{ from: [28, 161, 39, 163], to: [24.5, 195, 30.5, 195], n: 6, bow: 1 }],
      },
      {
        // wrist flexors
        d: "M40 164 C37 174 34 186 31 196 C34 199 37 199 39 196 C42 186 45 176 48 164 C46 160 42 160 40 164 Z",
        fibers: [{ from: [40, 164, 48, 164], to: [31, 196, 39, 196], n: 6, bow: 1 }],
      },
    ],
  },
  {
    region: "obliques",
    muscles: [
      {
        d: "M64 128 C67 142 70 160 72 178 C74 188 77 195 82 201 C85 199 86 195 86 191 L86 126 C80 128 72 129 64 128 Z",
        // External oblique fibres run down and in, like hands in pockets.
        fibers: [{ from: [64, 128, 73, 186], to: [86, 140, 86, 198], n: 11, bow: 0.5 }],
      },
    ],
  },
  {
    region: "abs",
    muscles: [
      ...([
        [119, 135, 87],
        [138, 154, 86.5],
        [157, 173, 87],
        [176, 191, 88],
      ] as const).map(([y0, y1, x]) => ({
        d: `M98.6 ${y0} L${x + 4} ${y0} Q${x} ${y0} ${x - 0.5} ${y0 + 4} L${x} ${y1 - 4} Q${x + 0.5} ${y1} ${x + 4} ${y1} L98.6 ${y1} Z`,
      })),
      { d: "M98.6 194 L92 194 Q88.5 194 89 198 C90 205 93 210 96 213 C97 214 98 214 98.6 214 Z" },
    ].map((m) => ({ ...m, fibers: [{ from: [86, 118, 98.8, 118], to: [86, 214, 98.8, 214], n: 5 }] as Fiber[] })),
  },
  {
    region: "quads",
    muscles: [
      {
        // vastus lateralis
        d: "M62 214 C60 236 61 258 65 276 C67 284 71 289 76 290 C76 270 73 246 70 226 C68 216 65 211 62 214 Z",
        fibers: [{ from: [62, 216, 69, 218], to: [66, 284, 76, 289], n: 7, bow: -1.5 }],
      },
      {
        // rectus femoris, down the middle
        d: "M69 211 C67 230 69 254 74 276 C76 283 79 287 82 287 C85 270 87 248 84 226 C82 214 76 208 69 211 Z",
        fibers: [{ from: [69, 213, 82, 213], to: [76, 285, 82, 286], n: 9, bow: -1 }],
        cuts: ["M76 212 C76 240 78 262 79 285"],
      },
      {
        // vastus medialis, the teardrop above the knee
        d: "M83 250 C81 264 81 280 83 290 C86 295 91 294 93 288 C94 278 93 262 90 252 C88 248 85 247 83 250 Z",
        fibers: [{ from: [83, 251, 90, 252], to: [83, 290, 93, 288], n: 6, bow: 1 }],
      },
    ],
  },
  {
    region: "calves",
    muscles: [
      {
        d: "M86 300 C91 308 95 322 94 338 C93 346 89 349 87 344 C85 332 85 316 85 302 Z",
        fibers: [{ from: [85, 301, 89, 304], to: [87, 345, 94, 339], n: 5 }],
      },
      {
        d: "M69 298 C66 308 65 322 66 336 C67 342 70 342 71 337 C72 324 72 310 72 300 Z",
        fibers: [{ from: [69, 299, 72, 300], to: [66, 337, 71, 338], n: 4 }],
      },
    ],
  },
];

/** Anatomy that sells the figure but isn't one of the 17 tracked regions. */
const FRONT_EXTRAS: Muscle[] = [
  // neck: sternocleidomastoid and the trapezius slope
  { d: "M86 60 C88 66 92 72 97 80 C98 81 99 81 99 79 C97 72 93 64 90 59 Z", fibers: [{ from: [86, 61, 90, 59], to: [97, 80, 99, 79], n: 3 }] },
  { d: "M90 70 C82 75 70 79 58 82 C64 83 70 84 76 84 C84 82 90 79 93 76 Z", fibers: [{ from: [90, 71, 93, 76], to: [59, 82, 74, 84], n: 4 }] },
  // serratus anterior, the "fingers" over the ribs
  ...[0, 1, 2, 3].map((i) => ({
    d: `M${62.5 + i * 0.8} ${112 + i * 5} C${66 + i} ${111 + i * 5} ${70 + i} ${112 + i * 5} ${72 + i} ${115 + i * 5} C${70 + i} ${116.5 + i * 5} ${66 + i} ${116.5 + i * 5} ${63 + i * 0.8} ${116 + i * 5} Z`,
  })),
  // tensor fasciae latae and the sartorius strap crossing the thigh
  { d: "M63 205 C61 212 61 220 62 226 C64 226 66 222 68 214 C68 208 66 204 63 205 Z", fibers: [{ from: [63, 206, 67, 206], to: [62, 225, 64, 225], n: 3 }] },
  { d: "M66 203 C70 204 72 210 76 222 C80 240 85 262 89 282 C90 288 91 292 90 294 C88 294 86 290 85 284 C80 262 75 240 70 222 C68 214 66 208 66 203 Z" },
  // adductors, inner thigh
  { d: "M85 212 C85 226 85 240 86 252 C88 252 90 250 91 248 C93 236 95 224 96 214 C93 209 88 208 85 212 Z", fibers: [{ from: [85, 212, 96, 214], to: [86, 251, 91, 248], n: 5 }] },
  // outer upper arm: brachialis and the lateral triceps showing from the front
  { d: "M37 118 C34 128 33 142 34 152 C35 157 37 160 40 160 C41 150 40 138 41 126 C40 121 39 118 37 118 Z", fibers: [{ from: [36, 119, 40, 122], to: [35, 156, 40, 159], n: 3 }] },
  // tibialis anterior along the shin
  { d: "M73 298 C72 312 73 330 75 348 C76 360 78 370 80 376 C81 376 82 374 82 370 C81 352 80 330 78 310 C77 302 75 297 73 298 Z", fibers: [{ from: [73, 299, 77, 300], to: [79, 374, 82, 372], n: 3 }] },
];

const FRONT_DETAIL = [
  "M24 226 L23.5 237", // fingers
  "M28 228 L27.5 239",
  "M32 226 L32 236",
  "M100 84 L100 116", // sternum
  "M99 78 Q84 79 64 84", // collarbone
  "M99.2 118 L99.2 214", // linea alba
  "M66 196 Q80 208 97 214", // inguinal line
  "M77 290 Q81 286 86 290 Q86 297 81 299 Q77 297 77 290", // kneecap
  "M80 378 Q83 382 87 381", // ankle
];

// ── Back ─────────────────────────────────────────────────────────────
const BACK: Part[] = [
  {
    region: "traps",
    muscles: [
      {
        d: "M100 58 L100 150 C96 136 91 118 86 104 C80 94 70 88 57 84 C68 80 80 76 88 70 C93 65 97 61 100 58 Z",
        // Upper fibres drop to the shoulder; middle and lower converge on the spine.
        fibers: [
          { from: [99, 60, 99, 92], to: [60, 84, 80, 92], n: 9, bow: -1 },
          { from: [99, 100, 99, 148], to: [86, 102, 93, 128], n: 6 },
        ],
      },
    ],
  },
  {
    region: "rear_delts",
    muscles: [
      {
        d: "M55 84 C45 86 37 93 35 104 C38 110 42 112 46 110 C51 102 56 94 62 88 C60 85 58 84 55 84 Z",
        fibers: [{ from: [56, 85, 62, 88], to: [36, 104, 46, 110], n: 6, bow: 1 }],
      },
    ],
  },
  {
    region: "triceps",
    muscles: [
      {
        d: "M45 122 C40 134 39 148 41 158 C44 162 48 162 51 159 C54 150 56 138 56 126 C53 120 48 119 45 122 Z",
        fibers: [{ from: [44, 123, 55, 124], to: [42, 158, 50, 159], n: 7 }],
        // the horseshoe: long and lateral heads meeting the tendon
        cuts: ["M44 126 Q48 142 48 150 Q50 140 55 128", "M48 150 L47 160"],
      },
    ],
  },
  {
    region: "forearms",
    muscles: [
      {
        d: "M30 158 C26 172 24 184 24 196 C27 199 31 198 33 194 C37 184 42 174 47 165 C42 160 35 157 30 158 Z",
        fibers: [{ from: [30, 159, 46, 165], to: [24, 195, 32, 195], n: 7, bow: 1 }],
      },
    ],
  },
  {
    region: "mid_back",
    muscles: [
      {
        // rhomboids, between the shoulder blade and the trap's lower edge
        d: "M84 104 C83 114 84 126 88 138 C92 142 96 144 99 146 C96 134 92 120 86 106 Z",
        fibers: [{ from: [84, 105, 88, 138], to: [87, 106, 99, 146], n: 5 }],
      },
    ],
  },
  {
    region: "lats",
    muscles: [
      {
        d: "M62 112 C62 128 66 148 74 168 C79 176 86 180 92 180 C90 166 88 150 88 140 C86 130 82 122 78 116 C72 112 66 110 62 112 Z",
        // Sweep from the armpit down to the lower back.
        fibers: [{ from: [62, 113, 76, 115], to: [74, 168, 92, 179], n: 10, bow: -2 }],
      },
    ],
  },
  {
    region: "lower_back",
    muscles: [
      {
        // erector spinae, the two columns either side of the spine
        d: "M90 150 C88 164 88 182 89 198 C91 205 95 208 98.8 209 L98.8 150 C96 148 93 148 90 150 Z",
        fibers: [{ from: [90, 150, 98.8, 150], to: [89, 205, 98.8, 209], n: 4 }],
      },
    ],
  },
  {
    region: "glutes",
    muscles: [
      {
        d: "M66 204 C62 216 63 232 70 241 C79 248 92 248 99 240 L99 210 C90 203 77 201 66 204 Z",
        fibers: [{ from: [66, 206, 99, 212], to: [64, 228, 92, 247], n: 10, bow: 1 }],
      },
    ],
  },
  {
    region: "hamstrings",
    muscles: [
      {
        d: "M66 248 C64 264 66 282 71 294 C74 298 78 298 80 294 C81 280 81 264 80 250 C76 245 70 245 66 248 Z",
        fibers: [{ from: [66, 249, 80, 250], to: [71, 294, 80, 294], n: 5 }],
      },
      {
        d: "M83 249 C84 264 85 280 85 294 C87 298 91 298 92 294 C95 278 95 262 93 250 C90 245 86 245 83 249 Z",
        fibers: [{ from: [83, 249, 93, 250], to: [85, 294, 92, 294], n: 5 }],
      },
    ],
  },
  {
    region: "calves",
    muscles: [
      {
        d: "M70 304 C66 316 66 332 69 346 C71 352 76 352 78 346 C80 334 80 318 79 306 C77 300 72 300 70 304 Z",
        fibers: [{ from: [70, 304, 79, 305], to: [70, 348, 78, 347], n: 5 }],
      },
      {
        d: "M82 304 C81 318 82 334 84 346 C86 352 91 352 92 346 C95 332 95 316 92 304 C89 299 84 299 82 304 Z",
        fibers: [{ from: [82, 304, 92, 304], to: [84, 347, 92, 347], n: 5 }],
      },
    ],
  },
];

const BACK_EXTRAS: Muscle[] = [
  // infraspinatus and teres over the shoulder blade
  { d: "M66 92 C72 90 80 94 84 102 C85 110 82 116 76 117 C70 116 64 112 62 106 C62 100 63 95 66 92 Z", fibers: [{ from: [83, 100, 80, 116], to: [64, 96, 63, 108], n: 6, bow: 1 }] },
  // external oblique on the flank, below the lat
  { d: "M66 160 C67 174 67 188 64 200 C68 202 74 202 80 198 C77 188 74 178 72 168 C70 164 68 161 66 160 Z", fibers: [{ from: [66, 162, 71, 166], to: [64, 199, 79, 198], n: 4 }] },
  // outer upper arm and the lower leg (soleus) below the calf
  { d: "M37 118 C34 128 33 142 34 152 C35 157 37 160 40 160 C41 150 40 138 42 124 C41 120 39 118 37 118 Z" },
  { d: "M69 344 C70 356 73 368 76 378 C80 380 86 380 90 378 C92 368 93 356 93 344 C88 352 75 352 69 344 Z", fibers: [{ from: [70, 346, 92, 346], to: [76, 377, 89, 377], n: 5 }] },
  // gluteus medius above the glute
  { d: "M64 196 C66 192 74 190 82 192 C88 194 92 198 94 204 C86 202 76 202 66 204 C64 202 63 199 64 196 Z" },
];

const BACK_DETAIL = [
  "M100 150 L100 210", // spine
  "M72 300 C78 304 86 304 92 300", // back of knee
  "M80 352 Q82 368 83 384", // achilles
];

const MIRROR = `translate(${W} 0) scale(-1 1)`;

type RGB = [number, number, number];
/**
 * Each source is a ramp, not one colour at varying opacity: light load sits
 * deep and dim, heavy load runs bright with a pale core. Colour itself fades
 * as a muscle goes stale, instead of turning see-through.
 */
const RAMPS: Record<"lift" | "run", { low: RGB; high: RGB; peak: RGB }> = {
  lift: { low: [14, 74, 48], high: [0, 230, 118], peak: [178, 255, 210] },
  run: { low: [16, 70, 70], high: [46, 196, 182], peak: [178, 246, 238] },
};
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function shadesFor(source: "lift" | "run", intensity: number) {
  const ramp = RAMPS[source];
  // Linear on purpose: an easing curve lifted light loads until a 0.15
  // forearm glowed nearly as much as a 1.0 chest.
  const t = clamp01(intensity);
  const base = mix(ramp.low, ramp.high, t);
  return {
    base,
    core: mix(base, ramp.peak, 0.45 * t * t),
    edge: mix(base, [8, 8, 8], 0.45),
    line: mix(base, ramp.peak, 0.6),
  };
}

/**
 * Natural muscle tone, lit from above-left: every muscle is always visible,
 * as in an anatomy render. Training doesn't switch a muscle on — it makes it glow.
 */
const MUSCLE = {
  core: [214, 164, 150] as RGB,
  base: [168, 116, 102] as RGB,
  edge: [96, 58, 49] as RGB,
  stroke: "#4a2b24",
  fiber: "rgba(255, 228, 216, 0.26)",
  cut: "rgba(48, 22, 16, 0.6)",
};
function Figure({
  parts,
  extras,
  details,
  data,
  onPick,
  selected,
  label,
}: {
  parts: Part[];
  extras: Muscle[];
  details: string[];
  data: Map<MuscleRegion, BodyRegionData>;
  onPick: (region: MuscleRegion) => void;
  selected: MuscleRegion | null;
  label: string;
}) {
  // Gradient, clip and filter ids must be unique per figure instance.
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${name}-${uid}`;
  const halves = [undefined, MIRROR] as const;

  const trainedParts = parts.filter(({ region }) => (data.get(region)?.intensity ?? 0) > 0);

  /** A muscle with its fibres and grooves, clipped to its own outline. */
  const renderMuscle = (
    m: Muscle,
    clipId: string,
    fill: string,
    stroke: string,
    strokeWidth: number,
    fiberColor: string
  ) => (
    <>
      <path d={m.d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      {(m.fibers?.length || m.cuts?.length) && (
        <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round" pointerEvents="none">
          {m.fibers?.flatMap(fiberPaths).map((p, i) => (
            <path key={`f${i}`} d={p} stroke={fiberColor} strokeWidth={0.35} />
          ))}
          {m.cuts?.map((p, i) => (
            <path key={`c${i}`} d={p} stroke={MUSCLE.cut} strokeWidth={0.9} />
          ))}
        </g>
      )}
    </>
  );

  /** Muscle-tone gradient, pulled toward the glow colour as load rises. */
  const toneStops = (tint: RGB | null, t: number) => {
    const k = tint ? 0.38 * t : 0;
    const lift = (c: RGB) => (tint ? mix(c, tint, k) : c);
    return (
      <>
        <stop offset="0" stopColor={css(lift(MUSCLE.core))} />
        <stop offset="0.55" stopColor={css(lift(MUSCLE.base))} />
        <stop offset="1" stopColor={css(lift(MUSCLE.edge))} />
      </>
    );
  };

  return (
    <div className="flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`${label} muscle map`}>
        <defs>
          {/* The body beneath the muscles reads as deep shadow between them. */}
          <linearGradient id={id("body")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#6a4136" />
            <stop offset="0.5" stopColor="#94604f" />
            <stop offset="1" stopColor="#6a4136" />
          </linearGradient>
          <radialGradient id={id("head")} cx="0.55" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#2a2a2c" />
            <stop offset="1" stopColor="#0c0c0d" />
          </radialGradient>
          <linearGradient id={id("shorts")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a1a1b" />
            <stop offset="1" stopColor="#0b0b0c" />
          </linearGradient>
          <radialGradient id={id("tone")} cx="0.4" cy="0.3" r="0.8">
            {toneStops(null, 0)}
          </radialGradient>
          {/* Halo: wide and soft, spilling past the outline onto the background. */}
          <filter id={id("halo")} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          {/* Rim and energy lines: crisp line with a tight bloom. */}
          <filter id={id("bloom")} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.9" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Glow outside the shorts at full strength, through them faintly. */}
          <mask id={id("bare")} maskUnits="userSpaceOnUse" x="-20" y="-20" width={W + 40} height={H + 40}>
            <rect x="-20" y="-20" width={W + 40} height={H + 40} fill="white" />
            <path d={SHORTS} fill="black" />
            <path d={SHORTS} transform={MIRROR} fill="black" />
          </mask>
          <mask id={id("covered")} maskUnits="userSpaceOnUse" x="-20" y="-20" width={W + 40} height={H + 40}>
            <path d={SHORTS} fill="white" />
            <path d={SHORTS} transform={MIRROR} fill="white" />
          </mask>
          <filter id={id("eyes")} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="1.1" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {parts.map(({ region, muscles }) => {
            const d = data.get(region);
            const trained = !!d && d.intensity > 0;
            return (
              <g key={region}>
                {trained && (
                  <radialGradient id={id(`fill-${region}`)} cx="0.4" cy="0.3" r="0.8">
                    {toneStops(shadesFor(d!.source, d!.intensity).base, clamp01(d!.intensity))}
                  </radialGradient>
                )}
                {muscles.map((m, i) => (
                  <clipPath key={i} id={id(`clip-${region}-${i}`)}>
                    <path d={m.d} />
                  </clipPath>
                ))}
              </g>
            );
          })}
          {extras.map((m, i) => (
            <clipPath key={i} id={id(`clip-extra-${i}`)}>
              <path d={m.d} />
            </clipPath>
          ))}
        </defs>

        {/* silhouette */}
        <g fill={`url(#${id("body")})`}>
          <path d={SILHOUETTE_FILL} />
          <path d={SILHOUETTE_FILL} transform={MIRROR} />
        </g>

        {/* Hood and eyes. */}
        <g pointerEvents="none">
          <g fill={`url(#${id("head")})`}>
            <path d={HEAD} />
            <path d={HEAD} transform={MIRROR} />
          </g>
          <g fill="#f4f8ff" filter={`url(#${id("eyes")})`}>
            <path d={EYE} />
            <path d={EYE} transform={MIRROR} />
          </g>
        </g>

        {/* Halo behind the muscles: it spills out past the body and into the
            gaps between muscles, leaving the muscle itself textured. */}
        <g pointerEvents="none">
          <g filter={`url(#${id("halo")})`}>
            {trainedParts.map(({ region, muscles }) => {
              const d = data.get(region)!;
              const s = shadesFor(d.source, d.intensity);
              const dimmed = selected != null && selected !== region;
              return (
                <g key={region} fill={css(s.base)} opacity={(0.4 + 0.6 * clamp01(d.intensity)) * (dimmed ? 0.35 : 1)}>
                  {halves.map((transform, h) => muscles.map((m, i) => <path key={`${h}-${i}`} d={m.d} transform={transform} />))}
                </g>
              );
            })}
          </g>
        </g>

        {/* Supporting anatomy: muscle-toned, never tappable. */}
        <g pointerEvents="none" opacity={selected ? 0.55 : 1} style={{ transition: "opacity 200ms" }}>
          {halves.map((transform, h) => (
            <g key={h} transform={transform}>
              {extras.map((m, i) => (
                <g key={i}>{renderMuscle(m, id(`clip-extra-${i}`), `url(#${id("tone")})`, MUSCLE.stroke, 0.4, MUSCLE.fiber)}</g>
              ))}
            </g>
          ))}
        </g>

        {parts.map(({ region, muscles }) => {
          const d = data.get(region);
          const trained = !!d && d.intensity > 0;
          const isSelected = selected === region;
          const dimmed = selected != null && !isSelected;
          const fill = trained ? `url(#${id(`fill-${region}`)})` : `url(#${id("tone")})`;

          return (
            <g
              key={region}
              role="button"
              aria-label={d?.label ?? region}
              onClick={() => onPick(region)}
              style={{ cursor: "pointer", opacity: dimmed ? 0.45 : 1, transition: "opacity 200ms" }}
            >
              {halves.map((transform, h) => (
                <g key={h} transform={transform}>
                  {/* Invisible margin around each muscle: the small ones (side
                      delts, forearms) are only ~7px wide on a phone. */}
                  {muscles.map((m, i) => (
                    <path key={`hit${i}`} d={m.d} fill="none" stroke="transparent" strokeWidth="7" pointerEvents="stroke" />
                  ))}
                  {muscles.map((m, i) => (
                    <g key={i}>{renderMuscle(m, id(`clip-${region}-${i}`), fill, MUSCLE.stroke, 0.5, MUSCLE.fiber)}</g>
                  ))}
                </g>
              ))}
            </g>
          );
        })}

        <g stroke="rgba(48, 22, 16, 0.7)" strokeWidth="0.7" fill="none" strokeLinecap="round" pointerEvents="none">
          {details.map((p, i) => (
            <g key={i}>
              <path d={p} />
              <path d={p} transform={MIRROR} />
            </g>
          ))}
        </g>

        {/* Shorts sit over the hips but under the glow. */}
        <g pointerEvents="none">
          <g fill={`url(#${id("shorts")})`}>
            <path d={SHORTS} />
            <path d={SHORTS} transform={MIRROR} />
          </g>
          <g fill="none" stroke="#2c2c2e" strokeWidth="0.8" strokeLinecap="round">
            {[SHORTS_WAIST, SHORTS_HEM].map((p, i) => (
              <g key={i}>
                <path d={p} />
                <path d={p} transform={MIRROR} />
              </g>
            ))}
          </g>
        </g>

        {/* The glow's top layers: a bright rim and energy lines along the
            fibres (the halo sits behind the muscles, above). Brightness follows
            load, so a stale muscle fades back to plain tissue. */}
        <g pointerEvents="none">
          <g mask={`url(#${id("bare")})`}>
          <g filter={`url(#${id("bloom")})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {trainedParts.map(({ region, muscles }) => {
              const d = data.get(region)!;
              const t = clamp01(d.intensity);
              const s = shadesFor(d.source, d.intensity);
              const dimmed = selected != null && selected !== region;
              return (
                <g key={region} opacity={(0.35 + 0.65 * t) * (dimmed ? 0.35 : 1)}>
                  {halves.map((transform, h) => (
                    <g key={h} transform={transform}>
                      {muscles.map((m, i) => (
                        <g key={i}>
                          <path d={m.d} stroke={css(s.line)} strokeWidth={0.6 + 0.5 * t} />
                          {/* Every third fibre lights up — enough to read as current, not hatching. */}
                          <g clipPath={`url(#${id(`clip-${region}-${i}`)})`}>
                            {m.fibers
                              ?.flatMap(fiberPaths)
                              .filter((_, k) => k % 3 === 1)
                              .map((p, k) => <path key={k} d={p} stroke={css(s.core)} strokeWidth={0.45} />)}
                          </g>
                        </g>
                      ))}
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
          </g>
          <g mask={`url(#${id("covered")})`} opacity={0.35}>
          <g filter={`url(#${id("bloom")})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {trainedParts.map(({ region, muscles }) => {
              const d = data.get(region)!;
              const t = clamp01(d.intensity);
              const s = shadesFor(d.source, d.intensity);
              const dimmed = selected != null && selected !== region;
              return (
                <g key={region} opacity={(0.35 + 0.65 * t) * (dimmed ? 0.35 : 1)}>
                  {halves.map((transform, h) => (
                    <g key={h} transform={transform}>
                      {muscles.map((m, i) => (
                        <g key={i}>
                          <path d={m.d} stroke={css(s.line)} strokeWidth={0.6 + 0.5 * t} />
                          {/* Every third fibre lights up — enough to read as current, not hatching. */}
                          <g clipPath={`url(#${id(`clip-${region}-${i}`)})`}>
                            {m.fibers
                              ?.flatMap(fiberPaths)
                              .filter((_, k) => k % 3 === 1)
                              .map((p, k) => <path key={k} d={p} stroke={css(s.core)} strokeWidth={0.45} />)}
                          </g>
                        </g>
                      ))}
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
          </g>
          {/* Selection outline, above the shorts so a selected glute still shows. */}
          {selected &&
            parts
              .filter((p) => p.region === selected)
              .map(({ region, muscles }) => (
                <g key={region} fill="none" stroke="#f5f5f5" strokeWidth="1.3" strokeLinejoin="round">
                  {halves.map((transform, h) => muscles.map((m, i) => <path key={`${h}-${i}`} d={m.d} transform={transform} />))}
                </g>
              ))}
        </g>
      </svg>
      <p className="text-center text-[10px] uppercase tracking-wide text-faint">{label}</p>
    </div>
  );
}

function BodyMap({
  regions,
  window: windowMode,
  onWindowChange,
}: {
  regions: BodyRegionData[];
  window: "7d" | "all";
  onWindowChange: (w: "7d" | "all") => void;
}) {
  const [selected, setSelected] = useState<MuscleRegion | null>(null);
  const data = new Map(regions.map((r) => [r.region, r]));
  const picked = selected ? data.get(selected) : undefined;
  // Tapping the selected muscle again clears the selection and un-dims the figure.
  const pick = (region: MuscleRegion) => setSelected((cur) => (cur === region ? null : region));

  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Body Map</h3>
          <p className="text-[11px] text-faint">
            {windowMode === "7d" ? "Last 7 days — fades as a muscle goes stale" : "Everything you've logged"}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-base-800 p-0.5">
          {(["7d", "all"] as const).map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                windowMode === w ? "bg-accent text-base-950" : "text-muted"
              }`}
            >
              {w === "7d" ? "7 days" : "All time"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Figure parts={FRONT} extras={FRONT_EXTRAS} details={FRONT_DETAIL} data={data} onPick={pick} selected={selected} label="Front" />
        <Figure parts={BACK} extras={BACK_EXTRAS} details={BACK_DETAIL} data={data} onPick={pick} selected={selected} label="Back" />
      </div>

      {/* Legend: one ramp per source, light to heavy — load reads as depth of colour. */}
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-faint">
        {([
          { name: "gym", source: "lift" },
          { name: "running", source: "run" },
        ] as const).map(({ name, source }) => (
          <span key={name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-8 rounded-full"
              style={{
                background: `linear-gradient(to right, ${css(shadesFor(source, 0.1).base)}, ${css(shadesFor(source, 0.6).base)}, ${css(shadesFor(source, 1).core)})`,
              }}
            />
            {name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm border border-[#4a2b24] bg-[#a87466]" /> not trained
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-base-800 p-2.5">
        {picked ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink">{picked.label}</span>
              <span className="text-xs text-muted">
                {picked.daysSince == null
                  ? "never trained"
                  : picked.daysSince === 0
                  ? "today"
                  : `${picked.daysSince}d ago`}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-faint">
              {picked.primarySets} direct {picked.primarySets === 1 ? "set" : "sets"}
              {picked.secondarySets > 0 ? ` · ${picked.secondarySets} assisting` : ""}
              {picked.runMiles > 0 ? ` · ${picked.runMiles} run mi` : ""}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-faint">Tap a muscle to see when you last trained it.</p>
        )}
      </div>
    </div>
  );
}

// Memoised so plan and stats reloads don't redraw the figure; it re-renders
// only when its own regions or window actually change.
export default memo(BodyMap);
