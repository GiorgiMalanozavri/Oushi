import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedClient } from "@/lib/gmail";
import { createAnthropicClient, extractJson } from "@/lib/claude";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const EXTRACT_SYSTEM = `Extract calendar event details from an email. The user wants to save this as a calendar event.

Output ONLY valid JSON in this exact shape:
{
  "title": "<short event title, max 60 chars>",
  "start": "<ISO datetime e.g. 2026-05-20T15:00:00 — local time, NO timezone suffix>",
  "end": "<ISO datetime — if not explicit, set to start + 1 hour>",
  "location": "<location/venue if mentioned, otherwise null>",
  "description": "<1-2 sentences summarizing what the event is, with key details like confirmation numbers>",
  "all_day": <boolean — true if the email mentions a date but no specific time>,
  "confidence": "high" | "medium" | "low"
}

Rules:
- Use the user's local timezone (provided below). Output the start/end times as if in their local zone, no Z suffix.
- If you can't find a clear date or time, set confidence to "low" and use today's date with a placeholder time.
- Be conservative with all_day: only true if no clock time is mentioned.
- Never invent details. Use only what's in the email.`;

interface ExtractedEvent {
  title: string;
  start: string;
  end: string;
  location: string | null;
  description: string;
  all_day: boolean;
  confidence: "high" | "medium" | "low";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = rateLimit(`calendar:${user.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many calendar requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const userTimezone: string = body.timezone || "UTC";
  // Optional client-provided override
  const overrideEvent: Partial<ExtractedEvent> | null = body.event || null;

  const service = await createServiceClient();
  const { data: email } = await service
    .from("emails")
    .select("subject, body_preview, snippet, from_name, from_email, suggested_action, received_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  let extracted: ExtractedEvent;
  try {
    if (overrideEvent && overrideEvent.title && overrideEvent.start && overrideEvent.end) {
      extracted = {
        title: overrideEvent.title,
        start: overrideEvent.start,
        end: overrideEvent.end,
        location: overrideEvent.location ?? null,
        description: overrideEvent.description || "",
        all_day: !!overrideEvent.all_day,
        confidence: "high",
      };
    } else {
      const client = createAnthropicClient();
      const suggestion = email.suggested_action?.detail || "";
      const emailBody = (email.body_preview || email.snippet || "").slice(0, 4000);
      const today = new Date().toISOString().split("T")[0];

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: EXTRACT_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Today: ${today}\nUser timezone: ${userTimezone}\n\nEmail:\nFrom: ${email.from_name} <${email.from_email}>\nSubject: ${email.subject}\nReceived: ${email.received_at}\n\n${emailBody}\n\n${suggestion ? `Oushi's suggestion: ${suggestion}\n\n` : ""}Extract the calendar event.`,
          },
        ],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      extracted = JSON.parse(extractJson(text)) as ExtractedEvent;
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't extract event: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }

  // Create the calendar event via Google Calendar API
  let oauth2Client;
  try {
    oauth2Client = await getAuthenticatedClient(user.id);
  } catch {
    return NextResponse.json({ error: "Gmail not connected", needsReauth: true }, { status: 400 });
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const event = extracted.all_day
      ? {
          summary: extracted.title,
          location: extracted.location || undefined,
          description: extracted.description + `\n\nSaved from Oushi · ${email.subject}`,
          start: { date: extracted.start.split("T")[0] },
          end: { date: extracted.end.split("T")[0] },
        }
      : {
          summary: extracted.title,
          location: extracted.location || undefined,
          description: extracted.description + `\n\nSaved from Oushi · ${email.subject}`,
          start: { dateTime: extracted.start, timeZone: userTimezone },
          end: { dateTime: extracted.end, timeZone: userTimezone },
        };

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    return NextResponse.json({
      ok: true,
      event: extracted,
      htmlLink: res.data.htmlLink,
      eventId: res.data.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Calendar API error";
    const needsReauth = /insufficient.*scope|invalid_scope|permission/i.test(msg);
    return NextResponse.json(
      { error: msg, needsReauth, extractedEvent: extracted },
      { status: 500 }
    );
  }
}
