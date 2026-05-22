import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { listSharedTargets, isNotionConfigured } from "@/lib/notion";

export const dynamic = "force-dynamic";

/**
 * GET    /api/integrations/notion
 *   { connected, workspace_name, page_id, page_title, database_id,
 *     database_name, enabled, pages, databases }
 *
 *   Includes the lists of pages + databases the user has shared with
 *   the Oushi Notion app, so the Settings UI can render dropdowns.
 *
 * POST   /api/integrations/notion
 *   Body: { page_id?, page_title?, database_id?, database_name?,
 *           enabled?: boolean }
 *
 * DELETE /api/integrations/notion
 *   Disconnect (clears token).
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
      "notion_workspace_id, notion_workspace_name, notion_access_token, notion_database_id, notion_database_name, notion_page_id, notion_page_title, notion_enabled"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const connected = !!data?.notion_access_token;
  let pages: Array<{ id: string; title: string }> = [];
  let databases: Array<{ id: string; title: string }> = [];
  if (connected) {
    const targets = await listSharedTargets(data.notion_access_token!);
    pages = targets.pages;
    databases = targets.databases;
  }

  return NextResponse.json({
    connected,
    workspace_name: data?.notion_workspace_name || null,
    page_id: data?.notion_page_id || null,
    page_title: data?.notion_page_title || null,
    database_id: data?.notion_database_id || null,
    database_name: data?.notion_database_name || null,
    enabled: !!data?.notion_enabled,
    pages,
    databases,
    // Tells the UI which connection methods are available. OAuth needs
    // server-side env vars; token-paste works regardless.
    oauth_available: isNotionConfigured(),
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
  // Each field optional — we patch only what's sent so the user can
  // change the page picker without touching the database picker.
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body?.page_id !== undefined) update.notion_page_id = body.page_id || null;
  if (body?.page_title !== undefined)
    update.notion_page_title = body.page_title || null;
  if (body?.database_id !== undefined)
    update.notion_database_id = body.database_id || null;
  if (body?.database_name !== undefined)
    update.notion_database_name = body.database_name || null;
  if (body?.enabled !== undefined) update.notion_enabled = !!body.enabled;

  const service = await createServiceClient();
  const { error } = await service
    .from("user_integrations")
    .update(update)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
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
      notion_workspace_id: null,
      notion_workspace_name: null,
      notion_access_token: null,
      notion_bot_id: null,
      notion_database_id: null,
      notion_database_name: null,
      notion_page_id: null,
      notion_page_title: null,
      notion_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
