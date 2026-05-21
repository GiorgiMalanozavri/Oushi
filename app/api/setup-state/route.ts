import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/setup-state
 * Returns the user's setup-checklist status:
 *   { labels_enabled, push_enabled, voice_trained, dismissed }
 *
 * Each flag is inferred from existing tables — no new columns to track
 * progress. Only "dismissed" is stored explicitly (user_profile.setup_dismissed_at).
 *
 * POST /api/setup-state/dismiss
 * Marks the checklist dismissed so we stop showing it. Hits the same
 * route with a method=dismiss body to keep the route shape simple.
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  // Three checks in parallel — total query time ~50ms
  const [labelsRes, pushRes, voiceRes] = await Promise.all([
    service
      .from("user_sync_state")
      .select("gmail_labels_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    service
      .from("user_profile")
      .select("voice_profile, setup_dismissed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    labels_enabled: !!labelsRes.data?.gmail_labels_enabled,
    push_enabled: (pushRes.count || 0) > 0,
    voice_trained: !!voiceRes.data?.voice_profile,
    dismissed: !!voiceRes.data?.setup_dismissed_at,
  });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { error } = await service
    .from("user_profile")
    .update({ setup_dismissed_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
