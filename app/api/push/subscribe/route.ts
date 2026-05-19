import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST  /api/push/subscribe   — register a browser endpoint
 * DELETE /api/push/subscribe  — unregister (by endpoint or all)
 *
 * Body for POST:
 *   { endpoint, keys: { p256dh, auth } }
 */

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent") || "";

  const service = await createServiceClient();
  const { error } = await service.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent.slice(0, 250),
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");

  const service = await createServiceClient();
  let q = service.from("push_subscriptions").delete().eq("user_id", user.id);
  if (endpoint) q = q.eq("endpoint", endpoint);
  const { error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Expose VAPID public key for the client. Saves the client from needing the
 * raw env var at build time (avoids forgetting to set NEXT_PUBLIC_*).
 */
export async function GET() {
  return NextResponse.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
  });
}
