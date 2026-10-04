"use client";

import { useState } from "react";

export interface BarDatum {
  label: string; // x-axis label (may be abbreviated)
  value: number;
  tooltip?: string; // full text shown on tap/hover
}

const VIEW_W = 320;
const VIEW_H = 120;
const PAD_BOTTOM = 16; // room for x labels
const GAP = 2; // surface gap between adjacent bars
const MAX_BAR_W = 24;

/**
 * Single-series vertical bars. One series carries no identity-by-color, so
 * there's no legend — the title names what's plotted. Bars grow from a single
 * baseline with a rounded data-end, and an optional reference line marks a
 * target (e.g. a weekly mileage goal).
 */
export default function BarChart({
  data,
  color = "#00e676",
  formatValue = (v) => String(v),
  referenceValue,
  referenceLabel,
  labelEvery,
}: {
  data: BarDatum[];
  color?: string;
  formatValue?: (v: number) => string;
  referenceValue?: number | null;
  referenceLabel?: string;
  labelEvery?: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(...data.map((d) => d.value), referenceValue ?? 0, 1);
  const plotH = VIEW_H - PAD_BOTTOM;
  const slot = VIEW_W / data.length;
  const barW = Math.min(MAX_BAR_W, Math.max(2, slot - GAP));
  // Keep x labels from colliding on narrow screens.
  const every = labelEvery ?? Math.ceil(data.length / 7);

  const activeDatum = active != null ? data[active] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" role="img" aria-label={`Bar chart, ${data.length} points`}>
        {/* baseline */}
        <line x1="0" y1={plotH} x2={VIEW_W} y2={plotH} stroke="#242424" strokeWidth="1" />

        {referenceValue != null && referenceValue > 0 && (
          <line
            x1="0"
            y1={plotH - (referenceValue / max) * plotH}
            x2={VIEW_W}
            y2={plotH - (referenceValue / max) * plotH}
            stroke="#454545"
            strokeWidth="1"
          />
        )}

        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(2, (d.value / max) * plotH) : 0;
          const x = i * slot + (slot - barW) / 2;
          const y = plotH - h;
          const isActive = active === i;
          return (
            <g key={i}>
              {/* hit target is the full slot, bigger than the mark itself */}
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
              {h > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx="2"
                  fill={color}
                  opacity={active == null || isActive ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {data.map((d, i) =>
          i % every === 0 ? (
            <text
              key={`l-${i}`}
              x={i * slot + slot / 2}
              y={VIEW_H - 4}
              textAnchor="middle"
              fontSize="8"
              fill="#6b6b6b"
            >
              {d.label}
            </text>
          ) : null
        )}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[10px] text-faint">
        <span>
          {referenceValue != null && referenceValue > 0 && referenceLabel ? `— ${referenceLabel}` : ""}
        </span>
        <span>max {formatValue(max)}</span>
      </div>

      {activeDatum && (
        <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg border border-base-600 bg-base-800 px-2 py-1 text-[11px] text-ink shadow-lg">
          {activeDatum.tooltip ?? `${activeDatum.label}: ${formatValue(activeDatum.value)}`}
        </div>
      )}
    </div>
  );
}
