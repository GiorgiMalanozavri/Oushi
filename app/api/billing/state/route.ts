import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserTier, checkAskQuota, TIER_LIMITS } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/state
 *
 * Returns the user's current tier + per-feature limits + ask-quota usage,
 * so the dashboard can show "13 / 20 messages today" and lock UI surfaces
 * for free users.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [tier, askQuota] = await Promise.all([
    getUserTier(user.id, user.email || null),
    checkAskQuota(user.id, user.email || null),
  ]);

  const limits = TIER_LIMITS[tier];

  return NextResponse.json({
    tier,
    features: limits.features,
    limits: {
      ask_messages_per_day:
        limits.ask_messages_per_day === Number.POSITIVE_INFINITY
          ? -1
          : limits.ask_messages_per_day,
      boards_max:
        limits.boards_max === Number.POSITIVE_INFINITY ? -1 : limits.boards_max,
      sender_rules_max:
        limits.sender_rules_max === Number.POSITIVE_INFINITY
          ? -1
          : limits.sender_rules_max,
    },
    ask_quota: askQuota,
  });
}
