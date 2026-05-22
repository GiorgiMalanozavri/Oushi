import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/ical/[token]
 *
 * Public iCal feed — the URL token IS the auth. Anyone with the link
 * can subscribe in Google Calendar / Apple Calendar / Outlook and see
 * the user's open commitments alongside their meetings. Regenerating
 * the token revokes the old URL.
 *
 * We don't add VEVENTs for calendar events — those already live in the
 * user's calendar. The point of this feed is the email-driven side of
 * their life that's currently invisible: "you said you'd send Sarah the
 * draft by Friday."
 *
 * Spec: RFC 5545 minimal subset. Cal apps are forgiving about the
 * smaller fields; the things that matter are PRODID, UID, DTSTAMP,
 * DTSTART, DTEND, SUMMARY.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token || token.length < 16) {
    return new Response("Not found", { status: 404 });
  }

  const service = await createServiceClient();
  const { data: integration } = await service
    .from("user_integrations")
    .select("user_id, ical_enabled")
    .eq("ical_token", token)
    .maybeSingle();

  if (!integration || !integration.ical_enabled) {
    return new Response("Not found", { status: 404 });
  }

  // Pull open commitments. Closed ones drop out of the feed — cleaner
  // than leaving them in marked "done" because most calendar apps don't
  // visualize event status.
  const { data: commitments } = await service
    .from("commitments")
    .select(
      "id, summary, raw_quote, recipient_name, recipient_email, due_at, sent_at, urgency, gmail_thread_id"
    )
    .eq("user_id", integration.user_id)
    .eq("status", "open")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Oushi//Commitments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Oushi commitments",
    "X-WR-CALDESC:Open promises Oushi has tracked from your sent email.",
    "X-PUBLISHED-TTL:PT1H",
  ];

  const now = new Date();

  for (const c of commitments || []) {
    // Pick a date for the event:
    //   - real due_at if we extracted one
    //   - urgency=today: today at 17:00 user-local-ish (we use UTC; cal
    //     apps will localize)
    //   - urgency=this_week: end of this week
    //   - urgency=soon: a week from now
    //   - everything else: 3 days out
    // The cal apps need SOMETHING — events with no DTSTART are dropped.
    let when: Date;
    if (c.due_at) {
      when = new Date(c.due_at);
    } else if (c.urgency === "today") {
      when = new Date();
      when.setHours(17, 0, 0, 0);
    } else if (c.urgency === "this_week") {
      const d = new Date();
      const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilFriday);
      d.setHours(17, 0, 0, 0);
      when = d;
    } else if (c.urgency === "soon") {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(17, 0, 0, 0);
      when = d;
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setHours(17, 0, 0, 0);
      when = d;
    }

    // 30-min "event" — appears on the calendar without taking a whole day
    const end = new Date(when.getTime() + 30 * 60 * 1000);

    const description = [
      c.recipient_name || c.recipient_email
        ? `You told ${c.recipient_name || c.recipient_email}.`
        : null,
      c.raw_quote ? `"${c.raw_quote}"` : null,
      c.gmail_thread_id
        ? `https://mail.google.com/mail/u/0/#inbox/${c.gmail_thread_id}`
        : null,
    ]
      .filter(Boolean)
      .join("\\n\\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:commitment-${c.id}@oushi.app`,
      `DTSTAMP:${formatICalDate(now)}`,
      `DTSTART:${formatICalDate(when)}`,
      `DTEND:${formatICalDate(end)}`,
      `SUMMARY:${escapeICalText(c.summary)}`,
      `DESCRIPTION:${escapeICalText(description)}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "CATEGORIES:Oushi,Commitment",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");

  // \r\n line endings per RFC. Cal apps that accept \n are forgiving but
  // strict ones (some Outlook variants) won't.
  const body = lines.join("\r\n") + "\r\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="oushi-commitments.ics"',
      // Cal clients usually re-fetch every 15-60 min; keep the cache
      // short so opening a snoozed commitment reflects quickly.
      "Cache-Control": "private, max-age=300",
    },
  });
}

/** ISO 8601 UTC compact form, e.g. 20260522T140000Z. */
function formatICalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** Escape characters that have special meaning in iCal text fields. */
function escapeICalText(s: string): string {
  if (!s) return "";
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
