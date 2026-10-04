"use client";

import { useState } from "react";

export interface LinePoint {
  x: number; // shared numeric domain across series (e.g. days since start)
  y: number;
  label: string; // e.g. the date, shown in the tooltip
}

export interface LineSeries {
  name: string;
  color: string;
  points: LinePoint[];
}

const VIEW_W = 320;
const VIEW_H = 130;
const PAD_BOTTOM = 16;
const PAD_X = 6;

/**
 * One or more series over a shared x domain, with an optional reference line
 * (e.g. goal marathon pace). Lines are 2px with round joins; markers carry a
 * surface-colored ring so they stay legible where they overlap.
 */
export default function LineChart({
  series,
  formatValue = (v) => String(v),
  referenceValue,
  referenceLabel,
  xLabels,
}: {
  series: LineSeries[];
  formatValue?: (v: number) => string;
  referenceValue?: number | null;
  referenceLabel?: string;
  xLabels?: { x: number; label: string }[];
}) {
  const [active, setActive] = useState<{ s: number; p: number } | null>(null);

  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys, referenceValue ?? Infinity);
  const yMax = Math.max(...ys, referenceValue ?? -Infinity);
  const ySpan = yMax - yMin || 1;
  const xSpan = xMax - xMin || 1;

  const plotH = VIEW_H - PAD_BOTTOM;
  const sx = (x: number) => PAD_X + ((x - xMin) / xSpan) * (VIEW_W - PAD_X * 2);
  // Pad the y range by 10% so marks don't sit flush against the edges.
  const sy = (y: number) => plotH - ((y - yMin + ySpan * 0.1) / (ySpan * 1.2)) * plotH;

  const activePoint = active ? series[active.s]?.points[active.p] : null;
  const activeSeries = active ? series[active.s] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" role="img" aria-label={`Line chart, ${series.length} series`}>
        <line x1="0" y1={plotH} x2={VIEW_W} y2={plotH} stroke="#242424" strokeWidth="1" />

        {referenceValue != null && Number.isFinite(referenceValue) && (
          <line x1="0" y1={sy(referenceValue)} x2={VIEW_W} y2={sy(referenceValue)} stroke="#454545" strokeWidth="1" />
        )}

        {series.map((s, si) => {
          const pts = [...s.points].sort((a, b) => a.x - b.x);
          if (pts.length === 0) return null;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
          return (
            <g key={s.name}>
              {pts.length > 1 && (
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {pts.map((p, pi) => {
                const isActive = active?.s === si && active?.p === pi;
                // Dense series get smaller visible dots so the line stays
                // readable; the hit target stays finger-sized either way.
                const r = pts.length > 15 ? 2.5 : 4;
                return (
                  <g key={pi}>
                    <circle
                      cx={sx(p.x)}
                      cy={sy(p.y)}
                      r={isActive ? r + 1 : r}
                      fill={s.color}
                      stroke="#0f0f0f"
                      strokeWidth={pts.length > 15 ? 1 : 2}
                      pointerEvents="none"
                    />
                    <circle
                      cx={sx(p.x)}
                      cy={sy(p.y)}
                      r="8"
                      fill="transparent"
                      onPointerEnter={() => setActive({ s: si, p: pi })}
                      onPointerDown={() => setActive({ s: si, p: pi })}
                      onPointerLeave={() => setActive(null)}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {xLabels?.map((l) => (
          <text key={l.label} x={sx(l.x)} y={VIEW_H - 4} textAnchor="middle" fontSize="8" fill="#6b6b6b">
            {l.label}
          </text>
        ))}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[10px] text-faint">
        <span>{referenceValue != null && referenceLabel ? `— ${referenceLabel}` : ""}</span>
        <span>
          {formatValue(yMin)} – {formatValue(yMax)}
        </span>
      </div>

      {activePoint && activeSeries && (
        <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg border border-base-600 bg-base-800 px-2 py-1 text-[11px] text-ink shadow-lg">
          {series.length > 1 && <span className="text-muted">{activeSeries.name} · </span>}
          {activePoint.label}: {formatValue(activePoint.y)}
        </div>
      )}
    </div>
  );
}
