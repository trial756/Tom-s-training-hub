import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseWeight } from "@/lib/weight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin().from("weigh_ins").select("date, weight_lb, note").order("date");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    entries: (data ?? []).map((r) => ({ date: String(r.date).slice(0, 10), weight_lb: Number(r.weight_lb), note: r.note ?? null })),
  });
}

/** One weigh-in per day: a second one the same day replaces the first. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { date?: unknown; weight_lb?: unknown; note?: unknown } | null;
  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const weight = parseWeight(String(body?.weight_lb ?? ""));
  if (!date) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  if (weight == null) return NextResponse.json({ error: "weight must be 60–500 lb" }, { status: 400 });
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  const { error } = await supabaseAdmin().from("weigh_ins").upsert({ date, weight_lb: weight, note }, { onConflict: "date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: { date, weight_lb: weight, note } });
}
