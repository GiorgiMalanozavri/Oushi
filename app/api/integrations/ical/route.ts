import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET    /api/integrations/ical
 *   Returns { enabled, token, feed_url } for the current user.
 *
 * POST   /api/integrations/ical
 *   Body: { action: "enable" | "disable" | "regenerate" }
 *
 *   enable     — turn it on; generates a token if none exists.
 *   disable    — flip enabled=false (existing token kept so re-enabling
 *                is a one-click thing).
 *   regenerate — issue a fresh token; the old URL stops working
 *                immediately. The user has to update every cal app they
 *                subscribed in.
 */

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function buildFeedUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.oushi.app";
  return `${base}/api/ical/${token}`;
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
    .select("ical_token, ical_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    enabled: !!data?.ical_enabled,
    has_token: !!data?.ical_token,
    feed_url: data?.ical_token ? buildFeedUrl(data.ical_token) : null,
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
  const action = String(body?.action || "");

  if (!["enable", "disable", "regenerate"].includes(action)) {
    return NextResponse.json(
      { error: "action must be enable | disable | regenerate" },
      { status: 400 }
    );
  }

  const service = await createServiceClient();

  const { data: existing } = await service
    .from("user_integrations")
    .select("ical_token")
    .eq("user_id", user.id)
    .maybeSingle();

  let token: string | null = existing?.ical_token || null;
  let enabled = true;

  if (action === "enable") {
    if (!token) token = generateToken();
    enabled = true;
  } else if (action === "regenerate") {
    token = generateToken();
    enabled = true;
  } else if (action === "disable") {
    enabled = false;
  }

  const { error } = await service.from("user_integrations").upsert(
    {
      user_id: user.id,
      ical_token: token,
      ical_enabled: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    enabled,
    has_token: !!token,
    feed_url: token && enabled ? buildFeedUrl(token) : null,
  });
}
