/**
 * Gmail Push webhook — receives Pub/Sub notifications when a watched
 * mailbox changes, and runs incremental sync + rank so labels appear
 * in Gmail within seconds of a new email arriving.
 *
 * Pub/Sub call shape (after Cloud Pub/Sub push subscription decodes):
 *   POST /api/gmail/push
 *   Authorization: Bearer <OIDC token signed by Pub/Sub's SA>
 *   Body: {
 *     "message": {
 *       "data": "<base64 of {emailAddress, historyId}>",
 *       "messageId": "...",
 *       "publishTime": "..."
 *     },
 *     "subscription": "projects/.../subscriptions/..."
 *   }
 *
 * Env vars expected:
 *   GMAIL_PUSH_AUDIENCE  — expected `aud` claim in the OIDC token. Usually
 *                          the webhook URL itself, e.g.
 *                          https://app.oushi.com/api/gmail/push.
 *                          Set when configuring the push subscription.
 *   GMAIL_PUSH_SA        — (optional) service account email Pub/Sub uses
 *                          to sign tokens. If set we also verify the
 *                          `email` claim matches.
 *
 * If GMAIL_PUSH_AUDIENCE isn't set we skip verification — useful for
 * local dev, but never deploy that to production.
 */

import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { createServiceClient } from "@/lib/supabase/server";
import { syncIncremental } from "@/lib/gmail";
import { rankUnrankedEmails } from "@/lib/ranking";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PUSH_AUDIENCE = process.env.GMAIL_PUSH_AUDIENCE;
const PUSH_SA = process.env.GMAIL_PUSH_SA;
const authClient = new OAuth2Client();

async function verifyPubSubToken(token: string): Promise<{ ok: boolean; reason?: string }> {
  if (!PUSH_AUDIENCE) {
    // Verification disabled — only safe for local dev.
    return { ok: true };
  }
  try {
    const ticket = await authClient.verifyIdToken({
      idToken: token,
      audience: PUSH_AUDIENCE,
    });
    const payload = ticket.getPayload();
    if (!payload) return { ok: false, reason: "no payload" };
    if (PUSH_SA && payload.email !== PUSH_SA) {
      return { ok: false, reason: "unexpected SA" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "verify error" };
  }
}

export async function POST(request: Request) {
  // 1. Verify the OIDC token
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token && PUSH_AUDIENCE) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }
  if (token) {
    const v = await verifyPubSubToken(token);
    if (!v.ok) {
      console.error("[gmail/push] token verify failed", v.reason);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  // 2. Decode the payload
  const body = await request.json().catch(() => null);
  const data = body?.message?.data;
  if (!data) {
    // Ack and drop — malformed messages shouldn't be retried.
    return NextResponse.json({ ok: true, skipped: "no data" });
  }

  let decoded: { emailAddress?: string; historyId?: string };
  try {
    decoded = JSON.parse(Buffer.from(data, "base64").toString("utf-8"));
  } catch {
    return NextResponse.json({ ok: true, skipped: "decode error" });
  }
  const emailAddress = decoded.emailAddress;
  if (!emailAddress) {
    return NextResponse.json({ ok: true, skipped: "no email" });
  }

  // 3. Find the user
  const service = await createServiceClient();
  const { data: row, error: lookupErr } = await service
    .from("user_sync_state")
    .select("user_id, gmail_labels_enabled")
    .eq("gmail_email", emailAddress.toLowerCase())
    .maybeSingle();

  if (lookupErr) {
    console.error("[gmail/push] user lookup failed", lookupErr.message);
    // Acknowledge — retrying won't fix a DB issue, and the next push will
    // catch us up via history.list anyway.
    return NextResponse.json({ ok: true, skipped: "lookup error" });
  }
  if (!row) {
    return NextResponse.json({ ok: true, skipped: "unknown email" });
  }

  // 4. Incremental sync. Fast for the typical case (one or two new
  // messages). The function dedupes against existing rows and updates
  // the user's last_history_id for next time.
  let added = 0;
  try {
    const result = await syncIncremental(row.user_id);
    added = result.added;
  } catch (e) {
    console.error(
      "[gmail/push] syncIncremental failed",
      e instanceof Error ? e.message : e
    );
    // Acknowledge — Pub/Sub will redeliver via history.list catch-up
    // on the next push if we're still behind.
    return NextResponse.json({ ok: true, skipped: "sync error" });
  }

  // 5. Only rank if there's something new. Most pushes are non-arrival
  // state changes (read flags, label changes from the user's Gmail UI)
  // and don't need a re-rank.
  if (added > 0 && row.gmail_labels_enabled) {
    try {
      await rankUnrankedEmails(row.user_id);
    } catch (e) {
      console.error(
        "[gmail/push] rank failed",
        e instanceof Error ? e.message : e
      );
      // Still ack — the next rank or self-heal will catch this up.
    }
  }

  return NextResponse.json({ ok: true, added });
}
