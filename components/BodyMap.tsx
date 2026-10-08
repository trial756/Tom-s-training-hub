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
 * Drawn here as SVG paths rather than pulled from licensed artwork.
 * Coordinates live on a 200×410 canvas, centred on x=100. Every shape is
 * authored for the viewer's left half only and mirrored, so the figure is
 * symmetrical by construction; a centre shape (abs, spine) is drawn as its
 * left half and meets its mirror on the midline.
 */
const W = 200;
const H = 410;

// The outer edge, open at the midline. Filled halves overlap the midline by
// a hair (no anti-aliased seam), and only this open edge gets a stroke.
const SILHOUETTE_EDGE =
  "M100 8 C88 8 80 18 80 33 C80 46 86 55 92 59 L91 70 C82 74 66 76 56 80 C46 83 40 92 40 104 " +
  "C39 120 37 140 36 160 C34 180 30 205 30 228 C29 238 28 248 31 256 C34 261 40 259 41 251 " +
  "C42 241 44 233 45 226 C48 205 52 185 54 165 C56 150 58 135 61 121 C63 140 66 165 69 188 " +
  "C70 198 66 206 66 216 C66 240 68 270 72 300 C73 320 70 340 72 360 C73 372 74 382 74 388 " +
  "C72 394 69 401 76 403 L94 403 C96 397 94 391 92 386 C92 360 95 335 93 310 C92 300 96 270 98 240 " +
  "L100 228";
const SILHOUETTE_FILL = `${SILHOUETTE_EDGE} L100.8 228 L100.8 8 Z`;

type Part = { region: MuscleRegion; paths: string[] };

const FRONT: Part[] = [
  {
    region: "side_delts",
    paths: ["M50 84 C42 87 38 96 39 110 C40 116 42 118 44 117 C45 108 47 96 52 87 Z"],
  },
  {
    region: "front_delts",
    paths: ["M53 86 C48 95 46 106 46 116 C51 118 56 116 60 112 C62 104 64 96 66 88 C62 85 57 84 53 86 Z"],
  },
  {
    region: "chest",
    paths: ["M67 90 C63 100 62 111 63 122 C69 131 83 133 97 129 L97 93 C88 88 77 87 67 90 Z"],
  },
  {
    region: "biceps",
    paths: ["M47 123 C43 133 42 146 44 157 C47 161 52 161 55 157 C57 146 58 133 57 123 C54 119 50 119 47 123 Z"],
  },
  {
    region: "forearms",
    paths: ["M41 168 C37 182 35 200 35 219 C37 223 40 223 42 219 C46 201 50 184 52 169 C48 164 44 164 41 168 Z"],
  },
  {
    region: "obliques",
    paths: ["M66 130 C70 147 73 167 75 194 C79 200 83 199 85 195 C84 175 83 155 84 138 C78 136 72 133 66 130 Z"],
  },
  {
    region: "abs",
    paths: [
      "M88 137 Q87 136 87 139 L87 150 Q87 153 90 153 L97 153 Q98 153 98 151 L98 138 Q98 135 95 135 Z",
      "M88 157 Q87 156 87 159 L87 170 Q87 173 90 173 L97 173 Q98 173 98 171 L98 158 Q98 156 96 156 Z",
      "M88 177 Q87 176 87 179 L87 189 Q87 192 90 192 L97 192 Q98 192 98 190 L98 178 Q98 176 96 176 Z",
      "M88 196 Q87 196 88 199 L91 214 Q93 220 98 222 L98 198 Q98 196 96 196 Z",
    ],
  },
  {
    region: "quads",
    paths: [
      // rectus/vastus lateralis sweep, then the vastus medialis teardrop
      "M70 223 C66 246 67 271 72 292 C76 298 81 299 84 296 C86 272 86 246 84 224 C80 220 74 219 70 223 Z",
      "M87 225 C89 246 90 266 88 284 C88 292 90 298 94 296 C97 286 97 270 96 255 C96 243 96 233 95 228 C93 225 90 224 87 225 Z",
    ],
  },
  {
    region: "calves",
    // the medial head shows from the front
    paths: ["M87 316 C91 326 93 338 92 351 C91 357 87 358 86 352 C84 340 84 328 85 318 C85 314 86 314 87 316 Z"],
  },
];

const BACK: Part[] = [
  {
    region: "traps",
    paths: ["M100 62 L100 122 C96 112 92 100 86 92 C78 86 68 83 59 82 C68 78 80 76 88 72 C93 68 97 64 100 62 Z"],
  },
  {
    region: "rear_delts",
    paths: ["M57 83 C47 85 40 94 40 107 C44 112 50 111 56 105 C60 97 63 91 66 86 C63 84 60 83 57 83 Z"],
  },
  {
    region: "triceps",
    paths: ["M45 117 C41 129 41 144 43 157 C47 161 52 161 56 157 C58 144 58 129 58 117 C54 112 49 112 45 117 Z"],
  },
  {
    region: "forearms",
    paths: ["M41 168 C37 182 35 200 35 219 C37 223 40 223 42 219 C46 201 50 184 52 169 C48 164 44 164 41 168 Z"],
  },
  {
    region: "mid_back",
    paths: ["M87 98 C83 108 82 122 85 136 C89 142 95 146 99 147 L99 128 C95 118 91 107 87 98 Z"],
  },
  {
    region: "lats",
    paths: ["M64 108 C63 128 67 150 75 172 C80 179 87 178 90 170 C87 160 84 150 83 140 C80 128 79 117 80 106 C74 104 68 105 64 108 Z"],
  },
  {
    region: "lower_back",
    // the two erector columns either side of the spine
    paths: ["M93 152 C90 166 89 182 90 196 C91 204 94 208 98.5 209 L98.5 153 C96.5 151 94.5 151 93 152 Z"],
  },
  {
    region: "glutes",
    paths: ["M69 212 C64 223 65 237 73 245 C82 251 93 249 99 241 L99 215 C90 208 79 207 69 212 Z"],
  },
  {
    region: "hamstrings",
    paths: [
      "M70 254 C67 271 69 288 74 299 C77 302 80 302 82 299 C83 284 83 268 82 254 C78 250 73 250 70 254 Z",
      "M85 253 C86 268 87 284 87 298 C89 302 92 302 93 298 C96 282 96 266 95 253 C92 249 88 249 85 253 Z",
    ],
  },
  {
    region: "calves",
    paths: [
      "M75 312 C71 324 71 339 74 352 C76 357 80 357 81 352 C82 340 82 325 81 313 C79 308 77 308 75 312 Z",
      "M84 312 C83 325 84 340 85 352 C86 358 90 358 91 352 C93 338 93 324 90 312 C88 307 86 307 84 312 Z",
    ],
  },
];

/**
 * Lines inside each muscle, clipped to its outline: "fiber" strokes follow
 * the grain (pecs fan from the sternum, traps converge on the spine) and
 * "cut" strokes are the grooves between heads. Left-half coordinates.
 */
type Line = { d: string; cut?: boolean };
const STRIATIONS: Partial<Record<MuscleRegion, { front?: Line[]; back?: Line[] }>> = {
  chest: {
    front: [
      { d: "M97 97 Q81 94 66 95" },
      { d: "M97 114 Q81 113 64 112" },
      { d: "M97 122 Q83 123 66 119" },
      { d: "M97 106 Q82 105 65 103", cut: true }, // upper / lower pec
    ],
  },
  front_delts: { front: [{ d: "M59 88 Q54 100 51 115" }, { d: "M64 90 Q60 101 57 113" }] },
  side_delts: { front: [{ d: "M47 88 Q43 100 42 114" }] },
  biceps: { front: [{ d: "M51 121 Q49 140 50 159", cut: true }, { d: "M47 128 Q46 142 47 154" }] },
  forearms: {
    front: [{ d: "M46 167 Q41 190 38 219", cut: true }, { d: "M49 170 Q45 188 41 210" }],
    back: [{ d: "M46 167 Q41 190 38 219", cut: true }],
  },
  obliques: {
    front: [
      { d: "M67 138 L83 147", cut: true },
      { d: "M70 153 L84 162", cut: true },
      { d: "M72 168 L84 177", cut: true },
      { d: "M74 183 L84 190", cut: true },
    ],
  },
  quads: {
    front: [{ d: "M77 222 Q77 258 80 296", cut: true }, { d: "M72 236 Q70 262 75 288" }, { d: "M91 240 Q93 262 92 286" }],
  },
  traps: {
    back: [
      { d: "M99 70 Q80 78 62 82" },
      { d: "M99 84 Q86 87 72 85" },
      { d: "M99 100 Q93 98 87 93" },
      { d: "M99 112 Q96 106 92 100" },
    ],
  },
  rear_delts: { back: [{ d: "M61 86 Q51 93 44 106" }, { d: "M64 88 Q56 96 50 109" }] },
  triceps: { back: [{ d: "M47 121 Q50 136 51 146 Q53 136 56 121", cut: true }, { d: "M51 146 L51 158" }] },
  lats: { back: [{ d: "M66 112 Q72 140 80 170" }, { d: "M72 108 Q76 136 86 168" }, { d: "M66 118 Q72 116 80 114", cut: true }] },
  mid_back: { back: [{ d: "M88 104 L98 124" }, { d: "M86 117 L98 137" }] },
  lower_back: { back: [{ d: "M95 156 Q94 180 95 205" }] },
  glutes: { back: [{ d: "M71 217 Q84 228 96 243" }, { d: "M67 228 Q79 237 89 247" }, { d: "M70 214 Q80 212 92 216", cut: true }] },
  hamstrings: { back: [{ d: "M76 258 Q75 278 77 297" }, { d: "M90 258 Q91 278 90 297" }] },
  calves: { back: [{ d: "M78 316 Q77 334 78 350" }, { d: "M87 316 Q88 334 88 350" }] },
};

/** Contour lines that sell the anatomy without being tappable. */
const FRONT_DETAIL = [
  "M100 92 L100 128", // sternum
  "M99 76 Q84 77 63 83", // collarbone
  "M92 61 Q95 68 98 75", // neck (sternocleidomastoid)
  "M69 208 Q82 220 97 227", // hip crease
  "M78 300 Q83 295 89 300 Q88 308 83 310 Q79 308 78 300", // kneecap
  "M76 318 C77 334 78 348 80 360", // shin
  "M80 378 Q82 382 86 382", // ankle
];
const BACK_DETAIL = [
  "M100 122 L100 152", // spine between traps and erectors
  "M68 92 Q80 95 84 110 Q79 121 69 119", // shoulder blade
  "M70 248 C78 252 90 252 99 248", // glute fold
  "M72 302 C78 306 86 306 92 302", // back of knee
  "M82 356 Q83 370 83 385", // achilles
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

function Figure({
  parts,
  details,
  side,
  data,
  onPick,
  selected,
  label,
}: {
  parts: Part[];
  details: string[];
  side: "front" | "back";
  data: Map<MuscleRegion, BodyRegionData>;
  onPick: (region: MuscleRegion) => void;
  selected: MuscleRegion | null;
  label: string;
}) {
  // Gradient, clip and filter ids must be unique per figure instance.
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${name}-${uid}`;

  const trainedParts = parts.filter(({ region }) => (data.get(region)?.intensity ?? 0) > 0);

  return (
    <div className="flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} muscle map`}>
        <defs>
          <linearGradient id={id("body")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#131313" />
            <stop offset="0.5" stopColor="#1e1e1e" />
            <stop offset="1" stopColor="#131313" />
          </linearGradient>
          <clipPath id={id("silhouette")}>
            <path d={SILHOUETTE_FILL} />
            <path d={SILHOUETTE_FILL} transform={MIRROR} />
          </clipPath>
          <filter id={id("haze")} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <radialGradient id={id("untrained")} cx="0.5" cy="0.4" r="0.7">
            <stop offset="0" stopColor="#2a2a2a" />
            <stop offset="1" stopColor="#1a1a1a" />
          </radialGradient>
          {parts.map(({ region, paths }) => {
            const d = data.get(region);
            return (
              <g key={region}>
                {/* Per-muscle bulge: pale core, base colour, darker rim. */}
                {d && d.intensity > 0 && (() => {
                  const s = shadesFor(d.source, d.intensity);
                  return (
                    <radialGradient id={id(`fill-${region}`)} cx="0.45" cy="0.38" r="0.75">
                      <stop offset="0" stopColor={css(s.core)} />
                      <stop offset="0.55" stopColor={css(s.base)} />
                      <stop offset="1" stopColor={css(s.edge)} />
                    </radialGradient>
                  );
                })()}
                <clipPath id={id(`clip-${region}`)}>
                  {paths.map((p, i) => (
                    <path key={i} d={p} />
                  ))}
                </clipPath>
              </g>
            );
          })}
        </defs>

        {/* silhouette */}
        <g fill={`url(#${id("body")})`}>
          <path d={SILHOUETTE_FILL} />
          <path d={SILHOUETTE_FILL} transform={MIRROR} />
        </g>

        {/* Heat haze: trained muscles blurred wide and kept inside the body,
            so colour bleeds across neighbours and gym/run blend where they meet. */}
        <g clipPath={`url(#${id("silhouette")})`} pointerEvents="none">
          <g filter={`url(#${id("haze")})`}>
            {trainedParts.map(({ region, paths }) => {
              const d = data.get(region)!;
              const s = shadesFor(d.source, d.intensity);
              const dimmed = selected != null && selected !== region;
              return (
                <g key={region} opacity={(0.2 + 0.7 * clamp01(d.intensity)) * (dimmed ? 0.4 : 1)}>
                  {paths.map((p, i) => (
                    <g key={i}>
                      <path d={p} fill={css(s.base)} />
                      <path d={p} fill={css(s.base)} transform={MIRROR} />
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
        </g>

        <g fill="none" stroke="#2b2b2b" strokeWidth="0.8" strokeLinejoin="round" pointerEvents="none">
          <path d={SILHOUETTE_EDGE} />
          <path d={SILHOUETTE_EDGE} transform={MIRROR} />
        </g>

        {parts.map(({ region, paths }) => {
          const d = data.get(region);
          const trained = !!d && d.intensity > 0;
          const s = trained ? shadesFor(d!.source, d!.intensity) : null;
          const isSelected = selected === region;
          const dimmed = selected != null && !isSelected;
          const lines = STRIATIONS[region]?.[side] ?? [];

          const halves = [undefined, MIRROR] as const;

          return (
            <g
              key={region}
              role="button"
              aria-label={d?.label ?? region}
              onClick={() => onPick(region)}
              style={{ cursor: "pointer", opacity: dimmed ? 0.4 : 1, transition: "opacity 200ms" }}
            >
              {halves.map((transform, h) => (
                <g key={h} transform={transform}>
                  {/* Invisible margin around each muscle: the small ones (side
                      delts, forearms) are only ~7px wide on a phone. */}
                  {paths.map((p, i) => (
                    <path key={`hit${i}`} d={p} fill="none" stroke="transparent" strokeWidth="7" pointerEvents="stroke" />
                  ))}
                  {paths.map((p, i) => (
                    <path
                      key={i}
                      d={p}
                      fill={trained ? `url(#${id(`fill-${region}`)})` : `url(#${id("untrained")})`}
                      stroke={isSelected ? "#f5f5f5" : trained ? css(s!.line, 0.55) : "#333333"}
                      strokeWidth={isSelected ? 1.6 : 0.6}
                      strokeLinejoin="round"
                    />
                  ))}
                  {lines.length > 0 && (
                    <g clipPath={`url(#${id(`clip-${region}`)})`} fill="none" strokeLinecap="round" pointerEvents="none">
                      {lines.map((l, i) => (
                        <path
                          key={i}
                          d={l.d}
                          stroke={l.cut ? `rgba(0, 0, 0, ${trained ? 0.5 : 0.3})` : trained ? css(s!.line, 0.5) : "rgba(255, 255, 255, 0.08)"}
                          strokeWidth={l.cut ? 1.1 : 0.65}
                        />
                      ))}
                    </g>
                  )}
                </g>
              ))}
            </g>
          );
        })}

        <g stroke="#333333" strokeWidth="0.7" fill="none" strokeLinecap="round" pointerEvents="none">
          {details.map((p, i) => (
            <g key={i}>
              <path d={p} />
              <path d={p} transform={MIRROR} />
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
        <Figure parts={FRONT} details={FRONT_DETAIL} side="front" data={data} onPick={pick} selected={selected} label="Front" />
        <Figure parts={BACK} details={BACK_DETAIL} side="back" data={data} onPick={pick} selected={selected} label="Back" />
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
          <span className="h-2 w-2 rounded-sm border border-[#303030] bg-[#232323]" /> untrained
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
