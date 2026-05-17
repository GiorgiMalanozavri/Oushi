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

  if (typeof body.name === "string" && body.name.trim().length > 0) {
    update.name = body.name.trim().slice(0, 40);
  }
  if (typeof body.description === "string") {
    update.description = body.description.slice(0, 200);
  }
  if (typeof body.color === "string") update.color = body.color;
  if (typeof body.position === "number") update.position = body.position;

  const { data, error } = await supabase
    .from("user_topics")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topic: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: topic } = await supabase
    .from("user_topics")
    .select("name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  await supabase.from("user_topics").delete().eq("id", id).eq("user_id", user.id);

  // Strip the deleted topic name from any emails that had it
  if (topic?.name) {
    const { data: affected } = await supabase
      .from("emails")
      .select("id, matched_topics")
      .eq("user_id", user.id)
      .contains("matched_topics", [topic.name]);

    for (const e of affected || []) {
      const next = (e.matched_topics || []).filter((n: string) => n !== topic.name);
      await supabase.from("emails").update({ matched_topics: next }).eq("id", e.id);
    }
  }

  return NextResponse.json({ ok: true });
}
