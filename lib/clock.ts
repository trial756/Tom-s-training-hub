// Clock values typed on a phone: digits only, colons added from the right.

// Accepts "H:MM:SS", "MM:SS", or a bare number of seconds/minutes.
export function parseClock(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

// Formats a raw digit string (no colons) as a clock value, building from the
// right: last 2 digits are seconds, the next 2 are minutes, anything left
// over is hours. "10517" -> "1:05:17", "844" -> "8:44". Deleting the last
// digit and reformatting naturally shortens it, so this doubles as the
// backspace behavior too.
export function digitsToClock(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, d.length - 2)}:${d.slice(-2)}`;
  return `${d.slice(0, d.length - 4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

/** Seconds back into the raw digits the clock fields hold ("1:05:17" -> "10517"). */
export function secondsToDigits(total: number | null): string {
  if (total == null || total <= 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round(total % 60);
  if (h > 0) return `${h}${String(m).padStart(2, "0")}${String(s).padStart(2, "0")}`;
  if (m > 0) return `${m}${String(s).padStart(2, "0")}`;
  return String(s);
}
