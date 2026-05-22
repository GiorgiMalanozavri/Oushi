import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Admin-only endpoints to flip a user's Pro flag.
 *
 *   GET  /api/admin/grant-pro?q=<email-or-substring>
 *     Returns up to 20 users whose email or name matches the query, with
 *     current tier + a few signal columns so you know who you're about to
 *     grant. Empty q returns the 20 most recent users.
 *
 *   POST /api/admin/grant-pro
 *     Body: { user_id: string, action: "grant" | "revoke" }
 *     Flips user_profile.subscription_tier. On grant we also clear any
 *     expiry — the beta grant is "until further notice." Returns the
 *     updated tier so the UI can re-render.
 *
 * Both endpoints are gated by OUSHI_ADMIN_EMAILS.
 */

interface AuthUser {
  id: string;
  email: string | null;
  user_metadata?: Record<string, unknown> | null;
  created_at: string | null;
}

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; res: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isAdminEmail(user.email || null)) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  const service = await createServiceClient();

  // Pull a page of users from auth. There's no email-substring filter in
  // the admin SDK, so we list and filter in-memory. For a 15-user beta
  // this is fine; if we ever cross a few hundred users we'd switch to a
  // direct query against auth.users with ilike.
  let authUsers: AuthUser[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await (service.auth as any).admin.listUsers({
      page: 1,
      perPage: 200,
    })) as { data: { users: AuthUser[] } };
    authUsers = data?.users || [];
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Couldn't list users: ${e.message}`
            : "Couldn't list users",
      },
      { status: 500 }
    );
  }

  const filtered = q
    ? authUsers.filter((u) => {
        const email = (u.email || "").toLowerCase();
        const name = String(
          (u.user_metadata?.full_name as string | undefined) ||
            (u.user_metadata?.name as string | undefined) ||
            ""
        ).toLowerCase();
        return email.includes(q) || name.includes(q);
      })
    : authUsers;

  // Sort: most recent first, then take 20
  filtered.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  const slice = filtered.slice(0, 20);

  if (slice.length === 0) {
    return NextResponse.json({ users: [] });
  }

  // Hydrate with profile / sync state — current tier, last sync, email
  // counts. One query per table, joined in JS.
  const userIds = slice.map((u) => u.id);

  const [profileRes, syncRes, emailCountRes] = await Promise.all([
    service
      .from("user_profile")
      .select(
        "user_id, subscription_tier, subscription_active_until, subscription_updated_at"
      )
      .in("user_id", userIds),
    service
      .from("user_sync_state")
      .select("user_id, last_synced_at")
      .in("user_id", userIds),
    service.from("emails").select("user_id").in("user_id", userIds),
  ]);

  const profileMap = new Map<
    string,
    {
      subscription_tier: string | null;
      subscription_active_until: string | null;
      subscription_updated_at: string | null;
    }
  >();
  for (const r of (profileRes.data || []) as Array<{
    user_id: string;
    subscription_tier: string | null;
    subscription_active_until: string | null;
    subscription_updated_at: string | null;
  }>) {
    profileMap.set(r.user_id, {
      subscription_tier: r.subscription_tier,
      subscription_active_until: r.subscription_active_until,
      subscription_updated_at: r.subscription_updated_at,
    });
  }

  const syncMap = new Map<string, string | null>();
  for (const r of (syncRes.data || []) as Array<{
    user_id: string;
    last_synced_at: string | null;
  }>) {
    syncMap.set(r.user_id, r.last_synced_at);
  }

  const emailCountMap = new Map<string, number>();
  for (const r of (emailCountRes.data || []) as Array<{ user_id: string }>) {
    emailCountMap.set(r.user_id, (emailCountMap.get(r.user_id) || 0) + 1);
  }

  const users = slice.map((u) => {
    const p = profileMap.get(u.id);
    return {
      user_id: u.id,
      email: u.email,
      name:
        (u.user_metadata?.full_name as string | undefined) ||
        (u.user_metadata?.name as string | undefined) ||
        null,
      created_at: u.created_at,
      tier: (p?.subscription_tier === "pro" ? "pro" : "free") as "pro" | "free",
      subscription_active_until: p?.subscription_active_until || null,
      subscription_updated_at: p?.subscription_updated_at || null,
      last_synced_at: syncMap.get(u.id) || null,
      email_count: emailCountMap.get(u.id) || 0,
    };
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || "").trim();
  const action = String(body?.action || "").trim();

  if (!userId) {
    return NextResponse.json(
      { error: "user_id is required" },
      { status: 400 }
    );
  }
  if (action !== "grant" && action !== "revoke") {
    return NextResponse.json(
      { error: "action must be 'grant' or 'revoke'" },
      { status: 400 }
    );
  }

  const service = await createServiceClient();

  // Confirm the user exists before we upsert — otherwise an attacker
  // (well, a typo) could create profile rows for arbitrary UUIDs.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = (await (service.auth as any).admin.getUserById(
      userId
    )) as {
      data: { user: { id: string; email: string | null } | null };
      error: { message: string } | null;
    };
    if (error || !data?.user) {
      return NextResponse.json(
        { error: "No such user" },
        { status: 404 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Couldn't verify user" },
      { status: 500 }
    );
  }

  const newTier = action === "grant" ? "pro" : "free";
  const { error } = await service.from("user_profile").upsert(
    {
      user_id: userId,
      subscription_tier: newTier,
      // Grant clears any expiry — the beta grant is "until further
      // notice." Revoke also clears it (a free user shouldn't have an
      // expiry hanging around).
      subscription_active_until: null,
      subscription_updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user_id: userId, tier: newTier });
}
