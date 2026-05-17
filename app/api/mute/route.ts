import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { mute_type, value } = body;

  if (!mute_type || !value) {
    return NextResponse.json(
      { error: "mute_type and value are required" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("user_mutes").insert({
    user_id: user.id,
    mute_type,
    value,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("emails")
    .update({ category: "noise", score: 0 })
    .eq("user_id", user.id)
    .eq(mute_type === "sender" ? "from_email" : "from_email", value);

  if (mute_type === "domain") {
    await supabase.rpc("mute_domain_emails", {
      p_user_id: user.id,
      p_domain: value,
    });
  }

  return NextResponse.json({ success: true });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: mutes } = await supabase
    .from("user_mutes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ mutes: mutes || [] });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const muteId = searchParams.get("id");

  if (!muteId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_mutes")
    .delete()
    .eq("id", muteId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
