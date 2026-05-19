import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { syncCalendarForUser } from "@/lib/calendar";

export const maxDuration = 60;

/**
 * Manual calendar sync — also called from the every-15-min sync cron.
 * Pulls the user's next 48h of events and pre-computes the related email
 * for each.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const result = await syncCalendarForUser(service, user.id, 48);
  return NextResponse.json(result);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [] });
}
