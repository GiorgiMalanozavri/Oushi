import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { removeAllOushiLabelsFromAllMessages } from "@/lib/gmail-labels";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/labels/reset
 *   Removes every Oushi/* label from the user's Gmail (deletes the labels
 *   themselves — Gmail automatically un-applies a label from all messages
 *   when it's deleted). Clean uninstall.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`labels-reset:${user.id}`, 2, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Reset is rate-limited. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const result = await removeAllOushiLabelsFromAllMessages(user.id);

    const service = await createServiceClient();
    await service
      .from("user_sync_state")
      .upsert(
        {
          user_id: user.id,
          gmail_labels_enabled: false,
          gmail_labels_last_applied_at: null,
        },
        { onConflict: "user_id" }
      );

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Reset failed" },
      { status: 500 }
    );
  }
}
