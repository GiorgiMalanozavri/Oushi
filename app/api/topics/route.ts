import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_topics")
    .select("*")
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topics: data || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, color } = await request.json();
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const trimmed = name.trim();
  if (trimmed.length > 40) {
    return NextResponse.json({ error: "name too long" }, { status: 400 });
  }

  const { count } = await supabase
    .from("user_topics")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count || 0) >= 10) {
    return NextResponse.json({ error: "Topic limit reached (10)" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_topics")
    .insert({
      user_id: user.id,
      name: trimmed,
      description: (description || "").slice(0, 200),
      color: color || "orange",
      position: count || 0,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Topic already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ topic: data });
}
