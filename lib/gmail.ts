import { google } from "googleapis";
import { createServiceClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  findExtractableAttachments,
  extractAttachmentsForMessage,
} from "@/lib/attachments";
import {
  isAutomatedEmail,
  isTrueTransactional,
} from "@/lib/outstanding";

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Connection health
// ─────────────────────────────────────────────────────────────────────────

/**
 * Marks a user's Gmail connection as invalid. Called from sync paths
 * when the Gmail API returns a 401/invalid_grant — the refresh token
 * is gone (user revoked, expired, etc) and every subsequent call will
 * fail. The dashboard reads this column to show a Reconnect banner.
 */
export async function markGmailTokenInvalid(
  userId: string,
  reason: string
): Promise<void> {
  try {
    const service = await createServiceClient();
    await service
      .from("user_tokens")
      .update({
        invalidated_at: new Date().toISOString(),
        invalidation_reason: reason.slice(0, 200),
      })
      .eq("user_id", userId);
  } catch (e) {
    // Don't let logging-the-error itself crash a code path.
    console.error(
      "[gmail] markGmailTokenInvalid failed",
      e instanceof Error ? e.message : e
    );
  }
}

/**
 * Clears the invalidation flag after a successful re-auth. Called by
 * /api/gmail/callback when a fresh token gets written.
 */
export async function clearGmailTokenInvalid(userId: string): Promise<void> {
  try {
    const service = await createServiceClient();
    await service
      .from("user_tokens")
      .update({
        invalidated_at: null,
        invalidation_reason: null,
      })
      .eq("user_id", userId);
  } catch (e) {
    console.error(
      "[gmail] clearGmailTokenInvalid failed",
      e instanceof Error ? e.message : e
    );
  }
}

/**
 * Heuristic for whether an error from a Gmail API call is the "the
 * user's refresh token is bad, full stop" kind vs a transient network
 * blip. Matches both google-auth-library `invalid_grant` and the
 * generic 401 status. Anything else, we don't flip the invalidation
 * flag — better to retry than to falsely lock a user out.
 */
export function isGmailAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (err as any)?.code ?? (err as any)?.status ?? null;
  if (code === 401) return true;
  return (
    msg.includes("invalid_grant") ||
    msg.includes("Invalid Credentials") ||
    msg.includes("Token has been expired or revoked")
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
    refresh_token: decrypt(tokens.refresh_token),
    access_token: decrypt(tokens.access_token),
    expiry_date: tokens.expires_at
      ? new Date(tokens.expires_at).getTime()
      : undefined,
  });

  oauth2Client.on("tokens", async (newTokens) => {
    await supabase
      .from("user_tokens")
      .update({
        access_token: newTokens.access_token ? encrypt(newTokens.access_token) : null,
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

/**
 * RFC 2047 encoded-word for headers containing non-ASCII bytes.
 * Without this, em-dashes and unicode in subject lines render as
 * mojibake ("Ã¢Â€Â") in most clients.
 */
function encodeMimeHeader(value: string): string {
  // Pure ASCII? Leave it alone.
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const b64 = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

export async function sendEmailAsUser(userId: string, opts: SendEmailOptions) {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const profile = await gmail.users.getProfile({ userId: "me" });
  const fromEmail = profile.data.emailAddress || "me";

  const headers: string[] = [
    `From: ${fromEmail}`,
    `To: ${opts.to}`,
    `Subject: ${encodeMimeHeader(opts.subject)}`,
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

/**
 * Create a draft reply in the user's Gmail. Same RFC 2822 message shape
 * as sendEmailAsUser but posted to drafts.create instead — appears in
 * the user's Gmail drafts folder, threaded to the original message.
 *
 * Returns the Gmail draft ID, which we store on emails.gmail_draft_id
 * so we don't double-draft the same email and so the UI can show
 * "Draft ready in Gmail" indicators.
 */
export async function createDraftReply(
  userId: string,
  opts: {
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
  }
): Promise<{ draftId: string; messageId: string | null }> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const profile = await gmail.users.getProfile({ userId: "me" });
  const fromEmail = profile.data.emailAddress || "me";

  const headers: string[] = [
    `From: ${fromEmail}`,
    `To: ${opts.to}`,
    `Subject: ${encodeMimeHeader(opts.subject)}`,
    `Content-Type: text/plain; charset=utf-8`,
    "MIME-Version: 1.0",
  ];
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headers.push(`References: ${opts.references}`);

  const raw = encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${opts.body}`);

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw,
        ...(opts.threadId ? { threadId: opts.threadId } : {}),
      },
    },
  });

  return {
    draftId: res.data.id || "",
    messageId: res.data.message?.id || null,
  };
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

/**
 * Add / remove labels on a single Gmail message. Used by Oushi -> Gmail
 * state sync (dismiss = remove INBOX, mark read = remove UNREAD, etc.).
 */
export async function modifyMessageLabels(
  userId: string,
  gmailMessageId: string,
  opts: { add?: string[]; remove?: string[] } = {}
) {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  await gmail.users.messages.modify({
    userId: "me",
    id: gmailMessageId,
    requestBody: {
      addLabelIds: opts.add || [],
      removeLabelIds: opts.remove || [],
    },
  });
}

export async function markGmailRead(userId: string, gmailMessageId: string) {
  await modifyMessageLabels(userId, gmailMessageId, { remove: ["UNREAD"] });
}

export async function markGmailUnread(userId: string, gmailMessageId: string) {
  await modifyMessageLabels(userId, gmailMessageId, { add: ["UNREAD"] });
}

export async function archiveGmailMessage(userId: string, gmailMessageId: string) {
  await modifyMessageLabels(userId, gmailMessageId, { remove: ["INBOX"] });
}

/**
 * Incremental sync via Gmail's history.list API. Processes only changes
 * since the last known historyId — orders of magnitude cheaper than
 * re-fetching the latest N messages every time.
 *
 * Returns the count of new messages added. If history.list returns a 404
 * (historyId expired — Gmail keeps them ~1 week), falls back to a fresh
 * full sync and captures a new historyId.
 */
export async function syncIncremental(userId: string): Promise<{
  added: number;
  read: number;
  archived: number;
  starred: number;
  unstarred: number;
  fellback: boolean;
}> {
  const supabase = await createServiceClient();
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const { data: state } = await supabase
    .from("user_sync_state")
    .select("last_history_id")
    .eq("user_id", userId)
    .maybeSingle();

  // No historyId means this is the first run — do a regular sync and
  // capture the current historyId for next time.
  if (!state?.last_history_id) {
    const added = await syncRecentEmails(userId, 30);
    const profile = await gmail.users.getProfile({ userId: "me" });
    const currentHistoryId = profile.data.historyId;
    if (currentHistoryId) {
      await supabase
        .from("user_sync_state")
        .upsert(
          {
            user_id: userId,
            last_history_id: currentHistoryId,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    }
    return { added, read: 0, archived: 0, starred: 0, unstarred: 0, fellback: true };
  }

  // Incremental path
  let added = 0;
  let read = 0;
  let archived = 0;
  let starred = 0;
  let unstarred = 0;
  const newMessageIds = new Set<string>();
  const labelChanges = new Map<
    string,
    { addedLabels: Set<string>; removedLabels: Set<string> }
  >();

  let pageToken: string | undefined;
  let latestHistoryId: string | undefined;

  do {
    try {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId: state.last_history_id,
        pageToken,
        maxResults: 100,
      });

      latestHistoryId = res.data.historyId || latestHistoryId;

      for (const record of res.data.history || []) {
        for (const m of record.messagesAdded || []) {
          if (m.message?.id) newMessageIds.add(m.message.id);
        }
        for (const m of record.labelsAdded || []) {
          if (!m.message?.id) continue;
          const entry =
            labelChanges.get(m.message.id) ||
            { addedLabels: new Set<string>(), removedLabels: new Set<string>() };
          for (const l of m.labelIds || []) entry.addedLabels.add(l);
          labelChanges.set(m.message.id, entry);
        }
        for (const m of record.labelsRemoved || []) {
          if (!m.message?.id) continue;
          const entry =
            labelChanges.get(m.message.id) ||
            { addedLabels: new Set<string>(), removedLabels: new Set<string>() };
          for (const l of m.labelIds || []) entry.removedLabels.add(l);
          labelChanges.set(m.message.id, entry);
        }
        for (const m of record.messagesDeleted || []) {
          // Hard-delete from our DB too (rare — usually trash, not delete)
          if (m.message?.id) {
            await supabase
              .from("emails")
              .delete()
              .eq("user_id", userId)
              .eq("gmail_message_id", m.message.id);
          }
        }
      }

      pageToken = res.data.nextPageToken || undefined;
    } catch (e) {
      const status = (e as { code?: number; status?: number }).code ||
        (e as { code?: number; status?: number }).status;
      if (status === 404) {
        // History expired — fall back to full sync
        const refresh = await syncRecentEmails(userId, 30);
        const profile = await gmail.users.getProfile({ userId: "me" });
        if (profile.data.historyId) {
          await supabase
            .from("user_sync_state")
            .upsert(
              {
                user_id: userId,
                last_history_id: profile.data.historyId,
                last_synced_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            );
        }
        return { added: refresh, read: 0, archived: 0, starred: 0, unstarred: 0, fellback: true };
      }
      throw e;
    }
  } while (pageToken);

  // Fetch + upsert new messages (full sync only the ones in newMessageIds)
  if (newMessageIds.size > 0) {
    await syncSpecificMessages(userId, Array.from(newMessageIds));
    added = newMessageIds.size;
  }

  // Apply label changes to our DB.
  //
  // The trickiest case is "INBOX removed in Gmail" (i.e. the user
  // archived). We used to blanket-dismiss in Oushi, which broke the
  // "won't let you forget" promise: a user with an inbox-zero habit
  // archives everything in Gmail → every Oushi bucket becomes empty.
  //
  // New rule: only mirror Gmail archive as a dismiss if the user has
  // ALREADY REPLIED to the thread, or the email is genuinely low-signal
  // (score < 30, automated noise, transactional receipt). Important
  // unreplied threads stay visible in Oushi even after a Gmail archive
  // — Oushi is supposed to keep nagging.
  //
  // To make that decision we need the current email state, so we batch-
  // fetch the rows for any messages that have INBOX or TRASH deltas.
  const messageIdsNeedingState: string[] = [];
  for (const [gmailMessageId, changes] of labelChanges) {
    if (
      changes.removedLabels.has("INBOX") ||
      changes.addedLabels.has("TRASH")
    ) {
      messageIdsNeedingState.push(gmailMessageId);
    }
  }
  type EmailState = {
    gmail_message_id: string;
    score: number | null;
    user_replied: boolean | null;
    from_email: string | null;
    subject: string | null;
    snippet: string | null;
    body_preview: string | null;
    category: string | null;
  };
  const stateByGmailId = new Map<string, EmailState>();
  if (messageIdsNeedingState.length > 0) {
    // Chunk to avoid huge IN clauses
    const CHUNK = 500;
    for (let i = 0; i < messageIdsNeedingState.length; i += CHUNK) {
      const chunk = messageIdsNeedingState.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("emails")
        .select(
          "gmail_message_id, score, user_replied, from_email, subject, snippet, body_preview, category"
        )
        .eq("user_id", userId)
        .in("gmail_message_id", chunk);
      for (const row of (data || []) as EmailState[]) {
        if (row.gmail_message_id) stateByGmailId.set(row.gmail_message_id, row);
      }
    }
  }

  // Local helper that decides whether to mirror a Gmail archive as
  // a dismiss in Oushi. TRASH always dismisses (you deleted it). INBOX
  // removal is conditional.
  const shouldMirrorArchive = (state: EmailState | undefined): boolean => {
    if (!state) return true; // unknown, fall back to old behavior
    if (state.user_replied) return true; // you replied, you're done
    if ((state.score ?? 0) < 30) return true; // low-signal noise
    if (state.category === "noise") return true;
    // Pure-content noise (newsletters, login alerts, receipts) — treat
    // as dismissable on archive even if score got bumped artificially.
    const proxyRow = {
      from_email: state.from_email || "",
      subject: state.subject || "",
      snippet: state.snippet || "",
      body_preview: state.body_preview,
      // The classifier helpers only read these fields
    } as unknown as Parameters<typeof isAutomatedEmail>[0];
    if (isAutomatedEmail(proxyRow)) return true;
    if (isTrueTransactional(proxyRow)) return true;
    // Otherwise: the email is unreplied + scored >= 30 + non-automated.
    // That's the "Oushi should keep showing this" case.
    return false;
  };

  for (const [gmailMessageId, changes] of labelChanges) {
    const updates: Record<string, unknown> = {};

    // UNREAD added => is_unread=true, is_read=false
    if (changes.addedLabels.has("UNREAD")) {
      updates.is_unread = true;
      updates.is_read = false;
    }
    // UNREAD removed => is_unread=false, is_read=true
    if (changes.removedLabels.has("UNREAD")) {
      updates.is_unread = false;
      updates.is_read = true;
      read++;
    }

    // INBOX removed (without TRASH added) => archived. Conditionally dismiss.
    if (
      changes.removedLabels.has("INBOX") &&
      !changes.addedLabels.has("TRASH")
    ) {
      if (shouldMirrorArchive(stateByGmailId.get(gmailMessageId))) {
        updates.dismissed_at = new Date().toISOString();
      }
      archived++;
    }
    // TRASH added => always dismiss (user explicitly deleted it)
    if (changes.addedLabels.has("TRASH")) {
      updates.dismissed_at = new Date().toISOString();
    }

    // STARRED toggle
    if (changes.addedLabels.has("STARRED")) {
      updates.is_starred = true;
      starred++;
    }
    if (changes.removedLabels.has("STARRED")) {
      updates.is_starred = false;
      unstarred++;
    }

    if (Object.keys(updates).length === 0) continue;
    await supabase
      .from("emails")
      .update(updates)
      .eq("user_id", userId)
      .eq("gmail_message_id", gmailMessageId);
  }

  // Persist new historyId so next call picks up where we left off
  if (latestHistoryId) {
    await supabase
      .from("user_sync_state")
      .upsert(
        {
          user_id: userId,
          last_history_id: latestHistoryId,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  }

  return { added, read, archived, starred, unstarred, fellback: false };
}

/**
 * Fetch + upsert a specific list of message ids. Used by the incremental
 * sync to handle newly-added messages.
 */
async function syncSpecificMessages(userId: string, gmailIds: string[]) {
  if (gmailIds.length === 0) return;
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const supabase = await createServiceClient();

  const batchSize = 10;
  for (let i = 0; i < gmailIds.length; i += batchSize) {
    const batch = gmailIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((id) =>
        gmail.users.messages.get({ userId: "me", id, format: "full" })
      )
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const parsed = parseGmailMessage(r.value.data);
      if (!parsed.gmail_message_id) continue;
      await supabase
        .from("emails")
        .upsert(
          {
            user_id: userId,
            ...parsed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,gmail_message_id" }
        );
    }
  }
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

    // Extract attachments for any non-muted email. We used to gate this on
    // the prefilter score, but flight confirmations / receipts / contracts
    // routinely come from noreply@ senders that prefilter scores as noise.
    // Skipping them broke the "what's my flight?" use case. The extra vision
    // cost is small because most emails have no attachments anyway, and the
    // prefilter still skips RANKING those emails — just not the attachment
    // OCR which is the actually-useful content.
    const rawPayload = rawPayloadByGmailId.get(email.gmail_message_id);
    const attachmentRefs = rawPayload ? findExtractableAttachments(rawPayload) : [];
    const hasAttachments = attachmentRefs.length > 0;

    let attachmentsText: string | null = null;
    let attachmentsExtractedAt: string | null = null;

    if (hasAttachments && !isMuted) {
      {
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
