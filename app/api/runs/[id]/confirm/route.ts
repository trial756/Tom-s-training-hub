import { NextRequest, NextResponse } from "next/server";
import { confirmRun } from "@/lib/runReview";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Confirms a run awaiting review: saves the form's values and writes coaching
 * for the run type the athlete chose, with the day's plan for context.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ run: await confirmRun(id, body) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
