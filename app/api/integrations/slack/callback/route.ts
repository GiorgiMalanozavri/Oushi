import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exchangeCodeForToken, openDmChannel } from "@/lib/slack";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/integrations/slack/callback?code=...&state=...
 *
 * Slack redirects here after the user approves. We:
 *   1. Verify the state matches the cookie we set during /connect
 *   2. Exchange the code for an access token
 *   3. Open a DM channel with the installing user (chat.postMessage
 *      needs a channel ID, not a user ID)
 *   4. Persist the credentials and DM channel; redirect them back
 *      to Settings → Integrations with a success flash.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const settingsUrl = new URL(
    "/settings?section=integrations",
    process.env.NEXT_PUBLIC_APP_URL || url.origin
  );

  if (error) {
    settingsUrl.searchParams.set("slack_error", error);
    return NextResponse.redirect(settingsUrl);
  }
  if (!code || !state) {
    settingsUrl.searchParams.set("slack_error", "missing_code");
    return NextResponse.redirect(settingsUrl);
  }

  // Verify state matches the cookie we set
  const cookieState = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith("oushi_slack_state="))
    ?.split("=")[1];

  if (!cookieState || cookieState !== state) {
    settingsUrl.searchParams.set("slack_error", "state_mismatch");
    return NextResponse.redirect(settingsUrl);
  }

  // Need an authenticated session to know WHO is connecting
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    settingsUrl.searchParams.set("slack_error", "not_signed_in");
    return NextResponse.redirect(settingsUrl);
  }

  const result = await exchangeCodeForToken(code);
  if (!result.ok || !result.access_token) {
    settingsUrl.searchParams.set(
      "slack_error",
      result.error || "exchange_failed"
    );
    return NextResponse.redirect(settingsUrl);
  }

  // Resolve a DM channel ID so we can postMessage later. The Slack
  // OAuth response gives us authed_user.id; conversations.open turns
  // that into the channel ID for our bot's DM with that user.
  let dmChannel: string | null = null;
  if (result.authed_user?.id) {
    dmChannel = await openDmChannel(result.access_token, result.authed_user.id);
  }

  const service = await createServiceClient();
  await service.from("user_integrations").upsert(
    {
      user_id: user.id,
      slack_team_id: result.team?.id || null,
      slack_team_name: result.team?.name || null,
      slack_access_token: result.access_token,
      slack_user_id: result.authed_user?.id || null,
      slack_channel_id: dmChannel,
      slack_channel_name: result.team?.name
        ? `DM in ${result.team.name}`
        : null,
      // Default to enabled — the user just clicked "Connect" with intent
      // to receive briefings. They can flip it off in Settings.
      slack_briefing_enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  settingsUrl.searchParams.set("slack_connected", "1");
  const res = NextResponse.redirect(settingsUrl);
  // Clear the CSRF state cookie now that we're done with it
  res.cookies.set("oushi_slack_state", "", { maxAge: 0, path: "/" });
  return res;
}
