import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const TABLES = ["workouts", "runs", "meals", "favorites"] as const;

export async function GET() {
  try {
    const db = supabaseAdmin();
    const [workouts, runs, meals, favorites] = await Promise.all([
      db.from("workouts").select("*").order("created_at", { ascending: true }).limit(5000),
      db.from("runs").select("*").order("created_at", { ascending: true }).limit(5000),
      db.from("meals").select("*").order("created_at", { ascending: true }).limit(5000),
      db.from("favorites").select("*").order("created_at", { ascending: true }).limit(5000),
    ]);

    const err = workouts.error || runs.error || meals.error || favorites.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    return NextResponse.json({
      exported_at: new Date().toISOString(),
      workouts: workouts.data ?? [],
      runs: runs.data ?? [],
      meals: meals.data ?? [],
      favorites: favorites.data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Restores by upserting each row on its id — matching ids are overwritten
// with the imported version, new ids are inserted, and anything already in
// the database that isn't present in the import is left untouched. Never
// deletes.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = supabaseAdmin();
    const imported: Record<string, number> = {};

    for (const table of TABLES) {
      const rows = Array.isArray(body[table]) ? body[table] : [];
      if (rows.length === 0) {
        imported[table] = 0;
        continue;
      }
      const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
      if (error) {
        return NextResponse.json({ error: `${table}: ${error.message}`, imported }, { status: 500 });
      }
      imported[table] = rows.length;
    }

    return NextResponse.json({ ok: true, imported });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
