/**
 * Freemium tier resolution + quota tracking.
 *
 * Single source of truth for "what can this user do?" — everything else
 * (API gates, settings UI, paywalls) imports from here. Don't read
 * user_profile.subscription_tier directly from other files; use
 * getUserTier() so the admin override and expiry logic stay consistent.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export type Tier = "free" | "pro";

/**
 * Limits and feature flags per tier. The shape is the same for both —
 * UI components can render a "Free vs Pro" comparison table by walking
 * this object. Add a new gated feature by adding a key here AND a server-
 * side check that imports TIER_LIMITS.
 */
export const TIER_LIMITS = {
  free: {
    ask_messages_per_day: 20,
    boards_max: 3,
    sender_rules_max: 10,
    voice_retrain_per_week: 1,
    features: {
      labels: true,
      daily_briefing: true,
      smart_snooze: true,
      manual_draft: true,
      auto_draft: false, // Pro flagship
      memory: true,
      sender_rules: true,
      push_notifications: true,
    },
  },
  pro: {
    ask_messages_per_day: Number.POSITIVE_INFINITY,
    boards_max: Number.POSITIVE_INFINITY,
    sender_rules_max: Number.POSITIVE_INFINITY,
    voice_retrain_per_week: Number.POSITIVE_INFINITY,
    features: {
      labels: true,
      daily_briefing: true,
      smart_snooze: true,
      manual_draft: true,
      auto_draft: true,
      memory: true,
      sender_rules: true,
      push_notifications: true,
    },
  },
} as const;

export type FeatureFlag = keyof typeof TIER_LIMITS.free.features;

/**
 * Resolve a user's tier. Admin emails (OUSHI_ADMIN_EMAILS env var) are
 * always Pro for testing. Expired Pro subscriptions roll back to free.
 *
 * Pass `userEmail` whenever you have it (e.g., in a request handler).
 * Background contexts (cron, ranking pipeline) can pass null — they'll
 * skip the admin override and just read from the DB.
 */
export async function getUserTier(
  userId: string,
  userEmail: string | null
): Promise<Tier> {
  if (userEmail && isAdminEmail(userEmail)) return "pro";

  const service = await createServiceClient();
  const { data } = await service
    .from("user_profile")
    .select("subscription_tier, subscription_active_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return "free";
  if (data.subscription_tier !== "pro") return "free";

  // Pro that expired → revert to free
  if (data.subscription_active_until) {
    const expiresAt = new Date(data.subscription_active_until);
    if (expiresAt < new Date()) return "free";
  }

  return "pro";
}

/**
 * Same as getUserTier but doesn't need an email — looks up the auth user
 * to apply the admin override. Slightly heavier; use only when you don't
 * have email in scope (e.g., from a cron job iterating users).
 */
export async function getUserTierServerSide(userId: string): Promise<Tier> {
  const service = await createServiceClient();
  let email: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await (service.auth as any).admin.getUserById(
      userId
    )) as { data: { user: { email: string | null } | null } };
    email = data?.user?.email || null;
  } catch {
    // ignore — fall through to DB-only resolution
  }
  return getUserTier(userId, email);
}

// ─────────────────────────────────────────────────────────────────────────
// Ask Oushi daily quota
// ─────────────────────────────────────────────────────────────────────────

export interface AskQuotaState {
  allowed: boolean;
  used: number;
  /** -1 means unlimited (Pro). Otherwise the daily cap. */
  limit: number;
  tier: Tier;
  /** ISO timestamp of next quota reset (midnight UTC). null when unlimited. */
  resets_at: string | null;
}

/**
 * Check whether the user can send another Ask Oushi message. Does NOT
 * increment — call incrementAskQuota separately after a successful
 * response, so a failed Claude call doesn't burn a credit.
 */
export async function checkAskQuota(
  userId: string,
  userEmail: string | null
): Promise<AskQuotaState> {
  const tier = await getUserTier(userId, userEmail);
  const limitRaw = TIER_LIMITS[tier].ask_messages_per_day;

  if (limitRaw === Number.POSITIVE_INFINITY) {
    return { allowed: true, used: 0, limit: -1, tier, resets_at: null };
  }
  const limit = limitRaw as number;

  const service = await createServiceClient();
  const { data } = await service
    .from("user_sync_state")
    .select("ask_messages_today, ask_messages_reset_at")
    .eq("user_id", userId)
    .maybeSingle();

  const now = new Date();
  const resetAt = data?.ask_messages_reset_at
    ? new Date(data.ask_messages_reset_at)
    : null;

  // If we never set a reset OR the reset is in the past, the counter
  // is effectively 0 — the next increment will roll the window forward.
  let used = data?.ask_messages_today || 0;
  if (!resetAt || resetAt < now) used = 0;

  // Next reset is at upcoming UTC midnight (rolling 24h window keyed to
  // the user's first message of the day — simpler than calendar days
  // for testers across timezones)
  const nextReset =
    resetAt && resetAt > now
      ? resetAt
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return {
    allowed: used < limit,
    used,
    limit,
    tier,
    resets_at: nextReset.toISOString(),
  };
}

/**
 * Bump the per-day Ask Oushi counter. Roll the window over if the
 * previous reset_at is in the past.
 */
export async function incrementAskQuota(userId: string): Promise<void> {
  const service = await createServiceClient();
  const now = new Date();

  const { data } = await service
    .from("user_sync_state")
    .select("ask_messages_today, ask_messages_reset_at")
    .eq("user_id", userId)
    .maybeSingle();

  const resetAt = data?.ask_messages_reset_at
    ? new Date(data.ask_messages_reset_at)
    : null;
  const windowExpired = !resetAt || resetAt < now;

  const newCount = windowExpired ? 1 : (data?.ask_messages_today || 0) + 1;
  const newReset = windowExpired
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    : resetAt!.toISOString();

  await service.from("user_sync_state").upsert(
    {
      user_id: userId,
      ask_messages_today: newCount,
      ask_messages_reset_at: newReset,
    },
    { onConflict: "user_id" }
  );
}
