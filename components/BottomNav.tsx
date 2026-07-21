"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Stats", icon: StatsIcon },
  { href: "/log", label: "Log", icon: LogIcon },
  { href: "/runs", label: "Runs", icon: RunIcon },
  { href: "/fuel", label: "Fuel", icon: FuelIcon },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/marathon", label: "Marathon", icon: MarathonIcon },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-base-700 bg-black/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 pb-[calc(env(safe-area-inset-bottom)+4px)] pt-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors"
            >
              <Icon active={active} />
              <span
                className={`text-[10px] font-medium ${active ? "text-accent" : "text-gray-500"}`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type IconProps = { active: boolean };

function StatsIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#ff5b2e" : "#6b7280"} strokeWidth="2" strokeLinecap="round">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}

function LogIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#ff5b2e" : "#6b7280"} strokeWidth="2" strokeLinecap="round">
      <path d="M6.5 6.5h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M9 3v4M15 3v4M8 13h8M8 17h5" />
    </svg>
  );
}

function RunIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#ff5b2e" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16.5" cy="4.5" r="1.8" fill={active ? "#ff5b2e" : "#6b7280"} stroke="none" />
      <path d="M13.5 8 10 10l1.5 3.5L9 15l-2.5 5M13.5 8l3 2 3.5-1M13.5 8 12 12l3.5 1.5.5 4.5" />
    </svg>
  );
}

function FuelIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#ff5b2e" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3v6a3 3 0 0 0 6 0V3M10 9v12M17 3v18M17 3c2 0 3 1.5 3 4v3c0 1.5-1 2-3 2" />
    </svg>
  );
}

function HistoryIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#ff5b2e" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 2.6-6.3L3 8" />
      <path d="M3 3v5h5M12 7v5l4 2" />
    </svg>
  );
}

function MarathonIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#ff5b2e" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21 9 7l3 4 3-4 5 14" />
      <path d="M7 15h10" />
    </svg>
  );
}
