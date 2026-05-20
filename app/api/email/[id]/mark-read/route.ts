import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { markGmailRead } from "@/lib/gmail";

/**
 * Mark an email as read in BOTH Oushi and Gmail.
 *
 * Fired when the user opens an email modal in Oushi. Without this, the
 * email would remain unread in Gmail until the next sync, and the
 * mismatch between the two products feels broken.
 *
 * Idempotent — already-read emails are a no-op.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data: email } = await service
    .from("emails")
    .select("gmail_message_id, is_read")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  if (email.is_read) {
    return NextResponse.json({ ok: true, already_read: true });
  }

  // Update local state immediately
  await service
    .from("emails")
    .update({ is_read: true, is_unread: false })
    .eq("id", id)
    .eq("user_id", user.id);

  // Mirror to Gmail (best-effort)
  if (email.gmail_message_id) {
    markGmailRead(user.id, email.gmail_message_id).catch((e) => {
      console.error(
        "[email/mark-read] gmail update failed",
        email.gmail_message_id,
        e instanceof Error ? e.message : e
      );
    });
  }

  return NextResponse.json({ ok: true });
}
