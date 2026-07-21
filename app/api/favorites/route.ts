import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { FavoriteType } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") as FavoriteType | null;
  let query = supabaseAdmin().from("favorites").select("*").order("created_at", { ascending: false });
  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ favorites: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, name, raw_text, data } = body as {
    type: FavoriteType;
    name: string;
    raw_text: string;
    data: Record<string, unknown>;
  };

  if (!type || !name || !raw_text) {
    return NextResponse.json({ error: "Missing type, name, or raw_text." }, { status: 400 });
  }

  const { data: favorite, error } = await supabaseAdmin()
    .from("favorites")
    .insert({ type, name, raw_text, data: data ?? {} })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ favorite }, { status: 201 });
}
