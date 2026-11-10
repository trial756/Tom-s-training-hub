// Icons for the bottom nav and the Log sheet.

export type IconProps = { active: boolean };

export function StatsIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#00e676" : "#6b6b6b"} strokeWidth="2" strokeLinecap="round">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}

export function TodayIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#00e676" : "#6b6b6b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}

export function LogIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#00e676" : "#6b6b6b"} strokeWidth="2" strokeLinecap="round">
      <path d="M6.5 6.5h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
      <path d="M9 3v4M15 3v4M8 13h8M8 17h5" />
    </svg>
  );
}

export function RunIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#00e676" : "#6b6b6b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16.5" cy="4.5" r="1.8" fill={active ? "#00e676" : "#6b6b6b"} stroke="none" />
      <path d="M13.5 8 10 10l1.5 3.5L9 15l-2.5 5M13.5 8l3 2 3.5-1M13.5 8 12 12l3.5 1.5.5 4.5" />
    </svg>
  );
}

export function FuelIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#00e676" : "#6b6b6b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3v6a3 3 0 0 0 6 0V3M10 9v12M17 3v18M17 3c2 0 3 1.5 3 4v3c0 1.5-1 2-3 2" />
    </svg>
  );
}

export function HistoryIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#00e676" : "#6b6b6b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 2.6-6.3L3 8" />
      <path d="M3 3v5h5M12 7v5l4 2" />
    </svg>
  );
}

export function MarathonIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#00e676" : "#6b6b6b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21 9 7l3 4 3-4 5 14" />
      <path d="M7 15h10" />
    </svg>
  );
}
