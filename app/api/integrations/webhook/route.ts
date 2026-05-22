import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { deliver, type WebhookEvent } from "@/lib/webhook";

export const dynamic = "force-dynamic";

/**
 * GET    /api/integrations/webhook
 *   Returns { url, secret_preview, enabled }. The full secret only
 *   appears once at creation; afterwards we show "wh_••••8c4d".
 *
 * POST   /api/integrations/webhook
 *   Body: { url: string, enabled?: boolean }
 *   Creates / updates the webhook config. Generates a new secret if
 *   none exists; returns the full secret ONCE so the user can copy it.
 *
 * DELETE /api/integrations/webhook
 *   Clears the config.
 *
 * POST   /api/integrations/webhook/test
 *   Fires a single test event so the user can verify their Zap
 *   triggers. (Handled in the [...test] subroute.)
 */

function maskSecret(secret: string | null): string | null {
  if (!secret) return null;
  if (secret.length <= 8) return "•".repeat(secret.length);
  return `${secret.slice(0, 3)}••••${secret.slice(-4)}`;
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("user_integrations")
    .select("webhook_url, webhook_secret, webhook_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    url: data?.webhook_url || null,
    secret_preview: maskSecret(data?.webhook_secret || null),
    enabled: !!data?.webhook_enabled,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const enabled = body?.enabled !== false; // default true on save

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }
  if (!isValidUrl(url)) {
    return NextResponse.json(
      { error: "URL must start with http:// or https://" },
      { status: 400 }
    );
  }

  const service = await createServiceClient();
  const { data: existing } = await service
    .from("user_integrations")
    .select("webhook_secret")
    .eq("user_id", user.id)
    .maybeSingle();

  // Reuse secret if one already exists — rotating secrets would
  // silently break running Zaps. The user can DELETE then re-create
  // to rotate intentionally.
  const secret =
    existing?.webhook_secret || "wh_" + randomBytes(24).toString("hex");
  const isNewSecret = !existing?.webhook_secret;

  const { error } = await service.from("user_integrations").upsert(
    {
      user_id: user.id,
      webhook_url: url,
      webhook_secret: secret,
      webhook_enabled: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    url,
    enabled,
    secret_preview: maskSecret(secret),
    // Full secret ONLY returned the first time it's generated. After
    // that the UI only sees the preview. (User can fetch the real one
    // via Supabase if they need; we'd rather not echo it on every GET.)
    secret_once: isNewSecret ? secret : null,
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { error } = await service
    .from("user_integrations")
    .update({
      webhook_url: null,
      webhook_secret: null,
      webhook_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * PATCH (used by the UI as "send test event") — fires the canonical
 * test payload to the user's configured URL and reports the HTTP
 * status. Lets them see in their Zapier history that the webhook
 * fired before they trust real events.
 */
export async function PATCH() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data } = await service
    .from("user_integrations")
    .select("webhook_url, webhook_secret, webhook_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data?.webhook_url || !data?.webhook_secret) {
    return NextResponse.json(
      { error: "Webhook not configured yet" },
      { status: 400 }
    );
  }
  if (!data.webhook_enabled) {
    return NextResponse.json(
      { error: "Webhook is disabled — enable it first" },
      { status: 400 }
    );
  }

  const ok = await deliver(
    { url: data.webhook_url, secret: data.webhook_secret },
    "test" as WebhookEvent,
    {
      message: "This is a test event from Oushi.",
      sent_by: user.email,
    }
  );

  return NextResponse.json({
    delivered: ok,
    detail: ok
      ? "Event accepted (HTTP 2xx). Check your Zap history."
      : "Endpoint didn't respond with 2xx within 5s — check the URL.",
  });
}
