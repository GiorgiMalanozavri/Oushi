import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedClient, parseGmailMessage } from "@/lib/gmail";
import {
  findExtractableAttachments,
  extractAttachmentsForMessage,
} from "@/lib/attachments";

export const maxDuration = 300;

/**
 * Re-fetches the last 14 days of synced emails from Gmail and:
 *   - Rewrites body_preview + snippet using the latest HTML-stripping rules
 *   - Extracts PDF/image attachment text via Claude vision (if not already done)
 *
 * Safe to call repeatedly — attachment extraction is cached per email.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data: emails } = await service
    .from("emails")
    .select("id, gmail_message_id, subject, attachments_text, score")
    .eq("user_id", user.id)
    .gte("received_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order("received_at", { ascending: false })
    .limit(120);

  if (!emails || emails.length === 0) {
    return NextResponse.json({ refreshed: 0, attachments_extracted: 0 });
  }

  const oauth2Client = await getAuthenticatedClient(user.id);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  let refreshed = 0;
  let attachmentsExtracted = 0;
  let attachmentsSkipped = 0;
  const batchSize = 10;

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((e) =>
        gmail.users.messages.get({ userId: "me", id: e.gmail_message_id, format: "full" })
      )
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const row = batch[j];
      if (r.status !== "fulfilled") continue;
      const parsed = parseGmailMessage(r.value.data);

      // Check for attachments
      const refs = findExtractableAttachments(r.value.data.payload);
      const hasAttachments = refs.length > 0;

      // Decide whether to extract attachment text:
      // - has at least one attachment
      // - no attachments_text yet stored (cached check)
      // - email is at least score >= 25 (or unscored) to avoid wasting vision on obvious noise
      let attachmentsText: string | null = null;
      let attachmentsExtractedAt: string | null = null;

      if (hasAttachments && !row.attachments_text && (row.score === null || row.score >= 25)) {
        try {
          const text = await extractAttachmentsForMessage(
            oauth2Client,
            row.gmail_message_id,
            row.subject || parsed.subject,
            r.value.data.payload
          );
          if (text) {
            attachmentsText = text;
            attachmentsExtractedAt = new Date().toISOString();
            attachmentsExtracted++;
          }
        } catch (e) {
          console.error("[refresh-bodies] attachment extract failed", row.gmail_message_id, e instanceof Error ? e.message : e);
        }
      } else if (hasAttachments && row.attachments_text) {
        attachmentsSkipped++;
      }

      await service
        .from("emails")
        .update({
          body_preview: parsed.body_preview,
          snippet: parsed.snippet,
          has_attachments: hasAttachments,
          ...(attachmentsText
            ? { attachments_text: attachmentsText, attachments_extracted_at: attachmentsExtractedAt }
            : {}),
        })
        .eq("id", row.id)
        .eq("user_id", user.id);
      refreshed++;
    }
  }

  return NextResponse.json({
    refreshed,
    attachments_extracted: attachmentsExtracted,
    attachments_already_cached: attachmentsSkipped,
  });
}
