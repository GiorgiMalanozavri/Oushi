import { google } from "googleapis";
import { createServiceClient } from "@/lib/supabase/server";
import {
  findExtractableAttachments,
  extractAttachmentsForMessage,
} from "@/lib/attachments";
import { prefilter } from "@/lib/prefilter";

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export async function getAuthenticatedClient(userId: string) {
  const supabase = await createServiceClient();
  const { data: tokens } = await supabase
    .from("user_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!tokens) throw new Error("No Gmail tokens found");

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expires_at
      ? new Date(tokens.expires_at).getTime()
      : undefined,
  });

  oauth2Client.on("tokens", async (newTokens) => {
    await supabase
      .from("user_tokens")
      .update({
        access_token: newTokens.access_token,
        expires_at: newTokens.expiry_date
          ? new Date(newTokens.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  });

  return oauth2Client;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function encodeBase64Url(data: string): string {
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
  html?: boolean;
}

export async function sendEmailAsUser(userId: string, opts: SendEmailOptions) {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const profile = await gmail.users.getProfile({ userId: "me" });
  const fromEmail = profile.data.emailAddress || "me";

  const headers: string[] = [
    `From: ${fromEmail}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Content-Type: ${opts.html ? "text/html" : "text/plain"}; charset=utf-8`,
    "MIME-Version: 1.0",
  ];
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headers.push(`References: ${opts.references}`);

  const raw = encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${opts.body}`);

  return gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      ...(opts.threadId ? { threadId: opts.threadId } : {}),
    },
  });
}

export async function getMessageHeaders(userId: string, gmailMessageId: string) {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "References", "Subject"],
  });
  const headers = res.data.payload?.headers || [];
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || null;
  return {
    messageId: get("Message-ID"),
    references: get("References"),
    subject: get("Subject"),
    threadId: res.data.threadId || null,
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|tr|li|h[1-6]|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findPart(payload: any, predicate: (p: any) => boolean): any {
  if (predicate(payload)) return payload;
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findPart(part, predicate);
      if (found) return found;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): string {
  // 1. Prefer text/plain anywhere in the tree
  const plain = findPart(payload, (p) => p.mimeType === "text/plain" && p.body?.data);
  if (plain) {
    return decodeBase64Url(plain.body.data);
  }
  // 2. Fall back to text/html anywhere in the tree, strip tags
  const html = findPart(payload, (p) => p.mimeType === "text/html" && p.body?.data);
  if (html) {
    return htmlToText(decodeBase64Url(html.body.data));
  }
  return "";
}

export interface ParsedEmail {
  gmail_message_id: string;
  gmail_thread_id: string;
  from_email: string;
  from_name: string;
  subject: string;
  snippet: string;
  body_preview: string;
  received_at: string;
  is_read: boolean;
  is_unread: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseGmailMessage(message: any): ParsedEmail {
  const headers: Array<{ name?: string; value?: string }> = message.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ||
    "";

  const fromRaw = getHeader("From");
  const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
  const from_name = fromMatch ? fromMatch[1].replace(/"/g, "").trim() : fromRaw;
  const from_email = fromMatch ? fromMatch[2] : fromRaw;

  const body = message.payload ? extractBody(message.payload) : "";
  const labels: string[] = message.labelIds || [];
  const isUnread = labels.includes("UNREAD");

  return {
    gmail_message_id: message.id || "",
    gmail_thread_id: message.threadId || "",
    from_email,
    from_name,
    subject: getHeader("Subject"),
    snippet: message.snippet || "",
    body_preview: body.slice(0, 8000),
    received_at: message.internalDate
      ? new Date(parseInt(message.internalDate)).toISOString()
      : new Date().toISOString(),
    is_read: !isUnread,
    is_unread: isUnread,
  };
}

export async function syncRecentEmails(userId: string, count = 100) {
  const supabase = await createServiceClient();
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const { data: mutes } = await supabase
    .from("user_mutes")
    .select("*")
    .eq("user_id", userId);

  const mutedSenders = new Set(
    (mutes || []).filter((m) => m.mute_type === "sender").map((m) => m.value)
  );
  const mutedDomains = new Set(
    (mutes || []).filter((m) => m.mute_type === "domain").map((m) => m.value)
  );

  const profile = await gmail.users.getProfile({ userId: "me" });
  const userGmail = profile.data.emailAddress?.toLowerCase() || "";

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults: count,
    q: "in:inbox",
  });

  const messageIds = listResponse.data.messages || [];
  const emails: ParsedEmail[] = [];

  const batchSize = 10;
  // Track raw payloads alongside parsed emails so we can later walk attachments
  const rawPayloadByGmailId = new Map<string, unknown>();

  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((msg) =>
        gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        })
      )
    );
    for (const r of results) {
      const parsed = parseGmailMessage(r.data);
      emails.push(parsed);
      if (parsed.gmail_message_id) {
        rawPayloadByGmailId.set(parsed.gmail_message_id, r.data.payload);
      }
    }
  }

  const threadIds = Array.from(new Set(emails.map((e) => e.gmail_thread_id))).filter(Boolean);

  interface ThreadInfo {
    userReplied: boolean;
    lastMessageAt: string | null;
    userWasLastSender: boolean;
    userLastSentAt: string | null;
  }
  const threadInfo = new Map<string, ThreadInfo>();

  for (let i = 0; i < threadIds.length; i += batchSize) {
    const batch = threadIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((tid) =>
        gmail.users.threads.get({
          userId: "me",
          id: tid,
          format: "metadata",
          metadataHeaders: ["From"],
        })
      )
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const thread = r.value.data;
      if (!thread.id) continue;
      const messages = thread.messages || [];

      let userReplied = false;
      let lastMessageAt: number | null = null;
      let lastSenderWasUser = false;
      let userLastSentAt: number | null = null;

      // Messages from Gmail come ordered ascending by date in a thread.
      for (const m of messages) {
        const fromHeader = (m.payload?.headers || []).find(
          (h) => h.name?.toLowerCase() === "from"
        )?.value;
        const match = fromHeader?.match(/<(.+?)>/);
        const addr = (match ? match[1] : fromHeader || "").toLowerCase();
        const isFromUser = addr === userGmail;
        const ts = m.internalDate ? parseInt(m.internalDate) : 0;

        if (isFromUser) {
          userReplied = true;
          if (!userLastSentAt || ts > userLastSentAt) userLastSentAt = ts;
        }
        if (!lastMessageAt || ts >= lastMessageAt) {
          lastMessageAt = ts;
          lastSenderWasUser = isFromUser;
        }
      }

      threadInfo.set(thread.id, {
        userReplied,
        lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
        userWasLastSender: lastSenderWasUser,
        userLastSentAt: userLastSentAt ? new Date(userLastSentAt).toISOString() : null,
      });
    }
  }

  for (const email of emails) {
    const domain = email.from_email.split("@")[1];
    const isMuted =
      mutedSenders.has(email.from_email) || mutedDomains.has(domain);
    const info = threadInfo.get(email.gmail_thread_id);

    // Look at attachments — only spend Claude vision on emails that look real
    // (not auto-muted, not pre-filtered as noise). Skip otherwise to save cost.
    const rawPayload = rawPayloadByGmailId.get(email.gmail_message_id);
    const attachmentRefs = rawPayload ? findExtractableAttachments(rawPayload) : [];
    const hasAttachments = attachmentRefs.length > 0;

    let attachmentsText: string | null = null;
    let attachmentsExtractedAt: string | null = null;

    if (hasAttachments && !isMuted) {
      const preNoise = prefilter({
        from_email: email.from_email,
        subject: email.subject,
        snippet: email.snippet,
        body_preview: email.body_preview,
      });
      const isPreFilteredNoise = preNoise !== null && preNoise.score < 25;

      if (!isPreFilteredNoise) {
        try {
          // Check if we already extracted for this message (cheap check)
          const { data: existing } = await supabase
            .from("emails")
            .select("attachments_text, attachments_extracted_at")
            .eq("user_id", userId)
            .eq("gmail_message_id", email.gmail_message_id)
            .maybeSingle();

          if (existing?.attachments_text && existing?.attachments_extracted_at) {
            // Already done — don't re-extract
            attachmentsText = existing.attachments_text;
            attachmentsExtractedAt = existing.attachments_extracted_at;
          } else {
            const extracted = await extractAttachmentsForMessage(
              oauth2Client,
              email.gmail_message_id,
              email.subject,
              rawPayload
            );
            if (extracted) {
              attachmentsText = extracted;
              attachmentsExtractedAt = new Date().toISOString();
            }
          }
        } catch (e) {
          console.error("[sync] attachment extract failed for", email.gmail_message_id, e instanceof Error ? e.message : e);
        }
      }
    }

    await supabase.from("emails").upsert(
      {
        user_id: userId,
        ...email,
        user_replied: info?.userReplied ?? false,
        last_thread_message_at: info?.lastMessageAt ?? null,
        user_was_last_sender: info?.userWasLastSender ?? false,
        user_last_sent_at: info?.userLastSentAt ?? null,
        last_synced_at: new Date().toISOString(),
        has_attachments: hasAttachments,
        ...(attachmentsText ? { attachments_text: attachmentsText, attachments_extracted_at: attachmentsExtractedAt } : {}),
        ...(isMuted ? { category: "noise", score: 0 } : {}),
      },
      { onConflict: "user_id,gmail_message_id" }
    );
  }

  await supabase
    .from("user_sync_state")
    .upsert(
      {
        user_id: userId,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  return emails.length;
}
