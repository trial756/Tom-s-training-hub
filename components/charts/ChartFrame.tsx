"use client";

import { useState } from "react";

export interface ChartSeries {
  name: string;
  color: string;
}

/**
 * Shared chart chrome: title, subtitle, legend (only for 2+ series — a lone
 * series is already named by the title), and a toggleable table view so the
 * numbers are never gated behind color or hover alone.
 */
export default function ChartFrame({
  title,
  subtitle,
  series,
  empty,
  emptyMessage,
  tableHead,
  tableRows,
  children,
}: {
  title: string;
  subtitle?: string;
  series?: ChartSeries[];
  empty?: boolean;
  emptyMessage?: string;
  tableHead?: string[];
  tableRows?: (string | number)[][];
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const hasTable = !!tableHead && !!tableRows && tableRows.length > 0;

  return (
    <div className="card">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-[11px] text-faint">{subtitle}</p>}
        </div>
        {hasTable && !empty && (
          <button
            onClick={() => setShowTable((v) => !v)}
            className="shrink-0 text-[11px] font-medium text-faint active:text-accent"
          >
            {showTable ? "Chart" : "Data"}
          </button>
        )}
      </div>

      {series && series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}

      {empty ? (
        <p className="py-6 text-center text-sm text-faint">{emptyMessage ?? "Nothing logged in this range yet."}</p>
      ) : showTable && hasTable ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-base-900 text-faint">
              <tr>
                {tableHead!.map((h, i) => (
                  <th key={h} className={`py-1 font-medium ${i > 0 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {tableRows!.map((row, i) => (
                <tr key={i} className="border-t border-base-800">
                  {row.map((cell, j) => (
                    <td key={j} className={`py-1 ${j > 0 ? "text-right text-muted" : "text-ink"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
