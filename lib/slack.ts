/**
 * Slack integration — OAuth + outbound message posting.
 *
 * Scope: bare minimum to send a DM. We ask for `chat:write` only;
 * `chat:write` covers posting to channels the bot is invited to AND
 * `im:write` covers DM-ing the installing user. Adding the
 * im:history / mpim scopes would let us thread replies, but for the
 * "daily briefing in Slack" use case a one-off DM is enough.
 *
 * The OAuth flow:
 *   1. User clicks "Connect Slack" in Settings → Integrations
 *   2. We redirect to slack.com/oauth/v2/authorize with our client_id +
 *      a CSRF state we generated
 *   3. They approve, Slack redirects back to /api/integrations/slack/callback
 *   4. We exchange the code for an access token via oauth.v2.access
 *   5. Store token + team_id + user_id; redirect them back to Settings
 *
 * Setup (you, the operator):
 *   - Create a Slack app at https://api.slack.com/apps (one app, used by
 *     every Oushi user; not a per-tenant install)
 *   - Bot scopes: chat:write
 *   - Redirect URL: https://www.oushi.app/api/integrations/slack/callback
 *   - Add Distribution → enable public distribution (so non-team-members
 *     can install) — or restrict to your workspace if it's only for friends
 *   - Set env vars:
 *       SLACK_CLIENT_ID
 *       SLACK_CLIENT_SECRET
 *       SLACK_REDIRECT_URI = https://www.oushi.app/api/integrations/slack/callback
 */

const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_POST_URL = "https://slack.com/api/chat.postMessage";
const SLACK_OPEN_DM_URL = "https://slack.com/api/conversations.open";

const SCOPES = ["chat:write"].join(",");

export function isSlackConfigured(): boolean {
  return !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
}

export function buildAuthorizeUrl(state: string): string {
  const u = new URL(SLACK_AUTHORIZE_URL);
  u.searchParams.set("client_id", process.env.SLACK_CLIENT_ID || "");
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("user_scope", "");
  if (process.env.SLACK_REDIRECT_URI) {
    u.searchParams.set("redirect_uri", process.env.SLACK_REDIRECT_URI);
  }
  u.searchParams.set("state", state);
  return u.toString();
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id: string; name: string };
  authed_user?: { id: string };
}

export async function exchangeCodeForToken(
  code: string
): Promise<SlackOAuthResponse> {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID || "",
    client_secret: process.env.SLACK_CLIENT_SECRET || "",
    code,
  });
  if (process.env.SLACK_REDIRECT_URI) {
    params.set("redirect_uri", process.env.SLACK_REDIRECT_URI);
  }

  const res = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return res.json();
}

/**
 * Open a DM channel with the user, returning the channel ID. Slack
 * requires this before you can chat.postMessage to a user — you post
 * to a channel ID, not a user ID directly.
 */
export async function openDmChannel(
  accessToken: string,
  userId: string
): Promise<string | null> {
  const res = await fetch(SLACK_OPEN_DM_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ users: userId }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    channel?: { id: string };
    error?: string;
  };
  if (!data.ok || !data.channel?.id) {
    console.error("[slack] open DM failed", data.error);
    return null;
  }
  return data.channel.id;
}

export interface SlackBlock {
  // Slack's block-kit shape — we keep it loose so callers can pass
  // section / header / divider etc. without us re-typing it all.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export async function postMessage(
  accessToken: string,
  channel: string,
  text: string,
  blocks?: SlackBlock[]
): Promise<boolean> {
  const res = await fetch(SLACK_POST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text, // fallback for notifications + screen readers
      ...(blocks ? { blocks } : {}),
    }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    console.error("[slack] postMessage failed", data.error);
    return false;
  }
  return true;
}

/**
 * Render a daily briefing as Slack Block Kit. The cron passes the same
 * subject + html-stripped summary, we wrap it in mrkdwn blocks.
 */
export function briefingBlocks(
  subject: string,
  summary: string
): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Oushi briefing", emoji: false },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: summary.length > 2800 ? summary.slice(0, 2800) + "…" : summary,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `_${subject}_` },
        { type: "mrkdwn", text: "<https://www.oushi.app/dashboard|Open Oushi>" },
      ],
    },
  ];
}
