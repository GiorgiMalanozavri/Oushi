import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/integrations/notion/manual-token
 *   Body: { token: string }
 *
 * Internal-integration fallback. Each user creates a Notion internal
 * integration in their own workspace (30 seconds at
 * notion.so/profile/integrations), shares whatever pages/dbs they want
 * with it via Notion's ••• → Connections menu, and pastes the token
 * here. No OAuth dance, no public-integration review.
 *
 * We validate the token by calling /users/me — if Notion answers with
 * the bot's identity, the token is good. We also store the bot_id so
 * the search/upsert paths look identical to the OAuth path.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const token = String(body?.token || "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }
  // Notion internal tokens start with "secret_" or (newer) "ntn_".
  // Don't hard-reject other prefixes — Notion could change the format
  // again — but warn the caller if it looks obviously wrong.
  if (token.length < 30) {
    return NextResponse.json(
      { error: "That doesn't look like a Notion token (too short)" },
      { status: 400 }
    );
  }

  // Validate by hitting /users/me — cheapest call that confirms auth.
  let botId: string | null = null;
  let workspaceName: string | null = null;
  try {
    const res = await fetch("https://api.notion.com/v1/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            data?.message ||
            "Notion rejected that token. Re-copy it from the integration page?",
        },
        { status: 400 }
      );
    }
    const me = (await res.json()) as {
      id: string;
      bot?: {
        workspace_name?: string;
        owner?: { workspace?: boolean };
      };
    };
    botId = me.id;
    workspaceName = me.bot?.workspace_name || null;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Couldn't reach Notion: ${e.message}`
            : "Couldn't reach Notion",
      },
      { status: 502 }
    );
  }

  const service = await createServiceClient();
  await service.from("user_integrations").upsert(
    {
      user_id: user.id,
      notion_access_token: token,
      notion_bot_id: botId,
      notion_workspace_name: workspaceName,
      // Internal integrations don't have a stable workspace_id from the
      // /users/me call — leave it null. We don't depend on it anywhere.
      notion_workspace_id: null,
      // Don't auto-enable — the user still needs to pick a page or db.
      notion_enabled: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return NextResponse.json({
    ok: true,
    workspace_name: workspaceName,
  });
}
