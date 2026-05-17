import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("memory_entries")
    .select("*")
    .eq("user_id", user.id)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memories: data || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind, subject, content, ttl_days, pinned } = await request.json();

  const validKinds = ["person", "project", "commitment", "deadline", "preference", "context"];
  if (!validKinds.includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (typeof subject !== "string" || subject.trim().length === 0 || subject.length > 80) {
    return NextResponse.json({ error: "Subject required (max 80 chars)" }, { status: 400 });
  }
  if (typeof content !== "string" || content.trim().length === 0 || content.length > 400) {
    return NextResponse.json({ error: "Content required (max 400 chars)" }, { status: 400 });
  }

  const ttl = typeof ttl_days === "number" && ttl_days > 0 ? ttl_days : 365;
  const expires_at = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("memory_entries")
    .insert({
      user_id: user.id,
      kind,
      subject: subject.trim(),
      content: content.trim(),
      confidence: "high",
      pinned: !!pinned,
      expires_at,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memory: data });
}
