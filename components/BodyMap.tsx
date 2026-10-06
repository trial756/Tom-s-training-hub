"use client";

import { useState } from "react";
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
 * Stylized rather than anatomical — simple rounded forms read better at
 * phone size than a medical illustration, and keep the figure drawn here
 * rather than pulled from licensed artwork.
 *
 * Each entry is a region and the shapes that make it up, mirrored left and
 * right where the muscle is paired.
 */
type Shape = { x: number; y: number; w: number; h: number; r?: number };

const FRONT: { region: MuscleRegion; shapes: Shape[] }[] = [
  { region: "front_delts", shapes: [{ x: 20, y: 40, w: 15, h: 15, r: 7 }, { x: 65, y: 40, w: 15, h: 15, r: 7 }] },
  { region: "side_delts", shapes: [{ x: 15, y: 42, w: 9, h: 14, r: 4 }, { x: 76, y: 42, w: 9, h: 14, r: 4 }] },
  { region: "chest", shapes: [{ x: 35, y: 44, w: 14, h: 18, r: 4 }, { x: 51, y: 44, w: 14, h: 18, r: 4 }] },
  { region: "biceps", shapes: [{ x: 17, y: 58, w: 11, h: 22, r: 5 }, { x: 72, y: 58, w: 11, h: 22, r: 5 }] },
  { region: "forearms", shapes: [{ x: 14, y: 82, w: 10, h: 24, r: 5 }, { x: 76, y: 82, w: 10, h: 24, r: 5 }] },
  { region: "abs", shapes: [{ x: 42, y: 64, w: 16, h: 32, r: 4 }] },
  { region: "obliques", shapes: [{ x: 33, y: 65, w: 8, h: 29, r: 4 }, { x: 59, y: 65, w: 8, h: 29, r: 4 }] },
  { region: "quads", shapes: [{ x: 35, y: 100, w: 13, h: 45, r: 6 }, { x: 52, y: 100, w: 13, h: 45, r: 6 }] },
];

const BACK: { region: MuscleRegion; shapes: Shape[] }[] = [
  { region: "traps", shapes: [{ x: 38, y: 38, w: 24, h: 18, r: 5 }] },
  { region: "rear_delts", shapes: [{ x: 19, y: 41, w: 15, h: 14, r: 6 }, { x: 66, y: 41, w: 15, h: 14, r: 6 }] },
  { region: "lats", shapes: [{ x: 32, y: 56, w: 13, h: 24, r: 5 }, { x: 55, y: 56, w: 13, h: 24, r: 5 }] },
  { region: "mid_back", shapes: [{ x: 45, y: 56, w: 10, h: 22, r: 3 }] },
  { region: "triceps", shapes: [{ x: 17, y: 58, w: 11, h: 22, r: 5 }, { x: 72, y: 58, w: 11, h: 22, r: 5 }] },
  { region: "lower_back", shapes: [{ x: 38, y: 80, w: 24, h: 16, r: 4 }] },
  { region: "glutes", shapes: [{ x: 35, y: 97, w: 14, h: 16, r: 6 }, { x: 51, y: 97, w: 14, h: 16, r: 6 }] },
  { region: "hamstrings", shapes: [{ x: 36, y: 114, w: 12, h: 32, r: 5 }, { x: 52, y: 114, w: 12, h: 32, r: 5 }] },
  { region: "calves", shapes: [{ x: 37, y: 150, w: 11, h: 28, r: 5 }, { x: 52, y: 150, w: 11, h: 28, r: 5 }] },
];

/** Untrained regions sit just above the surface so the silhouette still reads. */
function fillFor(data: BodyRegionData | undefined): string {
  if (!data || data.intensity <= 0) return "#1b1b1b";
  const t = Math.max(0.18, Math.min(1, data.intensity));
  // One hue per source, light to dark by load — never a rainbow.
  return data.source === "run" ? `rgba(46, 196, 182, ${t})` : `rgba(0, 230, 118, ${t})`;
}

function Figure({
  parts,
  data,
  onPick,
  selected,
  label,
}: {
  parts: { region: MuscleRegion; shapes: Shape[] }[];
  data: Map<MuscleRegion, BodyRegionData>;
  onPick: (region: MuscleRegion) => void;
  selected: MuscleRegion | null;
  label: string;
}) {
  return (
    <div className="flex-1">
      <svg viewBox="0 0 100 200" className="w-full" role="img" aria-label={`${label} muscle map`}>
        {/* silhouette */}
        <g fill="#141414">
          <circle cx="50" cy="22" r="11" />
          <rect x="45" y="32" width="10" height="8" />
          <rect x="30" y="40" width="40" height="60" rx="8" />
          <rect x="33" y="96" width="34" height="18" rx="6" />
          <rect x="35" y="112" width="13" height="70" rx="6" />
          <rect x="52" y="112" width="13" height="70" rx="6" />
          <rect x="16" y="42" width="12" height="66" rx="6" />
          <rect x="72" y="42" width="12" height="66" rx="6" />
        </g>

        {parts.map(({ region, shapes }) => {
          const d = data.get(region);
          const isSelected = selected === region;
          return (
            <g key={region} onClick={() => onPick(region)} style={{ cursor: "pointer" }}>
              {shapes.map((s, i) => (
                <rect
                  key={i}
                  x={s.x}
                  y={s.y}
                  width={s.w}
                  height={s.h}
                  rx={s.r ?? 4}
                  fill={fillFor(d)}
                  stroke={isSelected ? "#f5f5f5" : "transparent"}
                  strokeWidth="1.2"
                />
              ))}
            </g>
          );
        })}
      </svg>
      <p className="text-center text-[10px] uppercase tracking-wide text-faint">{label}</p>
    </div>
  );
}

export default function BodyMap({
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

      <div className="flex gap-4">
        <Figure parts={FRONT} data={data} onPick={setSelected} selected={selected} label="Front" />
        <Figure parts={BACK} data={data} onPick={setSelected} selected={selected} label="Back" />
      </div>

      <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-faint">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(0,230,118,0.9)" }} /> gym
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(46,196,182,0.9)" }} /> running
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[#1b1b1b]" /> untrained
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
