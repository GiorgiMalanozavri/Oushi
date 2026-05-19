import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Web Push wrapper. Configures VAPID once per cold start, sends notifications
 * to all of a user's subscriptions, prunes dead endpoints automatically.
 */

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:notifications@oushi.app";
  if (!pub || !priv) {
    console.error("[push] VAPID keys not set — push disabled");
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  nudgeType?: string;
  resourceId?: string;
}

export interface SendResult {
  delivered: number;
  pruned: number;
  failed: number;
}

/**
 * Send a push to every subscription owned by `userId`. Dead endpoints
 * (404/410 from the push service) are pruned from the DB.
 */
export async function sendPushToUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, "public", any>,
  userId: string,
  payload: PushPayload
): Promise<SendResult> {
  if (!ensureConfigured()) return { delivered: 0, pruned: 0, failed: 0 };

  const { data: subs } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { delivered: 0, pruned: 0, failed: 0 };

  let delivered = 0;
  let pruned = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 } // 24h — best effort
        );
        delivered++;
        // Update last_used_at lazily (fire-and-forget)
        service
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id)
          .then(() => {});
      } catch (e) {
        const err = e as { statusCode?: number };
        // 404 / 410 = subscription is dead — remove it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await service.from("push_subscriptions").delete().eq("id", s.id);
          pruned++;
        } else {
          failed++;
          console.error("[push] send failed", err.statusCode, e instanceof Error ? e.message : e);
        }
      }
    })
  );

  return { delivered, pruned, failed };
}

/**
 * Record that we sent a nudge so we don't fire it again.
 * Returns false if the nudge was already sent.
 */
export async function recordNudge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, "public", any>,
  userId: string,
  nudgeType: string,
  resourceId: string | null
): Promise<boolean> {
  const { error } = await service
    .from("push_nudges_sent")
    .insert({ user_id: userId, nudge_type: nudgeType, resource_id: resourceId });
  if (error) {
    // unique violation = we already sent this nudge
    if (error.code === "23505") return false;
    console.error("[push] recordNudge failed", error.message);
    return false;
  }
  return true;
}
