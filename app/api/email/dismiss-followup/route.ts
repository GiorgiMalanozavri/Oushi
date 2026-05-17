import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email_id } = await request.json();
  if (!email_id) return NextResponse.json({ error: "email_id required" }, { status: 400 });

  await supabase
    .from("emails")
    .update({ followup_dismissed_at: new Date().toISOString() })
    .eq("id", email_id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
