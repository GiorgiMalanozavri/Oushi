import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, isSlackConfigured } from "@/lib/slack";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/slack/connect
 *
 * Kicks off the Slack OAuth dance. Generates a CSRF state token
 * embedded with the user_id (so the callback can route back even
 * across the Slack redirect that doesn't preserve our cookies on
 * subdomains), drops it in a short-lived HttpOnly cookie, and redirects
 * to Slack's authorize endpoint.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSlackConfigured()) {
    return NextResponse.json(
      {
        error:
          "Slack isn't configured on this server. The operator needs to set SLACK_CLIENT_ID + SLACK_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  const state = randomBytes(24).toString("hex");
  const authorizeUrl = buildAuthorizeUrl(state);

  const res = NextResponse.redirect(authorizeUrl);
  // Short-lived state cookie — Slack will redirect back with the same
  // state, we verify before exchanging the code.
  res.cookies.set("oushi_slack_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 min
    path: "/",
  });
  return res;
}
