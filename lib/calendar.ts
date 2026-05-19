import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedClient } from "@/lib/gmail";

/**
 * Calendar awareness. Sync the user's next 48h of events, cross-reference
 * each event with the most-recent email thread for any attendee, and store
 * the pair so push nudges can fire in O(1) at notification time.
 */

export interface CalendarEventLite {
  google_event_id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  start_at: string;          // ISO
  end_at: string | null;     // ISO
  is_all_day: boolean;
  hangout_link: string | null;
  attendees: Array<{ email: string; name?: string; responseStatus?: string }>;
  organizer_email: string | null;
  organizer_name: string | null;
}

/**
 * Fetch the user's events for the next `hours` window via Google Calendar API.
 * Uses calendar.events scope which already allows reading.
 */
export async function fetchUpcomingEvents(
  oauth2Client: OAuth2Client,
  hours = 48
): Promise<CalendarEventLite[]> {
  const cal = google.calendar({ version: "v3", auth: oauth2Client });

  const now = new Date();
  const end = new Date(now.getTime() + hours * 60 * 60 * 1000);

  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,    // expand recurring events
    orderBy: "startTime",
    maxResults: 50,
  });

  const items = res.data.items || [];
  const out: CalendarEventLite[] = [];

  for (const ev of items) {
    if (!ev.id || ev.status === "cancelled") continue;

    // Start/end can be dateTime (timed) or date (all-day)
    const startRaw = ev.start?.dateTime || ev.start?.date;
    const endRaw = ev.end?.dateTime || ev.end?.date;
    if (!startRaw) continue;

    const isAllDay = !ev.start?.dateTime;

    const attendees =
      (ev.attendees || [])
        .filter((a) => a.email)
        .map((a) => ({
          email: a.email!,
          name: a.displayName || undefined,
          responseStatus: a.responseStatus || undefined,
        }));

    out.push({
      google_event_id: ev.id,
      summary: ev.summary || null,
      description: ev.description || null,
      location: ev.location || null,
      start_at: new Date(startRaw).toISOString(),
      end_at: endRaw ? new Date(endRaw).toISOString() : null,
      is_all_day: isAllDay,
      hangout_link: ev.hangoutLink || null,
      attendees,
      organizer_email: ev.organizer?.email || null,
      organizer_name: ev.organizer?.displayName || null,
    });
  }

  return out;
}

/**
 * Given the attendees of an event, find the most-recent email thread the user
 * has been involved in with any of them. Returns the email row that will be
 * surfaced in the pre-meeting nudge.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findRelatedEmail(
  service: SupabaseClient<any, "public", any>,
  userId: string,
  attendees: CalendarEventLite["attendees"],
  organizerEmail: string | null
): Promise<{
  id: string;
  subject: string | null;
  from_name: string | null;
  snippet: string | null;
  received_at: string;
} | null> {
  // Collect candidate email addresses (drop the user themselves later via RLS)
  const candidates = new Set<string>();
  for (const a of attendees) {
    if (a.email) candidates.add(a.email.toLowerCase());
  }
  if (organizerEmail) candidates.add(organizerEmail.toLowerCase());

  if (candidates.size === 0) return null;

  const addressList = Array.from(candidates);

  const { data } = await service
    .from("emails")
    .select("id, subject, from_name, snippet, received_at, from_email")
    .eq("user_id", userId)
    .in("from_email", addressList)
    .gte("received_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
    .order("received_at", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  const row = data[0];
  return {
    id: row.id,
    subject: row.subject,
    from_name: row.from_name,
    snippet: row.snippet,
    received_at: row.received_at,
  };
}

/**
 * End-to-end sync: fetch events, cross-reference, upsert. Idempotent.
 */
export async function syncCalendarForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, "public", any>,
  userId: string,
  hours = 48
): Promise<{ events: number; matched: number }> {
  let oauth2Client: OAuth2Client;
  try {
    oauth2Client = await getAuthenticatedClient(userId);
  } catch {
    return { events: 0, matched: 0 };
  }

  let events: CalendarEventLite[] = [];
  try {
    events = await fetchUpcomingEvents(oauth2Client, hours);
  } catch (e) {
    console.error("[calendar.sync] fetch failed", e instanceof Error ? e.message : e);
    return { events: 0, matched: 0 };
  }

  let matched = 0;
  for (const ev of events) {
    const related = await findRelatedEmail(service, userId, ev.attendees, ev.organizer_email);
    if (related) matched++;

    await service.from("calendar_events").upsert(
      {
        user_id: userId,
        google_event_id: ev.google_event_id,
        calendar_id: "primary",
        summary: ev.summary,
        description: ev.description?.slice(0, 4000) || null,
        location: ev.location,
        start_at: ev.start_at,
        end_at: ev.end_at,
        is_all_day: ev.is_all_day,
        hangout_link: ev.hangout_link,
        attendees: ev.attendees,
        organizer_email: ev.organizer_email,
        organizer_name: ev.organizer_name,
        related_email_id: related?.id || null,
        related_email_subject: related?.subject || null,
        related_email_from_name: related?.from_name || null,
        related_email_snippet: related?.snippet?.slice(0, 500) || null,
        related_email_received_at: related?.received_at || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,google_event_id" }
    );
  }

  // Prune past events more than 24h old (housekeeping)
  await service
    .from("calendar_events")
    .delete()
    .eq("user_id", userId)
    .lt("end_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return { events: events.length, matched };
}
