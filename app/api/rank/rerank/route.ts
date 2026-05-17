import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rankUnrankedEmails } from "@/lib/ranking";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  // Clear all scores (except emails with feedback — those keep their adjusted scores)
  const { data: feedbackEmailIds } = await service
    .from("feedback")
    .select("email_id")
    .eq("user_id", user.id);

  const feedbackSet = new Set(
    (feedbackEmailIds || []).map((f) => f.email_id)
  );

  const { data: allEmails } = await service
    .from("emails")
    .select("id")
    .eq("user_id", user.id);

  const toReset = (allEmails || []).filter((e) => !feedbackSet.has(e.id));

  for (const email of toReset) {
    await service
      .from("emails")
      .update({ score: null, category: null, reasoning: null, requires_action: false })
      .eq("id", email.id);
  }

  const ranked = await rankUnrankedEmails(user.id);
  return NextResponse.json({ ranked });
}
