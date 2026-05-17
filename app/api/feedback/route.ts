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
  const { email_id, signal, metadata } = body;

  if (!email_id || !signal) {
    return NextResponse.json(
      { error: "email_id and signal are required" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    email_id,
    signal,
    metadata: metadata || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Persist score changes to DB so syncs don't reset them
  const { data: email } = await supabase
    .from("emails")
    .select("score, from_email")
    .eq("id", email_id)
    .single();

  if (email) {
    if (signal === "upvote") {
      const newScore = Math.min(100, (email.score || 50) + 15);
      const category = newScore >= 75 ? "critical" : newScore >= 40 ? "useful" : "low_priority";
      await supabase
        .from("emails")
        .update({ score: newScore, category })
        .eq("id", email_id);

      // Boost other emails from same sender
      try {
        await supabase.rpc("boost_sender_emails", {
          p_user_id: user.id,
          p_from_email: email.from_email,
          p_exclude_id: email_id,
          p_boost: 8,
        });
      } catch {
        // RPC may not exist yet — non-critical
      }
    }

    if (signal === "downvote") {
      const newScore = Math.max(0, (email.score || 50) - 30);
      const category =
        newScore >= 75 ? "critical" : newScore >= 40 ? "useful" : newScore >= 20 ? "low_priority" : "noise";
      await supabase
        .from("emails")
        .update({ score: newScore, category })
        .eq("id", email_id);
    }
  }

  return NextResponse.json({ success: true });
}
