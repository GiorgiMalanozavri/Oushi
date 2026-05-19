import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmailAsUser, getMessageHeaders } from "@/lib/gmail";
import { autoFulfillForThread } from "@/lib/commitments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body } = await request.json();
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  const service = await createServiceClient();
  const { data: email } = await service
    .from("emails")
    .select("gmail_message_id, gmail_thread_id, from_email, subject")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  let inReplyTo: string | null = null;
  let references: string | null = null;
  let threadId: string | null = email.gmail_thread_id || null;
  try {
    const headers = await getMessageHeaders(user.id, email.gmail_message_id);
    inReplyTo = headers.messageId;
    references = headers.references
      ? `${headers.references} ${headers.messageId || ""}`.trim()
      : headers.messageId;
    if (headers.threadId) threadId = headers.threadId;
  } catch {
    // proceed without proper threading headers — message still sends, just may not thread
  }

  const subject = email.subject?.startsWith("Re:")
    ? email.subject
    : `Re: ${email.subject || ""}`;

  try {
    const result = await sendEmailAsUser(user.id, {
      to: email.from_email,
      subject,
      body: body.trim(),
      inReplyTo: inReplyTo || undefined,
      references: references || undefined,
      threadId: threadId || undefined,
    });

    // Mark this thread as user-replied so it leaves the "awaiting reply" bucket
    await service
      .from("emails")
      .update({ user_replied: true })
      .eq("user_id", user.id)
      .eq("gmail_thread_id", threadId);

    // Auto-fulfill any open commitments in this thread — the user just
    // sent a follow-up, so the promise is done.
    let autoFulfilled = 0;
    if (threadId && result.data.id) {
      try {
        autoFulfilled = await autoFulfillForThread(
          service,
          user.id,
          threadId,
          result.data.id
        );
      } catch {
        // Non-fatal — the reply went out successfully.
      }
    }

    return NextResponse.json({
      ok: true,
      messageId: result.data.id,
      autoFulfilled,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    const needsReauth = /insufficient.*scope|invalid_scope|permission/i.test(msg);
    return NextResponse.json(
      { error: msg, needsReauth },
      { status: 500 }
    );
  }
}
