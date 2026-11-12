"use client";

import { useCallback, useEffect, useState } from "react";
import UndoToast from "@/components/UndoToast";
import type { Food } from "@/lib/foods";
import { useRefreshOn } from "@/lib/refresh";

/**
 * The foods the AI has been taught: anything corrected in a meal edit.
 * Collapsed by default; a wrong entry can be removed (undo toast).
 */
export default function FoodLibrary() {
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Food | null>(null);

  const load = useCallback(() => {
    fetch("/api/foods", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setFoods(j.foods ?? []))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useRefreshOn(load, { kinds: ["meal"] });

  const shown = (foods ?? []).filter((f) => f.key !== pending?.key);
  const fmt = (v: number | null, u = "") => (v == null ? "—" : `${Math.round(Number(v) * 10) / 10}${u}`);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center justify-between text-sm font-semibold uppercase tracking-wide text-gray-500"
      >
        <span>My foods {foods ? `(${shown.length})` : ""}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-2">
          <p className="text-xs text-faint">
            What the AI has learned from your edits. It uses these numbers instead of guessing when you log the same food.
          </p>
          {shown.length === 0 && <p className="text-sm text-muted">Nothing yet — edit a meal to teach it.</p>}
          <ul className="card divide-y divide-base-700 py-1">
            {shown.map((f) => (
              <li key={f.key} className="flex min-h-[44px] items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{f.name}</p>
                  <p className="text-xs text-muted">
                    {fmt(f.calories)} cal · {fmt(f.protein_g, "g")} protein · {fmt(f.carbs_g, "g")} carbs · {fmt(f.fat_g, "g")} fat
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Forget ${f.name}`}
                  className="min-h-[44px] min-w-[44px] text-faint active:text-danger"
                  onClick={() => setPending(f)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pending && (
        <UndoToast
          label={`Forgot ${pending.name}`}
          onUndo={() => setPending(null)}
          onExpire={async () => {
            await fetch(`/api/foods?key=${encodeURIComponent(pending.key)}`, { method: "DELETE" });
            setPending(null);
            load();
          }}
        />
      )}
    </div>
  );
}
