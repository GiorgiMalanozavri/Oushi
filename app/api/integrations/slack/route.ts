import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { postMessage, briefingBlocks } from "@/lib/slack";

export const dynamic = "force-dynamic";

/**
 * GET    /api/integrations/slack
 *   Returns { connected, team_name, channel_name, briefing_enabled }.
 *
 * POST   /api/integrations/slack
 *   Body: { briefing_enabled: boolean }
 *   Toggle whether the daily briefing also goes to Slack.
 *
 * DELETE /api/integrations/slack
 *   Disconnect — clears stored token. We don't call Slack's
 *   apps.uninstall here since one app serves all users; revoking would
 *   nuke everyone. The user can also revoke from Slack's UI directly.
 *
 * PATCH  /api/integrations/slack
 *   Send a single test message — verifies the token still works and
 *   the user can see Oushi DM-ing them.
 */

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
    .select(
      "slack_team_id, slack_team_name, slack_channel_id, slack_channel_name, slack_briefing_enabled, slack_access_token"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    connected: !!data?.slack_access_token,
    team_name: data?.slack_team_name || null,
    channel_name: data?.slack_channel_name || null,
    briefing_enabled: !!data?.slack_briefing_enabled,
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
  const enabled = !!body?.briefing_enabled;

  const service = await createServiceClient();
  const { error } = await service
    .from("user_integrations")
    .update({
      slack_briefing_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ briefing_enabled: enabled });
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
      slack_team_id: null,
      slack_team_name: null,
      slack_access_token: null,
      slack_user_id: null,
      slack_channel_id: null,
      slack_channel_name: null,
      slack_briefing_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

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
    .select("slack_access_token, slack_channel_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data?.slack_access_token || !data?.slack_channel_id) {
    return NextResponse.json(
      { error: "Slack not connected yet" },
      { status: 400 }
    );
  }

  const ok = await postMessage(
    data.slack_access_token,
    data.slack_channel_id,
    "Oushi briefing test",
    briefingBlocks(
      "Test from Oushi",
      "This is a test message from your Oushi briefing. If you can see this, your daily briefing will arrive here every morning."
    )
  );

  return NextResponse.json({
    delivered: ok,
    detail: ok
      ? "Test sent — check your Slack DMs."
      : "Slack rejected the message. Token may have been revoked.",
  });
}
