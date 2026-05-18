import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/commitments — list the user's open commitments (sorted by urgency / due date)
 *
 * Query params:
 *   status=open|fulfilled|dismissed|all  (default: open)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";

  const service = await createServiceClient();
  let query = service
    .from("commitments")
    .select("*")
    .eq("user_id", user.id);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("sent_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Surface snoozed-back-to-open: anything past its snoozed_until comes back
  const now = new Date();
  const promoted: string[] = [];
  for (const c of data || []) {
    if (c.status === "snoozed" && c.snoozed_until && new Date(c.snoozed_until) <= now) {
      promoted.push(c.id);
    }
  }
  if (promoted.length > 0) {
    await service
      .from("commitments")
      .update({ status: "open", snoozed_until: null })
      .in("id", promoted);
  }

  return NextResponse.json({ commitments: data || [] });
}

/**
 * Last scan state — for the dashboard "X commitments tracked, last scanned 12m ago"
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
