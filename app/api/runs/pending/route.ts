import { NextResponse } from "next/server";
import { pendingRuns } from "@/lib/runReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Garmin runs awaiting confirmation, newest first, with what the plan had that day. */
export async function GET() {
  try {
    return NextResponse.json({ pending: await pendingRuns() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error", pending: [] }, { status: 500 });
  }
}
