import { NextRequest, NextResponse } from "next/server";
import { GarminError } from "@/lib/garmin";
import { syncGarmin } from "@/lib/garminSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A backfill chunk plus coaching for a fresh run can take a while.
export const maxDuration = 60;

async function handle(force: boolean) {
  try {
    return NextResponse.json(await syncGarmin({ force }));
  } catch (err) {
    const e = err instanceof GarminError ? err : null;
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: e?.code ?? "unexpected",
      status: e?.status ?? null,
      imported: 0,
      merged: 0,
      linked: 0,
      backfillDone: true,
    });
  }
}

/** The app calls this when it opens; throttled server-side to every 10 minutes. */
export async function POST(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get("force") === "1");
}

/** Vercel's daily cron, as a backstop for days the app isn't opened. */
export async function GET() {
  return handle(false);
}
