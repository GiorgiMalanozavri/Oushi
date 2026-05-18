import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * PATCH /api/commitments/[id]
 *
 * Body:
 *   { action: "fulfill" }        — mark done
 *   { action: "dismiss" }        — drop it (won't resurface)
 *   { action: "reopen" }         — undo a fulfill/dismiss
 *   { action: "snooze", days: N }— hide for N days, then resurface
 */
export async function PATCH(
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
  const action = body?.action;
  const days = typeof body?.days === "number" ? body.days : 3;

  if (!action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }

  const service = await createServiceClient();

  let update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  switch (action) {
    case "fulfill":
      update = {
        ...update,
        status: "fulfilled",
        fulfilled_at: new Date().toISOString(),
      };
      break;
    case "dismiss":
      update = { ...update, status: "dismissed" };
      break;
    case "reopen":
      update = {
        ...update,
        status: "open",
        fulfilled_at: null,
        snoozed_until: null,
      };
      break;
    case "snooze": {
      const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      update = { ...update, status: "snoozed", snoozed_until: until.toISOString() };
      break;
    }
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const { error } = await service
    .from("commitments")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
