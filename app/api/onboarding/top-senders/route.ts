import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { bootstrapPersonalization } from "@/lib/bootstrap";

export const maxDuration = 60;

/**
 * Returns the top senders from the user's existing Gmail behavior, ranked by
 * bootstrap reputation. Used during onboarding to ask "who matters most?"
 *
 * If bootstrap hasn't run yet for this user, fires it inline (one-shot,
 * cached via sender_reputation table for future calls).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  // Has bootstrap already run? Check user_sync_state.bootstrap_completed_at.
  const { data: state } = await service
    .from("user_sync_state")
    .select("bootstrap_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!state?.bootstrap_completed_at) {
    // Fire bootstrap now — onboarding wants this data
    try {
      await bootstrapPersonalization(service, user.id, user.email || null);
    } catch (e) {
      console.error("[onboarding/top-senders] bootstrap failed", e instanceof Error ? e.message : e);
    }
  }

  // Pull top-rep senders
  const { data: rep } = await service
    .from("sender_reputation")
    .select("sender_email, reputation, signal_count")
    .eq("user_id", user.id)
    .gte("reputation", 4)
    .order("reputation", { ascending: false })
    .limit(20);

  if (!rep || rep.length === 0) {
    return NextResponse.json({ people: [] });
  }

  // For each top sender, find their display name from the most recent email
  // we have from them (or extracted via bootstrap memory_entries)
  const emails = rep.map((r) => r.sender_email);
  const { data: memos } = await service
    .from("memory_entries")
    .select("subject, content")
    .eq("user_id", user.id)
    .eq("kind", "person");

  // Build a name map from emails table (best-effort)
  const { data: rows } = await service
    .from("emails")
    .select("from_email, from_name")
    .eq("user_id", user.id)
    .in("from_email", emails)
    .limit(200);

  const nameByEmail = new Map<string, string>();
  for (const row of rows || []) {
    if (row.from_email && row.from_name && !nameByEmail.has(row.from_email)) {
      nameByEmail.set(row.from_email, row.from_name);
    }
  }
  // Memory entries store name in `subject` for kind=person — use as fallback
  for (const m of memos || []) {
    const emailMatch = (m.content || "").match(/\(([^)]+@[^)]+)\)/);
    if (emailMatch) {
      const e = emailMatch[1].toLowerCase();
      if (!nameByEmail.has(e) && m.subject) nameByEmail.set(e, m.subject);
    }
  }

  // Filter out role-account-looking emails (further safety net even though
  // bootstrap already filters most)
  const ROLE_PREFIXES = /^(noreply|no-reply|donotreply|notifications?|alerts?|updates?|info|hello|team|billing|receipts?|invoices?|newsletter|marketing|promotions?|announcements?|press|postmaster|mailer-daemon|reply\+)/i;

  const people = rep
    .filter((r) => !ROLE_PREFIXES.test(r.sender_email.split("@")[0] || ""))
    .map((r) => ({
      email: r.sender_email,
      name: nameByEmail.get(r.sender_email) || r.sender_email.split("@")[0],
      reputation: r.reputation,
      signal_count: r.signal_count,
    }))
    .slice(0, 10);

  return NextResponse.json({ people });
}
