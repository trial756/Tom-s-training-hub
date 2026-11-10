"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogSheet from "@/components/LogSheet";
import { HistoryIcon, MarathonIcon, StatsIcon, TodayIcon } from "@/components/NavIcons";

const LEFT = [
  { href: "/", label: "Today", icon: TodayIcon },
  { href: "/progress", label: "Progress", icon: StatsIcon },
] as const;
const RIGHT = [
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/goals", label: "Goals", icon: MarathonIcon },
] as const;

// The log forms open from the + button rather than having tabs of their own.
const LOG_PAGES = ["/log", "/runs", "/fuel"];

export default function BottomNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Any navigation closes the sheet.
  useEffect(() => setSheetOpen(false), [pathname]);

  if (pathname === "/login") return null;

  const tab = (t: (typeof LEFT)[number] | (typeof RIGHT)[number]) => {
    // The race page sits under Goals.
    const active = pathname === t.href || (t.href === "/goals" && pathname === "/marathon");
    const Icon = t.icon;
    return (
      <Link key={t.href} href={t.href} className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors">
        <Icon active={active} />
        <span className={`text-[10px] font-medium ${active ? "text-accent" : "text-faint"}`}>{t.label}</span>
      </Link>
    );
  };
  const logActive = LOG_PAGES.includes(pathname);

  return (
    <>
      {sheetOpen && <LogSheet onClose={() => setSheetOpen(false)} />}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-base-700 bg-base-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 pb-[calc(env(safe-area-inset-bottom)+4px)] pt-1">
          {LEFT.map(tab)}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              aria-label={sheetOpen ? "Close log menu" : "Log something"}
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((v) => !v)}
              className={`-mt-5 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 ${
                logActive && !sheetOpen ? "bg-accent ring-4 ring-accent/25" : "bg-accent"
              }`}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#080808"
                strokeWidth="2.5"
                strokeLinecap="round"
                className={`transition-transform ${sheetOpen ? "rotate-45" : ""}`}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
          {RIGHT.map(tab)}
        </div>
      </nav>
    </>
  );
}
