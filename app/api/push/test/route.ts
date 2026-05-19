import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";

/**
 * POST /api/push/test — fire a test notification to all of the user's
 * registered endpoints. Used by the Settings page to verify their setup.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const result = await sendPushToUser(service, user.id, {
    title: "Oushi is on the case",
    body: "Push notifications are working. We'll only ping you when something matters.",
    url: "/dashboard",
    tag: "oushi-test",
  });

  return NextResponse.json(result);
}
