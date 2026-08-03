"use client";

import { useEffect, useRef } from "react";

// 5-second undo window in place of a confirm dialog — fewer taps, still
// recoverable. `onExpire` fires once the window closes (should perform the
// actual delete); `onUndo` cancels it.
export default function UndoToast({
  label,
  onUndo,
  onExpire,
}: {
  label: string;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    const timer = setTimeout(() => expireRef.current(), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-lg items-center justify-between rounded-xl border border-base-600 bg-base-900 px-4 py-3 shadow-lg">
      <span className="text-sm text-ink">{label}</span>
      <button onClick={onUndo} className="text-sm font-semibold text-accent">
        Undo
      </button>
    </div>
  );
}
