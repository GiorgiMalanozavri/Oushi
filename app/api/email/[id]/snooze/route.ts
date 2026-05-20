import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveSnooze, type SnoozePreset } from "@/lib/snooze";

/**
 * POST /api/email/[id]/snooze   — apply a snooze
 *   body: { preset: SnoozePreset, custom_until?: string }
 *
 * DELETE /api/email/[id]/snooze — unsnooze (resurface immediately)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const preset = body?.preset as SnoozePreset | undefined;
  const customUntil = typeof body?.custom_until === "string" ? body.custom_until : undefined;

  if (!preset) {
    return NextResponse.json({ error: "preset required" }, { status: 400 });
  }

  const service = await createServiceClient();
  const resolution = await resolveSnooze(service, user.id, preset, {
    custom_until: customUntil,
  });

  const { error } = await service
    .from("emails")
    .update({
      snooze_until: resolution.until,
      snooze_reason: resolution.reason,
      snoozed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    until: resolution.until,
    reason: resolution.reason,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { error } = await service
    .from("emails")
    .update({
      snooze_until: null,
      snooze_reason: null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
