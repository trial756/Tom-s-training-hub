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

// Proportions follow an eight-head athletic figure: head 15–58, shoulders
// ~80, nipples ~110, navel ~158, crotch 210, knees ~298, soles 404.

// The outer edge, open at the midline. Filled halves overlap the midline by
// a hair (no anti-aliased seam), and only this open edge gets a stroke.
const SILHOUETTE_EDGE =
  "M100 15 C91.6 15 86.4 21 86.4 32 C86.4 41.4 88.8 49.2 92.6 55.2 L90.2 61 C89.4 65.6 87.4 70 84 73 " +
  "C79 76 70 78 62 80 C49 82 39 89 36.5 100 C34.8 108 35.6 116 36.4 124 C35.4 134 34.6 145 36.4 156 " +
  "C36.4 160 35.2 163 33.6 166 C30.4 174 28.6 184 28.8 194 C28.8 202 30.6 207 31.6 211 " +
  "C29.6 218 29.6 228 31.6 235 C33.6 240 39.6 241 41.6 237 C42.8 232 42.8 222 41.2 212 " +
  "C42 206 43 200 45 194 C47 184 50 174 52.4 166 C53.6 162 54.4 160 55.4 156 C57.2 146 58.2 134 58.6 124 " +
  "C59 119 59.6 116 60.8 114 C62.8 126 65.6 140 67.8 152 C69.8 162 70.8 170 70 178 C69.2 186 67.2 194 65.2 202 " +
  "C62 212 59.6 226 59.6 240 C59.6 256 62.6 274 67.6 288 C69.6 294 70.6 300 70 306 " +
  "C67.6 316 65.8 326 66.8 336 C67.8 350 71.6 364 73.8 378 C72.8 386 70.2 394 70.2 400 C70.2 403 72 404 75 404 " +
  "L92 404 C93 400 92 394 90 388 C89 384 88.4 380 88.4 376 C88.4 364 90 352 91 340 C92 330 93 320 92.2 312 " +
  "C91.4 306 90.4 302 90.4 298 C91.2 290 92.2 280 93 270 C94 258 95 240 96 226 C96.4 218 97.4 212 100 210";
const SILHOUETTE_FILL = `${SILHOUETTE_EDGE} L100.8 210 L100.8 15 Z`;
/** The head — a dark hood, so attention stays on the muscle. */
const HEAD = "M100 15 C91.6 15 86.4 21 86.4 32 C86.4 41.4 88.8 49.2 92.6 55.2 C95.2 58 97.6 59 100 59 Z";
/** One eye, slanted slightly; mirrored like everything else. Front view only. */
const EYE = "M90 35.4 C91.6 34.2 94.4 34 96.8 34.8 C95.4 36.2 92.4 36.8 90 35.4 Z";
/**
 * Black training shorts, waist to mid-thigh. Drawn over the muscles but under
 * the glow, so trained glutes and upper quads still shine through the fabric.
 */
const SHORTS =
  "M100.8 201 L100 201 C88 201 76 199 66 197.5 C62 206 59.6 218 59.2 232 C59 240 59.2 246 59.6 252 " +
  "C70 254.5 82 255 95.4 253 C96.3 242 97.2 232 98.6 223 C99.4 221.5 100 221.5 100.8 221.5 Z";
const SHORTS_HEM = "M59.6 252 C70 254.5 82 255 95.4 253";
const SHORTS_WAIST = "M66 197.5 C76 199 88 201 100 201";

/**
 * Fibre texture, generated rather than hand-drawn: `n` strokes run from
 * points spread along the origin line to points along the insertion line,
 * bowed sideways by `bow`, and clipped to the muscle. A fan (pec, trap) is
 * just a long origin line meeting a short insertion line.
 */
type Fiber = { from: [number, number, number, number]; to: [number, number, number, number]; n: number; bow?: number };
/** `tone` marks non-muscle tissue: pale tendon and fascia, or plain skin (hands, feet). */
type Muscle = { d: string; fibers?: Fiber[]; cuts?: string[]; tone?: "tendon" | "skin" };
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

// Shared by both views.
const HAND: Muscle = {
  tone: "skin",
  d: "M31.8 210 C29.8 217 29.8 227 31.8 234.5 C33.8 239.5 39.4 240.5 41.4 236.5 C42.6 231 42.6 221 41.1 211 C38 209 34.8 209 31.8 210 Z",
};
const FOOT: Muscle = {
  tone: "skin",
  d: "M74.2 378 C72.8 386 70.6 394 70.6 400 C70.6 403 72.2 403.6 75 403.6 L91.6 403.6 C92.4 400 91.6 394 89.8 388 C89 384 88.6 381 88.6 378 C84 380 79 380 74.2 378 Z",
};

// ── Front ────────────────────────────────────────────────────────────
const FRONT: Part[] = [
  {
    region: "side_delts",
    muscles: [
      {
        d: "M60 81 C48 83 39 90 36.8 101 C35.6 109 36.2 117 38.4 124 C41.4 114 44.6 104 48.6 96 C51.6 90 55.6 85 60 81 Z",
        fibers: [{ from: [59, 82, 38, 96], to: [41, 118, 38.6, 123], n: 7, bow: -1.5 }],
      },
    ],
  },
  {
    region: "front_delts",
    muscles: [
      {
        d: "M63 81.5 C58 83.5 53 88.5 49 96.5 C45 105 42 115 40 124.5 C46 122.6 52 118 56.4 112.4 C59.4 106 61.4 98 64.8 90.4 C65.8 86.4 65 83 63 81.5 Z",
        fibers: [{ from: [62.5, 82.5, 66, 88], to: [40.5, 123.5, 43, 122], n: 8, bow: 1.5 }],
      },
    ],
  },
  {
    region: "chest",
    muscles: [
      {
        // Rounded lower border sweeping up into the tendon at the armpit.
        d: "M99.4 84.5 C90 84 78 84.4 67.6 87.4 C64.4 92.4 62 99 60.8 106 C60.4 109 60.6 111.4 61.6 113.4 C65 117.6 71 121.2 78.6 123 C86.6 124.4 93.4 123.6 99.4 121.6 Z",
        fibers: [{ from: [68, 86.5, 99.6, 121], to: [60.8, 103, 61.8, 112.6], n: 20, bow: 2 }],
      },
    ],
  },
  {
    region: "biceps",
    muscles: [
      {
        d: "M45.6 126 C41.6 134 40.6 145 42.6 153 C44.6 158 47.6 161.4 49.8 163.6 C52 159.6 54.8 152.6 55.8 146.6 C57.4 138.6 57.4 130.6 55.6 126 C52.6 121 48.6 121 45.6 126 Z",
        fibers: [{ from: [45.4, 126.5, 56.4, 127.4], to: [42.6, 155, 52.6, 156], n: 8, bow: -1 }],
        cuts: ["M50.6 124 C49.6 137 49 147 48 157"],
      },
    ],
  },
  {
    region: "forearms",
    muscles: [
      {
        // brachioradialis, the ridge along the thumb side
        d: "M35.4 163.6 C31.6 171.6 29.6 182 29.6 194 C29.8 200 30.8 205 32 209 C33.8 206 35 200 36 194 C38 184 41 175 44.4 167 C41.6 162.4 38.4 161 35.4 163.6 Z",
        fibers: [{ from: [35.4, 164, 43.8, 166.6], to: [30, 196, 35.6, 197], n: 6, bow: 1 }],
      },
      {
        // wrist flexors, tapering into the tendons
        d: "M44.4 167 C41.4 176 38.4 186 36.4 196 C35.4 202 35.4 206 36.2 210 C38.2 211 40.2 211 41.2 209 C43.2 200 46.4 186 51.4 168 C49.4 163.2 46.4 163.2 44.4 167 Z",
        fibers: [{ from: [44.6, 167, 51.2, 168], to: [36.4, 208, 41, 208], n: 7, bow: 1 }],
      },
    ],
  },
  {
    region: "obliques",
    muscles: [
      {
        d: "M70.4 129 C70.8 143 71.4 157 71.4 169 C70.6 181 68.6 191 66.6 199 C72.4 203 79.2 206.4 86.4 208.4 C87 201 87.2 190 87.2 179 L87.2 131 C81.4 132 75.6 131 70.4 129 Z",
        // External oblique fibres run down and in, like hands in pockets.
        fibers: [{ from: [70.4, 130, 69, 196], to: [87.2, 142, 86.6, 207], n: 12, bow: 0.5 }],
      },
    ],
  },
  {
    region: "abs",
    muscles: [
      ...([
        [124, 139, 88.6],
        [142, 157, 88.2],
        [160, 175, 88.6],
        [178, 193, 89.4],
      ] as const).map(([y0, y1, x]) => ({
        d: `M98.6 ${y0} L${x + 4} ${y0} Q${x} ${y0} ${x - 0.4} ${y0 + 4} L${x} ${y1 - 4} Q${x + 0.4} ${y1} ${x + 4} ${y1} L98.6 ${y1} Z`,
      })),
      { d: "M98.6 196 L93.4 196 Q89.8 196 90.2 200 C91 207 93.6 212 96.2 215 C97.2 216 98 216 98.6 216 Z" },
    ].map((m) => ({ ...m, fibers: [{ from: [88, 122, 98.8, 122], to: [88, 216, 98.8, 216], n: 5 }] as Fiber[] })),
  },
  {
    region: "quads",
    muscles: [
      {
        // vastus lateralis
        d: "M63.4 213 C60.4 231 60.2 251 63.2 269 C65.2 279 69.2 287 74.2 291.4 C75.2 275 73.2 251 70.2 231 C68.6 219 66.4 213 63.4 213 Z",
        fibers: [{ from: [63.4, 215, 69.6, 217], to: [66, 284, 74, 290], n: 8, bow: -1.5 }],
      },
      {
        // rectus femoris, down the middle
        d: "M70.4 211 C68.4 229 70.2 253 75.2 275 C77.2 283 79.6 287.6 82.6 288.4 C85.4 271 87.2 249 85.4 229 C83.4 217 78.4 209 70.4 211 Z",
        fibers: [{ from: [70.4, 213, 84, 214], to: [76, 284, 82.4, 287], n: 10, bow: -1 }],
        cuts: ["M77.6 211 C77.4 239 79 263 80 286"],
      },
      {
        // vastus medialis, the teardrop above the knee
        d: "M85.2 251 C83.2 265 83 279 85 289.6 C88 295.4 92.2 294.6 93.2 288.6 C94.2 278.6 93.2 263.6 91.2 254.6 C89.2 249.6 87.2 248.6 85.2 251 Z",
        fibers: [{ from: [85.2, 252, 91.2, 253], to: [85, 290, 93, 288], n: 6, bow: 1 }],
      },
    ],
  },
  {
    region: "calves",
    muscles: [
      {
        // medial head of the gastrocnemius, bulging on the inside
        d: "M88.2 303 C92.6 310 93.6 322 92.6 334 C92 342 90 348 88 353 C86.4 346 85.4 334 85.4 320 C85.4 312 86 306 88.2 303 Z",
        fibers: [{ from: [86.4, 305, 89.4, 306], to: [86.6, 344, 92, 337], n: 5 }],
      },
      {
        // soleus and peroneals along the outside
        d: "M71 306 C68.4 316 67.2 328 68 340 C69 350 71.4 356 73 359 C73.8 344 74 322 73.4 307 Z",
        fibers: [{ from: [70.8, 307, 73, 307], to: [68.4, 341, 72.6, 346], n: 4 }],
      },
    ],
  },
];

/** Anatomy that sells the figure but isn't one of the 17 tracked regions. */
const FRONT_EXTRAS: Muscle[] = [
  // neck: the trapezius slope, then sternocleidomastoid over it
  { d: "M90.4 59 C89.4 66 86.6 70.6 82.6 73.6 C76 76.6 69 78.6 62.6 80.6 C70 83 78 84 86 83.4 C91.4 81 95.4 78 98.2 75 C95.4 70 92.6 64.6 90.4 59 Z", fibers: [{ from: [90.4, 60, 98, 75], to: [63, 80.6, 84, 83.4], n: 5 }] },
  { d: "M90.4 55.6 C91.4 63 94.4 71 98.4 79.6 C99.2 81 99.8 80 99.8 78.4 C98.6 70 95.6 61 92.8 54.6 Z", fibers: [{ from: [90.4, 56, 92.8, 55], to: [98.4, 79.6, 99.8, 78.4], n: 3 }] },
  // serratus anterior, the "fingers" over the ribs
  ...[0, 1, 2, 3].map((i) => ({
    d: `M${62.2 + i * 0.9} ${115 + i * 4.6} C${66 + i} ${113.6 + i * 4.6} ${70.4 + i} ${114.6 + i * 4.6} ${72.4 + i * 0.6} ${117.6 + i * 4.6} C${70.4 + i} ${119.4 + i * 4.6} ${66 + i} ${119.4 + i * 4.6} ${62.8 + i * 0.9} ${118.8 + i * 4.6} Z`,
  })),
  // tensor fasciae latae and the sartorius strap crossing the thigh
  { d: "M64.4 203 C62 211 61.4 220 62.4 227 C64.6 227 66.6 223 68.4 214 C68.6 208 67 203 64.4 203 Z", fibers: [{ from: [64.4, 204, 68, 205], to: [62.6, 226, 64.6, 226], n: 3 }] },
  { d: "M67 202 C71 203 73 209 77 221 C81 239 86 261 90 281 C91 287 92 291 91 293.4 C89 293.4 87 289.4 86 283.4 C81 261 76 239 71 221 C69 213 67 207 67 202 Z" },
  // adductors, inner thigh
  { d: "M86.2 213 C86.2 227 86.2 241 87.2 251 C89.2 251 91.2 249 92.2 246 C94.2 235 95.2 223 96.2 215 C93.2 210 89.2 209 86.2 213 Z", fibers: [{ from: [86.2, 213, 96.2, 215], to: [87.2, 250, 92.2, 246], n: 5 }] },
  // brachialis and the lateral triceps showing on the outer arm
  { d: "M38.6 123 C36.6 132 35.6 143 36.6 153 C37.6 157.6 39.6 159 41.8 157 C40.8 148 41 136 43.2 126.6 C42 123.6 40.2 122.4 38.6 123 Z", fibers: [{ from: [38.4, 124, 42.6, 126], to: [37, 154, 41.4, 156.6], n: 3 }] },
  // the elbow crease, between upper arm and forearm
  { d: "M38.6 156 C41 160 45.4 163.4 49.8 163.6 C52 162.4 54 160 55.4 156 C54.6 160 53.6 163.4 52.4 166.4 C47.6 168.4 40.4 167.4 35.4 164 C36.6 161.4 37.8 158.6 38.6 156 Z" },
  // tibialis anterior along the shin
  { d: "M73.8 303 C72.8 319 73.8 337 75.8 353 C76.8 365 78.8 373 80.8 377 C81.8 376 82.8 373 82.8 369 C81.8 351 80.8 331 79.8 313 C78.8 305 76.8 302 73.8 303 Z", fibers: [{ from: [73.8, 304, 78.6, 305], to: [80.6, 376, 82.6, 370], n: 4 }] },
  // the tibia's inner face, between tibialis and calf
  { tone: "skin", d: "M80.6 314 C82.2 330 83.4 348 83.6 366 C83.8 372 84.6 376 86 378 C86.6 368 86.6 352 86 336 C85.6 324 84.8 314 83 306 C81.6 306 80.6 309 80.6 314 Z" },
  // kneecap and patellar tendon
  { tone: "skin", d: "M77.4 290 C79.8 287.4 84.4 287.4 87 290 C88 295 87 300 84.4 303.4 C81.6 304.6 78.8 303.6 77 300.6 C76 297 76 293 77.4 290 Z" },
  // wrist tendons
  { tone: "tendon", d: "M36.4 202 C36 205 36 208 36.4 210 C38.4 211 40.4 211 41.2 209 C41.6 206 42 203 42.4 200 C40.4 201 38.4 201.6 36.4 202 Z" },
  HAND,
  FOOT,
];

const FRONT_DETAIL = [
  "M33.6 224 L33.4 235", // fingers
  "M36.6 225 L36.4 237",
  "M39.4 224 L39.4 235",
  "M99.6 84 L99.6 122", // sternum
  "M99 78.6 Q84 79.4 63.6 83.6", // collarbone
  "M99.2 123 L99.2 216", // linea alba
  "M67 198 Q81 210 97.4 216", // inguinal line
  "M80 380 Q83 384 87 383", // ankle
  "M76 398 L76 403", // toes
  "M80 398.6 L80 403.4",
  "M84 398.8 L84 403.4",
];

// ── Back ─────────────────────────────────────────────────────────────
const BACK: Part[] = [
  {
    region: "traps",
    muscles: [
      {
        // Diamond from the skull to mid-back, flaring out to the shoulder.
        d: "M100 54 L100 154 C97 142 92.4 126 87.4 112 C82.4 100 73.4 91 61.4 84.6 C70.4 80.6 80.4 76.6 87.4 70.6 C92.4 65.6 96.4 59.6 100 54 Z",
        fibers: [
          { from: [99.6, 56, 99.6, 94], to: [62, 84.6, 81, 94], n: 10, bow: -1 },
          { from: [99.6, 102, 99.6, 152], to: [87, 104, 94, 130], n: 7 },
        ],
      },
    ],
  },
  {
    region: "side_delts",
    muscles: [
      {
        d: "M37 101 C35.8 109 36.4 117 38.6 123.6 C41.6 119 45.6 114.6 49 111 C44.6 112.6 39.6 109 37 101 Z",
        fibers: [{ from: [37, 102, 48.6, 111], to: [38.6, 122, 40.6, 120], n: 4 }],
      },
    ],
  },
  {
    region: "rear_delts",
    muscles: [
      {
        d: "M60 82.6 C48 84.6 39 91.6 36.8 102.6 C39.8 109.6 44.8 112.6 48.8 110.6 C52.8 102.6 57.8 94.6 63.8 88.6 C62.8 85.6 61.8 83.6 60 82.6 Z",
        fibers: [{ from: [60.6, 83.6, 63.8, 88.6], to: [37, 102.6, 48.6, 110.6], n: 7, bow: 1 }],
      },
    ],
  },
  {
    region: "triceps",
    muscles: [
      {
        d: "M42.6 121.6 C38.6 133.6 37.6 145.6 39.6 155.6 C42.6 160.6 48.6 160.6 52.6 156.6 C55.6 147.6 57.6 135.6 56.6 124.6 C52.6 118.6 46.6 117.6 42.6 121.6 Z",
        fibers: [{ from: [42, 122.6, 56, 124], to: [40, 155.6, 52, 156.6], n: 8 }],
        // the horseshoe: long and lateral heads meeting the flat tendon
        cuts: ["M42.6 126 Q47.6 142 48.6 149 Q50.6 140 55.6 127"],
      },
    ],
  },
  {
    region: "forearms",
    muscles: [
      {
        // extensors, tapering into the wrist
        d: "M35.4 163.6 C31.4 173.6 29.6 185.6 30 197.6 C31 204.6 33 209 35.2 210 C38.2 205 41.2 196 44.2 186 C47.2 178 50.2 172 52.2 166 C47.2 161 40.4 160 35.4 163.6 Z",
        fibers: [{ from: [35.4, 164, 51.6, 166], to: [30.4, 198, 36.6, 204], n: 8, bow: 1 }],
      },
    ],
  },
  {
    region: "mid_back",
    muscles: [
      {
        // rhomboids, between the shoulder blade and the trap's lower edge
        d: "M85.6 105 C84.6 115 85.6 127 89.6 139 C93.6 143 97 145 99.6 147 C96.6 135 92.6 121 86.6 107 Z",
        fibers: [{ from: [85.6, 106, 89.6, 139], to: [86.6, 107, 99.6, 147], n: 5 }],
      },
    ],
  },
  {
    region: "lats",
    muscles: [
      {
        // The wing: armpit sweeping wide and down to the lower back.
        d: "M61.6 111 C61.6 128 64.6 146 68.6 162 C71.6 174 77 184 84 190.6 C86.6 186 88.6 176 89.4 166 C89.6 156 88.6 146 87.4 138 C85.4 128 81.4 120 75.4 115.6 C70.4 112.6 65.6 111 61.6 111 Z",
        fibers: [{ from: [61.6, 112, 76, 115], to: [68.6, 162, 88, 186], n: 12, bow: -2 }],
      },
    ],
  },
  {
    region: "lower_back",
    muscles: [
      {
        // erector spinae, the two columns either side of the spine
        d: "M90.2 150 C88.2 164 88.2 182 89.2 198 C91.2 205 95.2 208 99 209 L99 150 C96.2 148 93.2 148 90.2 150 Z",
        fibers: [{ from: [90.2, 150, 99, 150], to: [89.2, 205, 99, 209], n: 4 }],
      },
    ],
  },
  {
    region: "glutes",
    muscles: [
      {
        // Rounded gluteus maximus.
        d: "M66.6 205 C62.6 214 62.6 228 66.6 238 C72.6 248 86.6 250 99.4 244 L99.4 210 C92.4 204 80.4 201 66.6 205 Z",
        fibers: [{ from: [67, 206, 99, 212], to: [65, 230, 92, 248], n: 11, bow: 1.5 }],
      },
    ],
  },
  {
    region: "hamstrings",
    muscles: [
      {
        // biceps femoris
        d: "M64.4 246 C62.4 262 64.4 280 70.4 293 C73.4 298 77.4 298 79.4 294 C80.4 280 80.4 264 79.4 250 C75.4 245 69.4 244 64.4 246 Z",
        fibers: [{ from: [64.4, 247, 79.4, 250], to: [70.4, 293, 79.4, 294], n: 6 }],
      },
      {
        // semitendinosus and semimembranosus
        d: "M82.4 248 C83.4 264 84.4 280 85.4 294 C87.4 299 91.4 299 92.4 294 C95.4 278 95.4 262 93.4 249 C90.4 244 85.4 244 82.4 248 Z",
        fibers: [{ from: [82.4, 248, 93.4, 249], to: [85.4, 294, 92.4, 294], n: 6 }],
      },
    ],
  },
  {
    region: "calves",
    muscles: [
      {
        // gastrocnemius, lateral head
        d: "M71 301 C66.4 312 66 328 69 342 C71 350 75 356 79.4 360 C80.4 346 80.6 318 79.4 304 C76.4 298 73 298 71 301 Z",
        fibers: [{ from: [70.2, 302, 79.2, 303], to: [70.2, 346, 78.2, 346], n: 5 }],
      },
      {
        // gastrocnemius, medial head — larger and lower
        d: "M82 302 C81 318 81.6 340 82.8 360 C87.8 356 91.8 350 93 342 C95.4 328 95 312 92 302 C88 297 84 297 82 302 Z",
        fibers: [{ from: [82.2, 302, 92.2, 302], to: [84.2, 347, 92.2, 347], n: 5 }],
      },
    ],
  },
];

const BACK_EXTRAS: Muscle[] = [
  // infraspinatus and teres over the shoulder blade
  { d: "M64.4 90 C72.4 89 81.4 94 85.4 103 C86.4 111 83.4 118 77.4 120 C70.4 119 64.4 114 62.4 107 C61.4 100 62.4 94 64.4 90 Z", fibers: [{ from: [84.4, 101, 81, 118], to: [64, 95, 63, 109], n: 7, bow: 1 }] },
  // external oblique on the flank, below the lat
  { d: "M68.2 166 C69.2 178 68.2 190 65.2 200 C70.2 203 77.2 203 83.2 199 C79.2 192 75.2 182 72.2 172 C71.2 168 69.6 166 68.2 166 Z", fibers: [{ from: [68.2, 167, 72.2, 172], to: [65.4, 199, 83, 199], n: 4 }] },
  // outer upper arm
  { d: "M38.6 123 C36.6 132 35.6 143 36.6 153 C37.6 157.6 39.6 159 41.8 157 C40.8 148 41 136 43.4 125 C42 122.6 40.2 122.4 38.6 123 Z" },
  // soleus below the calf, then the Achilles tendon
  { d: "M69.6 344 C70.6 356 73.6 368 76.6 376 C80.6 378 85.6 378 88.6 376 C90.6 366 91.6 356 92.6 344 C87.6 352 75.6 352 69.6 344 Z", fibers: [{ from: [70, 346, 92, 346], to: [76.6, 375, 88.4, 375], n: 5 }] },
  { tone: "tendon", d: "M79.6 358 C79.8 366 80.2 372 80.8 378 L85.4 378 C85.8 372 86.2 366 86.2 358 C84 361 81.8 361 79.6 358 Z" },
  // gluteus medius above the glute
  { d: "M64.6 196 C67.6 191 76.6 189 84.6 191 C90.6 193 94.6 197 96.6 203 C87.6 201 76.6 201 66.6 205 C64.6 202 63.6 199 64.6 196 Z" },
  // the elbow
  { tone: "tendon", d: "M41 157 C43 161 47.6 162.4 51.6 160 C51 163 48 165.4 44.6 165.4 C42.6 164 41.4 161 41 157 Z" },
  HAND,
  FOOT,
];

const BACK_DETAIL = [
  "M100 150 L100 210", // spine
  "M72 300 C78 304 86 304 92 300", // back of knee
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
  stroke: "#5c3429",
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
  face = false,
}: {
  /** Front view only — the back of the hood has no eyes. */
  face?: boolean;
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
            <stop offset="0" stopColor="#6e4337" />
            <stop offset="0.5" stopColor="#966252" />
            <stop offset="1" stopColor="#6e4337" />
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
          {/* Tendon and fascia: paler, pearly. Skin (hands, feet): smooth, no fibre. */}
          <linearGradient id={id("tendon")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#d9b5a5" />
            <stop offset="1" stopColor="#a87e6e" />
          </linearGradient>
          <radialGradient id={id("skin")} cx="0.4" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#c99282" />
            <stop offset="1" stopColor="#7f5244" />
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
          {face && (
            <g fill="#f4f8ff" filter={`url(#${id("eyes")})`}>
              <path d={EYE} />
              <path d={EYE} transform={MIRROR} />
            </g>
          )}
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
                <g key={i}>{renderMuscle(m, id(`clip-extra-${i}`), `url(#${id(m.tone ?? "tone")})`, MUSCLE.stroke, 0.4, MUSCLE.fiber)}</g>
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
        <Figure parts={FRONT} extras={FRONT_EXTRAS} details={FRONT_DETAIL} data={data} onPick={pick} selected={selected} label="Front" face />
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
