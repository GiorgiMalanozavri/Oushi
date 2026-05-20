/**
 * Gmail Push (real-time) — watch registration, refresh, and teardown.
 *
 * Gmail's watch() API tells Google "publish a notification to my Pub/Sub
 * topic every time this user's mailbox changes." We register a watch
 * when the user enables labels, refresh it before its 7-day expiry, and
 * stop it when they reset.
 *
 * Required environment variables (set in Vercel + .env.local):
 *   GMAIL_PUSH_TOPIC      — full topic name, e.g.
 *                           projects/oushi-prod/topics/gmail-push
 *
 * GCP setup (one-time, in your Google Cloud project):
 *   1. Enable the Pub/Sub API.
 *   2. Create a topic (the value of GMAIL_PUSH_TOPIC).
 *   3. Grant `gmail-api-push@system.gserviceaccount.com` the
 *      `roles/pubsub.publisher` role on that topic — that's how Gmail
 *      gets permission to publish to it.
 *   4. Create a push subscription on the topic pointing to your
 *      webhook URL, e.g. https://app.oushi.com/api/gmail/push
 *   5. Enable "Enable authentication" on the push subscription, pick a
 *      service account to sign tokens with, set the audience to your
 *      webhook URL. Save the service account email — set it as
 *      GMAIL_PUSH_SA in your env so the webhook can verify it.
 *
 * If GMAIL_PUSH_TOPIC is not set, registration is a no-op — labels still
 * work, just on the slower rank-driven schedule (the old behavior).
 */

import { google } from "googleapis";
import { getAuthenticatedClient } from "@/lib/gmail";
import { createServiceClient } from "@/lib/supabase/server";

const TOPIC = process.env.GMAIL_PUSH_TOPIC;

export interface WatchResult {
  enabled: boolean;
  expiresAt: string | null;
  historyId: string | null;
  reason?: string;
}

/**
 * Register a Gmail watch for this user. Idempotent — calling watch()
 * again before expiry just extends it. Stores expiration + email +
 * the latest historyId in user_sync_state so the webhook can find
 * the user and incremental-sync from the right point.
 *
 * Returns { enabled: false } if GMAIL_PUSH_TOPIC isn't configured —
 * the caller falls back to "label on next rank" behavior.
 */
export async function registerGmailWatch(userId: string): Promise<WatchResult> {
  if (!TOPIC) {
    return { enabled: false, expiresAt: null, historyId: null, reason: "GMAIL_PUSH_TOPIC not set" };
  }

  const oauth2 = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  // Find the user's Gmail address so the webhook can look them up
  // by emailAddress in the push payload.
  let emailAddress: string | null = null;
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    emailAddress = profile.data.emailAddress || null;
  } catch (e) {
    console.error(
      "[gmail-watch] getProfile failed",
      e instanceof Error ? e.message : e
    );
  }

  // Register the watch — INBOX only. labelFilterAction "include" tells
  // Gmail to fire notifications only for INBOX changes, which is what
  // we care about for labeling.
  let watchRes;
  try {
    watchRes = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: TOPIC,
        labelIds: ["INBOX"],
        labelFilterAction: "include",
      },
    });
  } catch (e) {
    console.error(
      "[gmail-watch] watch failed",
      e instanceof Error ? e.message : e
    );
    return {
      enabled: false,
      expiresAt: null,
      historyId: null,
      reason: e instanceof Error ? e.message : "watch failed",
    };
  }

  const expirationMs = watchRes.data.expiration
    ? parseInt(watchRes.data.expiration, 10)
    : null;
  const expiresAt = expirationMs ? new Date(expirationMs).toISOString() : null;
  const historyId = watchRes.data.historyId || null;

  const service = await createServiceClient();
  const update: Record<string, unknown> = {
    user_id: userId,
    gmail_watch_expires_at: expiresAt,
    gmail_pubsub_topic: TOPIC,
  };
  // Lowercase for case-insensitive lookups in the push webhook.
  if (emailAddress) update.gmail_email = emailAddress.toLowerCase();
  // Seed last_history_id if we don't have one — that's the watch's
  // starting point for incremental sync on the first webhook fire.
  if (historyId) update.last_history_id = historyId;

  await service.from("user_sync_state").upsert(update, { onConflict: "user_id" });

  return {
    enabled: true,
    expiresAt,
    historyId,
  };
}

/**
 * Stop a user's Gmail watch — used when they reset labels. Best-effort;
 * we always clear the DB record even if the Gmail API call errors out
 * (e.g., watch already expired).
 */
export async function stopGmailWatch(userId: string): Promise<void> {
  try {
    const oauth2 = await getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    await gmail.users.stop({ userId: "me" });
  } catch (e) {
    console.error(
      "[gmail-watch] stop failed",
      e instanceof Error ? e.message : e
    );
  }
  const service = await createServiceClient();
  await service
    .from("user_sync_state")
    .upsert(
      { user_id: userId, gmail_watch_expires_at: null },
      { onConflict: "user_id" }
    );
}

/**
 * Refresh every watch expiring within `hoursAhead` (default 36h). Called
 * by the daily cron. Failure for one user doesn't block the others.
 */
export async function refreshExpiringWatches(
  hoursAhead = 36
): Promise<{ checked: number; refreshed: number; failed: number }> {
  const service = await createServiceClient();
  const cutoff = new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();

  const { data: rows } = await service
    .from("user_sync_state")
    .select("user_id, gmail_watch_expires_at")
    .lte("gmail_watch_expires_at", cutoff)
    .not("gmail_watch_expires_at", "is", null);

  if (!rows || rows.length === 0) {
    return { checked: 0, refreshed: 0, failed: 0 };
  }

  let refreshed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const res = await registerGmailWatch(row.user_id);
      if (res.enabled) refreshed++;
      else failed++;
    } catch (e) {
      failed++;
      console.error(
        "[gmail-watch] refresh failed for user",
        row.user_id,
        e instanceof Error ? e.message : e
      );
    }
  }

  return { checked: rows.length, refreshed, failed };
}
