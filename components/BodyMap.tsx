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

/** Contour lines that sell the anatomy without being tappable. */
const FRONT_DETAIL = [
  "M100 92 L100 128", // sternum
  "M70 300 C74 304 80 306 86 304", // knee
  "M76 318 C77 334 78 348 80 360", // shin
];
const BACK_DETAIL = [
  "M100 122 L100 152", // spine between traps and erectors
  "M70 248 C78 252 90 252 99 248", // glute fold
  "M72 302 C78 306 86 306 92 302", // back of knee
];

const MIRROR = `translate(${W} 0) scale(-1 1)`;

const LIFT_RGB = "0, 230, 118";
const RUN_RGB = "46, 196, 182";

/** Load → opacity. Never fully transparent once trained, so a light week still shows. */
function alphaFor(intensity: number): number {
  return 0.3 + 0.7 * Math.max(0, Math.min(1, intensity));
}

function Figure({
  parts,
  details,
  data,
  onPick,
  selected,
  label,
}: {
  parts: Part[];
  details: string[];
  data: Map<MuscleRegion, BodyRegionData>;
  onPick: (region: MuscleRegion) => void;
  selected: MuscleRegion | null;
  label: string;
}) {
  // Gradient and filter ids must be unique per figure instance.
  const uid = useId().replace(/:/g, "");
  const bodyGrad = `body-${uid}`;
  const sheen = `sheen-${uid}`;
  const glow = `glow-${uid}`;

  return (
    <div className="flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} muscle map`}>
        <defs>
          <linearGradient id={bodyGrad} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#151515" />
            <stop offset="0.5" stopColor="#1d1d1d" />
            <stop offset="1" stopColor="#151515" />
          </linearGradient>
          {/* Soft top-down highlight laid over every muscle for a little volume. */}
          <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* silhouette */}
        <g fill={`url(#${bodyGrad})`}>
          <path d={SILHOUETTE_FILL} />
          <path d={SILHOUETTE_FILL} transform={MIRROR} />
        </g>
        <g fill="none" stroke="#2b2b2b" strokeWidth="0.8" strokeLinejoin="round">
          <path d={SILHOUETTE_EDGE} />
          <path d={SILHOUETTE_EDGE} transform={MIRROR} />
        </g>

        {parts.map(({ region, paths }) => {
          const d = data.get(region);
          const trained = !!d && d.intensity > 0;
          const rgb = d?.source === "run" ? RUN_RGB : LIFT_RGB;
          const alpha = trained ? alphaFor(d!.intensity) : 0;
          const isSelected = selected === region;
          const dimmed = selected != null && !isSelected;
          const fill = trained ? `rgba(${rgb}, ${alpha})` : "#232323";

          const shapes = paths.flatMap((p, i) => [
            { key: `${i}l`, d: p, transform: undefined as string | undefined },
            { key: `${i}r`, d: p, transform: MIRROR },
          ]);

          return (
            <g
              key={region}
              role="button"
              aria-label={d?.label ?? region}
              onClick={() => onPick(region)}
              style={{ cursor: "pointer", opacity: dimmed ? 0.45 : 1, transition: "opacity 150ms" }}
            >
              {/* Invisible margin around each muscle: the small ones (side
                  delts, forearms) are only ~7px wide on a phone. */}
              {shapes.map((s) => (
                <path
                  key={`${s.key}-hit`}
                  d={s.d}
                  transform={s.transform}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="7"
                  pointerEvents="stroke"
                />
              ))}
              {/* Glow only for real load, so it marks emphasis rather than decorating everything. */}
              {trained && d!.intensity >= 0.55 && (
                <g filter={`url(#${glow})`} opacity={0.55 * d!.intensity}>
                  {shapes.map((s) => (
                    <path key={s.key} d={s.d} transform={s.transform} fill={`rgb(${rgb})`} />
                  ))}
                </g>
              )}
              {shapes.map((s) => (
                <path
                  key={s.key}
                  d={s.d}
                  transform={s.transform}
                  fill={fill}
                  stroke={isSelected ? "#f5f5f5" : trained ? `rgba(${rgb}, ${Math.min(1, alpha + 0.2)})` : "#303030"}
                  strokeWidth={isSelected ? 1.6 : 0.7}
                  strokeLinejoin="round"
                />
              ))}
              {shapes.map((s) => (
                <path key={`${s.key}-sheen`} d={s.d} transform={s.transform} fill={`url(#${sheen})`} pointerEvents="none" />
              ))}
            </g>
          );
        })}

        <g stroke="#2e2e2e" strokeWidth="0.8" fill="none" strokeLinecap="round" pointerEvents="none">
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
        <Figure parts={FRONT} details={FRONT_DETAIL} data={data} onPick={pick} selected={selected} label="Front" />
        <Figure parts={BACK} details={BACK_DETAIL} data={data} onPick={pick} selected={selected} label="Back" />
      </div>

      {/* Legend: one ramp per source, light to heavy — load reads as depth of colour. */}
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-faint">
        {[
          { name: "gym", rgb: LIFT_RGB },
          { name: "running", rgb: RUN_RGB },
        ].map(({ name, rgb }) => (
          <span key={name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-8 rounded-full"
              style={{ background: `linear-gradient(to right, rgba(${rgb}, 0.3), rgba(${rgb}, 1))` }}
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
