import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.subject === "string") update.subject = body.subject.slice(0, 80);
  if (typeof body.content === "string") update.content = body.content.slice(0, 400);
  if (typeof body.pinned === "boolean") update.pinned = body.pinned;
  if (typeof body.ttl_days === "number" && body.ttl_days > 0) {
    update.expires_at = new Date(Date.now() + body.ttl_days * 24 * 60 * 60 * 1000).toISOString();
  }

  const { data, error } = await supabase
    .from("memory_entries")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memory: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("memory_entries").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
