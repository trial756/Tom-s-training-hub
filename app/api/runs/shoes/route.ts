import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Distinct shoes already logged, with accumulated mileage and most recent
 * use. Backs the shoe picker on the run form — picking from this list is
 * what keeps one pair from fragmenting into several near-identical names
 * and splitting its mileage in the tracker.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from("runs")
      .select("shoes, distance_miles, logged_at")
      .not("shoes", "is", null)
      .order("logged_at", { ascending: false })
      .limit(1000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byShoe = new Map<string, { shoes: string; miles: number; lastUsed: string }>();
    for (const row of data ?? []) {
      const name = typeof row.shoes === "string" ? row.shoes.trim() : "";
      if (!name) continue;
      const existing = byShoe.get(name);
      const miles = Number(row.distance_miles) || 0;
      if (existing) {
        existing.miles += miles;
      } else {
        // Rows arrive newest-first, so the first one seen is the last used.
        byShoe.set(name, { shoes: name, miles, lastUsed: row.logged_at });
      }
    }

    const shoes = Array.from(byShoe.values())
      .map((s) => ({ ...s, miles: Math.round(s.miles * 10) / 10 }))
      .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());

    return NextResponse.json({ shoes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
