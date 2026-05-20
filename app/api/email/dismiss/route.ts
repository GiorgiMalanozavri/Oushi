import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { archiveGmailMessage } from "@/lib/gmail";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email_id } = await request.json();
  if (!email_id) {
    return NextResponse.json({ error: "email_id required" }, { status: 400 });
  }

  const service = await createServiceClient();

  // Look up the Gmail message id so we can mirror the dismissal to Gmail
  // (archive — remove INBOX label).
  const { data: email } = await service
    .from("emails")
    .select("gmail_message_id")
    .eq("id", email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  await service
    .from("emails")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", email_id)
    .eq("user_id", user.id);

  // Mirror to Gmail. Best-effort — don't block the response if it fails.
  if (email?.gmail_message_id) {
    archiveGmailMessage(user.id, email.gmail_message_id).catch((e) => {
      console.error(
        "[email/dismiss] gmail archive failed",
        email.gmail_message_id,
        e instanceof Error ? e.message : e
      );
    });
  }

  return NextResponse.json({ ok: true });
}
