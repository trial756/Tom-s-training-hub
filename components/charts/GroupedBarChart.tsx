"use client";

import { useState } from "react";

export interface GroupedDatum {
  label: string;
  a: number;
  b: number;
  tooltip?: string;
}

const VIEW_W = 320;
const VIEW_H = 120;
const PAD_BOTTOM = 16;
const GAP = 2; // surface gap between the two bars in a group and between groups

/**
 * Two series side by side per category — e.g. calories consumed vs burned
 * per day. Both measures share one scale and one axis (never two y-scales).
 */
export default function GroupedBarChart({
  data,
  colorA,
  colorB,
  formatValue = (v) => String(v),
  labelEvery,
}: {
  data: GroupedDatum[];
  colorA: string;
  colorB: string;
  formatValue?: (v: number) => string;
  labelEvery?: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  const plotH = VIEW_H - PAD_BOTTOM;
  const slot = VIEW_W / data.length;
  const barW = Math.max(1.5, (slot - GAP * 2) / 2);
  const every = labelEvery ?? Math.ceil(data.length / 7);

  const activeDatum = active != null ? data[active] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" role="img" aria-label={`Grouped bar chart, ${data.length} points`}>
        <line x1="0" y1={plotH} x2={VIEW_W} y2={plotH} stroke="#242424" strokeWidth="1" />

        {data.map((d, i) => {
          const groupX = i * slot + GAP / 2;
          const hA = d.a > 0 ? Math.max(2, (d.a / max) * plotH) : 0;
          const hB = d.b > 0 ? Math.max(2, (d.b / max) * plotH) : 0;
          const dim = active != null && active !== i ? 0.45 : 1;
          return (
            <g key={i}>
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
              />
              {hA > 0 && (
                <rect x={groupX} y={plotH - hA} width={barW} height={hA} rx="2" fill={colorA} opacity={dim} pointerEvents="none" />
              )}
              {hB > 0 && (
                <rect
                  x={groupX + barW + GAP}
                  y={plotH - hB}
                  width={barW}
                  height={hB}
                  rx="2"
                  fill={colorB}
                  opacity={dim}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {data.map((d, i) =>
          i % every === 0 ? (
            <text key={`l-${i}`} x={i * slot + slot / 2} y={VIEW_H - 4} textAnchor="middle" fontSize="8" fill="#6b6b6b">
              {d.label}
            </text>
          ) : null
        )}
      </svg>

      <div className="mt-1 text-right text-[10px] text-faint">max {formatValue(max)}</div>

      {activeDatum && (
        <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg border border-base-600 bg-base-800 px-2 py-1 text-[11px] text-ink shadow-lg">
          {activeDatum.tooltip ?? `${activeDatum.label}: ${formatValue(activeDatum.a)} / ${formatValue(activeDatum.b)}`}
        </div>
      )}
    </div>
  );
}
