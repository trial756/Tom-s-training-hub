"use client";

import { useRef, useState } from "react";

/**
 * Horizontal snap-scrolling strip of chart cards. One card per screen width
 * so a swipe always lands cleanly, with dots showing position. Each card
 * keeps its own table toggle, so nothing is reachable only by swiping.
 */
export default function ChartCarousel({ children }: { children: React.ReactNode[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const cards = children.filter(Boolean);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== active) setActive(index);
  }

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {cards.map((card, i) => (
          <div key={i} className="w-full shrink-0 snap-center">
            {card}
          </div>
        ))}
      </div>
      {cards.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {cards.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-accent" : "w-1.5 bg-base-700"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
