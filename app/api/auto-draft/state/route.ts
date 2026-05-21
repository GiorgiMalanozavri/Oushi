import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET  /api/auto-draft/state  → { enabled: boolean }
 * POST /api/auto-draft/state  body: { enabled: boolean }
 *
 * Reads/writes user_sync_state.auto_draft_enabled. When true, the
 * ranking pipeline calls autoDraftBatch() for every email it labels
 * "respond" and creates a Gmail draft in the user's voice.
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = await createServiceClient();
  const { data } = await service
    .from("user_sync_state")
    .select("auto_draft_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  return NextResponse.json({ enabled: !!data?.auto_draft_enabled });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const enabled = !!body?.enabled;

  const service = await createServiceClient();
  const { error } = await service
    .from("user_sync_state")
    .upsert(
      { user_id: user.id, auto_draft_enabled: enabled },
      { onConflict: "user_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enabled });
}
