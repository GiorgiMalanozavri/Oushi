/**
 * Outbound webhook delivery.
 *
 * Fires HMAC-signed POSTs to a user-configured URL when interesting
 * things happen in their account — new respond-labeled email, new
 * commitment, commitment fulfilled, daily digest sent. The receiver
 * (Zapier / Make / n8n / a tiny home-grown script) verifies the
 * signature with the secret we issued and acts on the event.
 *
 * Design choices:
 *   - Single URL per user, single shared secret. Per-event endpoints
 *     would be cleaner but burn complexity for a 15-person beta.
 *   - HMAC-SHA256, hex-encoded, on the raw stringified body. Receiver
 *     re-computes hmac(secret, body) and constant-time-compares.
 *   - Fire-and-forget with a 5s timeout. We never block the user-
 *     facing path on webhook delivery. Failures get logged and dropped
 *     — no retry queue yet; if it matters we'll add one.
 *   - X-Oushi-Event header tells the receiver what just happened so
 *     they don't need to inspect the body to route.
 */

import { createHmac } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export type WebhookEvent =
  | "email.respond_labeled"
  | "commitment.created"
  | "commitment.fulfilled"
  | "briefing.sent"
  | "test";

interface WebhookConfig {
  url: string;
  secret: string;
  enabled: boolean;
}

async function getConfig(userId: string): Promise<WebhookConfig | null> {
  const service = await createServiceClient();
  const { data } = await service
    .from("user_integrations")
    .select("webhook_url, webhook_secret, webhook_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (
    !data?.webhook_url ||
    !data?.webhook_secret ||
    !data?.webhook_enabled
  ) {
    return null;
  }
  return {
    url: data.webhook_url,
    secret: data.webhook_secret,
    enabled: !!data.webhook_enabled,
  };
}

/**
 * Fire a webhook event. Returns true on 2xx, false on anything else
 * (including timeout / network failure). Never throws — callers can
 * `void fireWebhook(...)` from any path.
 */
export async function fireWebhook(
  userId: string,
  event: WebhookEvent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): Promise<boolean> {
  const cfg = await getConfig(userId);
  if (!cfg) return false;
  return deliver(cfg, event, payload);
}

/**
 * Lower-level deliver — used by the "Send test event" button when we
 * have a config in-hand and don't want to re-fetch.
 */
export async function deliver(
  cfg: { url: string; secret: string },
  event: WebhookEvent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): Promise<boolean> {
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = createHmac("sha256", cfg.secret)
    .update(body)
    .digest("hex");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Oushi-Webhooks/1.0",
        "X-Oushi-Event": event,
        "X-Oushi-Signature": `sha256=${signature}`,
      },
      body,
    });
    return res.ok;
  } catch (e) {
    console.error(
      "[webhook] delivery failed",
      event,
      e instanceof Error ? e.message : e
    );
    return false;
  } finally {
    clearTimeout(t);
  }
}
