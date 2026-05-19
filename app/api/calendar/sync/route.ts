import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedClient } from "@/lib/gmail";
import { syncCalendarForUser } from "@/lib/calendar";

export const maxDuration = 60;

/**
 * Manual calendar sync — also called from the every-15-min sync cron.
 * Pulls the user's next 48h of events and pre-computes the related email
 * for each.
 *
 * Verbose error reporting so the UI can tell the user *why* sync failed:
 *   - "table_missing" (migration not run)
 *   - "scope_missing" (OAuth doesn't have calendar.events)
 *   - "auth_failed" (no Gmail token at all)
 *   - "no_events" (calendar is empty for next 48h)
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  // 1. Check that the calendar_events table exists
  const probe = await service
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (probe.error) {
    if (probe.error.code === "42P01" || /relation .* does not exist/.test(probe.error.message)) {
      return NextResponse.json({
        ok: false,
        reason: "table_missing",
        detail: "Run migration 015_calendar_events.sql in Supabase.",
      });
    }
    return NextResponse.json({
      ok: false,
      reason: "db_error",
      detail: probe.error.message,
    });
  }

  // 2. Try a direct fetch first to surface scope / auth errors clearly
  try {
    const oauth2Client = await getAuthenticatedClient(user.id);
    const cal = google.calendar({ version: "v3", auth: oauth2Client });
    const test = await cal.events.list({
      calendarId: "primary",
      maxResults: 1,
      timeMin: new Date().toISOString(),
    });
    void test;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    const status =
      e && typeof e === "object" && "code" in e ? (e as { code?: number }).code : undefined;
    let reason = "calendar_api_error";
    if (status === 401 || /invalid.*credentials|invalid_grant/i.test(msg)) reason = "auth_failed";
    if (status === 403 || /insufficient.*scope|insufficientPermissions|forbidden/i.test(msg))
      reason = "scope_missing";
    return NextResponse.json({
      ok: false,
      reason,
      detail: msg,
      hint:
        reason === "scope_missing"
          ? "Reconnect Gmail from settings to grant calendar.events scope."
          : reason === "auth_failed"
            ? "Your Google token expired. Reconnect Gmail from settings."
            : undefined,
    });
  }

  // 3. All good — run the full sync
  const result = await syncCalendarForUser(service, user.id, 48);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET() {
  // Read upcoming events for the dashboard widget
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data, error } = await service
    .from("calendar_events")
    .select("*")
    .eq("user_id", user.id)
    .gte("end_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(10);

  if (error) {
    // Table missing is non-fatal for the widget — just return empty
    if (error.code === "42P01" || /relation .* does not exist/.test(error.message)) {
      return NextResponse.json({ events: [], reason: "table_missing" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [] });
}
