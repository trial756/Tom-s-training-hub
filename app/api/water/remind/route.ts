import { NextResponse } from "next/server";
import { APP_TIMEZONE, localDateKey } from "@/lib/format";
import { loadWaterDay } from "@/lib/waterStore";
import { behindAt5pm } from "@/lib/water";
import { pushToAll } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The 5pm water check (Vercel cron, vercel.json): one push, only when the
 * day is behind. The cron is daily at 23:00 UTC — 5pm Central in winter,
 * 6pm in summer — and on the Hobby plan may land anywhere in that hour, so
 * it also checks it's late afternoon in Tyler before sending.
 */
export async function GET() {
  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", hour12: false }));
  if (hour < 16 || hour > 19) return NextResponse.json({ skipped: `local hour ${hour}` });
  const day = await loadWaterDay(localDateKey(now));
  if (!behindAt5pm(day.totalOz, day.target.oz)) return NextResponse.json({ onTrack: true, total: day.totalOz, target: day.target.oz });
  const left = Math.max(0, day.target.oz - day.totalOz);
  const sent = await pushToAll({
    title: "Water check",
    body: `${Math.round(day.totalOz)} of ${day.target.oz} oz so far — about ${Math.round(left)} oz to go today.`,
    url: "/",
    tag: "water",
  });
  return NextResponse.json({ sent, total: day.totalOz, target: day.target.oz });
}
