import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The workout in progress, backed up from the phone (lib/workoutSync.ts) so
// a cleared browser or another device can pick it up. One row: one athlete,
// one workout at a time.

export async function GET() {
  const { data, error } = await supabaseAdmin().from("active_workout").select("data").eq("id", "current").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workout: data?.data ?? null });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { workout?: { version?: number; startedAt?: number; exercises?: unknown[] } } | null;
  const w = body?.workout;
  if (!w || w.version !== 1 || typeof w.startedAt !== "number" || !Array.isArray(w.exercises)) {
    return NextResponse.json({ error: "Not a workout." }, { status: 400 });
  }
  if (JSON.stringify(w).length > 200_000) return NextResponse.json({ error: "Workout too large." }, { status: 413 });
  const { error } = await supabaseAdmin()
    .from("active_workout")
    .upsert({ id: "current", data: w, started_at: w.startedAt, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, savedAt: Date.now() });
}

/** Clears the backup — only the workout that was finished, never a newer one. */
export async function DELETE(req: NextRequest) {
  const startedAt = Number(req.nextUrl.searchParams.get("startedAt"));
  if (!Number.isFinite(startedAt) || startedAt <= 0) return NextResponse.json({ error: "startedAt is required" }, { status: 400 });
  const { error } = await supabaseAdmin().from("active_workout").delete().eq("id", "current").eq("started_at", startedAt);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
