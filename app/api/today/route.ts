import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isWorthSurfacing, type EmailRow } from "@/lib/outstanding";

export const dynamic = "force-dynamic";

/**
 * GET /api/today
 *
 * The unified "your day" feed — composes the top things that need the user's
 * attention across every data source Oushi reads:
 *
 *   - Calendar events in the next 12h (especially with related emails)
 *   - Overdue / due-soon commitments (Promises engine)
 *   - High-score unread emails waiting for a reply
 *
 * This is what makes the new AI-first dashboard possible: instead of the user
 * navigating buckets (Urgent / Awaiting / Promises / Coming up), Oushi picks
 * the actually-most-important items across ALL of them and surfaces them as a
 * single unified list.
 *
 * Returns a small structured payload the dashboard can render as cards.
 */

interface TodayItem {
  id: string;
  type: "meeting" | "commitment" | "email";
  // 0..100 — used to rank across types
  urgency: number;
  // For display
  title: string;
  subtitle: string | null;
  detail: string | null;
  time_label: string | null;          // "3pm", "in 32 min", "2d overdue"
  // Routing — the dashboard uses these to open the right modal/view
  email_id: string | null;
  commitment_id: string | null;
  calendar_event_id: string | null;
  // Iconography
  icon: "meeting" | "deadline" | "mail" | "handshake" | "calendar";
}

interface TodayResponse {
  greeting: string;
  summary: string;
  items: TodayItem[];
  sources: {
    gmail: boolean;
    calendar: boolean;
    push_enabled: boolean;
  };
  quietly_handled: {
    muted_today: number;
    auto_fulfilled_today: number;
    nudges_sent_today: number;
  };
  generated_at: string;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const now = new Date();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  // ---- 1. Upcoming meetings (next 12h) ----
  const meetingHorizon = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const { data: meetings } = await service
    .from("calendar_events")
    .select("google_event_id, summary, start_at, related_email_id, related_email_from_name, related_email_snippet")
    .eq("user_id", user.id)
    .gte("start_at", new Date(now.getTime() - 10 * 60 * 1000).toISOString())
    .lte("start_at", meetingHorizon.toISOString())
    .order("start_at", { ascending: true })
    .limit(5);

  const meetingItems: TodayItem[] = (meetings || []).map((m) => {
    const start = new Date(m.start_at);
    const minsUntil = Math.round((start.getTime() - now.getTime()) / 60000);
    const timeLabel =
      minsUntil < 5 && minsUntil >= -10 ? "now" :
      minsUntil < 0 ? "started" :
      minsUntil < 60 ? `in ${minsUntil} min` :
      start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    // Urgency: starts soon = high, related-email present = bonus
    let urgency = 60;
    if (minsUntil <= 60 && minsUntil >= 0) urgency = 90;
    else if (minsUntil <= 180 && minsUntil >= 0) urgency = 75;
    if (m.related_email_id) urgency += 5;

    return {
      id: `meeting:${m.google_event_id}`,
      type: "meeting",
      urgency: Math.min(100, urgency),
      title: m.summary || "Untitled meeting",
      subtitle: m.related_email_from_name ? `Last from ${m.related_email_from_name}` : null,
      detail: m.related_email_snippet ? m.related_email_snippet.slice(0, 140) : null,
      time_label: timeLabel,
      email_id: m.related_email_id || null,
      commitment_id: null,
      calendar_event_id: m.google_event_id,
      icon: "meeting",
    };
  });

  // ---- 2. Open commitments (overdue + due today + due soon) ----
  const dayAhead = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  const { data: commitments } = await service
    .from("commitments")
    .select("id, summary, raw_quote, recipient_name, recipient_email, due_at, sent_at, urgency, gmail_thread_id")
    .eq("user_id", user.id)
    .eq("status", "open")
    .or(`due_at.lte.${dayAhead.toISOString()},urgency.in.(today,this_week)`)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(8);

  const commitmentItems: TodayItem[] = (commitments || []).map((c) => {
    const due = c.due_at ? new Date(c.due_at) : null;
    let timeLabel: string | null = null;
    let urgency = 55;
    if (due) {
      const diffMs = due.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      if (diffMs < 0) {
        const overdue = Math.abs(diffDays);
        timeLabel = overdue === 0 ? "due today" : `${overdue}d overdue`;
        urgency = 85 + Math.min(10, overdue);
      } else if (diffDays === 0) {
        timeLabel = "due today";
        urgency = 80;
      } else if (diffDays === 1) {
        timeLabel = "due tomorrow";
        urgency = 70;
      } else {
        timeLabel = `due in ${diffDays}d`;
        urgency = 60;
      }
    } else if (c.urgency === "today") {
      timeLabel = "due today";
      urgency = 75;
    }

    return {
      id: `commitment:${c.id}`,
      type: "commitment",
      urgency,
      title: c.summary,
      subtitle: c.recipient_name ? `You told ${c.recipient_name}` : null,
      detail: c.raw_quote ? `"${c.raw_quote.slice(0, 140)}"` : null,
      time_label: timeLabel,
      email_id: null,
      commitment_id: c.id,
      calendar_event_id: null,
      icon: "handshake",
    };
  });

  // ---- 3. High-score unreplied emails waiting on the user ----
  // Pull a wider slice so post-filtering for non-replyable senders /
  // transactional subjects still leaves us with real items.
  const emailLookback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rawEmails } = await service
    .from("emails")
    .select("id, from_name, from_email, subject, snippet, body_preview, received_at, score, is_unread, user_replied")
    .eq("user_id", user.id)
    .eq("user_replied", false)
    .is("dismissed_at", null)
    .gte("score", 50)
    .gte("received_at", emailLookback)
    .order("score", { ascending: false })
    .limit(30);

  // Filter out receipts, verification codes, login alerts, automated
  // senders — anything where "5d waiting" would be a lie.
  const emails = (rawEmails || []).filter((e) => {
    // Build a minimal EmailRow for isWorthSurfacing
    const row = {
      from_name: e.from_name || "",
      from_email: e.from_email || "",
      subject: e.subject || "",
      snippet: e.snippet || "",
      body_preview: e.body_preview || "",
    } as Partial<EmailRow> as EmailRow;
    return isWorthSurfacing(row);
  }).slice(0, 8);

  const emailItems: TodayItem[] = (emails || []).map((e) => {
    const ageDays = Math.floor((now.getTime() - new Date(e.received_at).getTime()) / (24 * 60 * 60 * 1000));
    const ageLabel =
      ageDays <= 0 ? "today" :
      ageDays === 1 ? "1d waiting" :
      `${ageDays}d waiting`;
    // Urgency = base 60 + score boost - age penalty (older = more urgent)
    const urgency = Math.min(95, 50 + Math.floor((e.score || 50) * 0.3) + Math.min(15, ageDays * 2));
    return {
      id: `email:${e.id}`,
      type: "email",
      urgency,
      title: e.from_name || e.from_email || "(no sender)",
      subtitle: e.subject || null,
      detail: e.snippet ? e.snippet.slice(0, 140) : null,
      time_label: ageLabel,
      email_id: e.id,
      commitment_id: null,
      calendar_event_id: null,
      icon: "mail",
    };
  });

  // ---- Merge, dedupe by underlying resource, sort by urgency ----
  const seenEmailIds = new Set<string>();
  const merged: TodayItem[] = [];

  // Meetings first (often time-sensitive)
  for (const m of meetingItems) {
    if (m.email_id) seenEmailIds.add(m.email_id);
    merged.push(m);
  }
  for (const c of commitmentItems) {
    merged.push(c);
  }
  for (const e of emailItems) {
    if (e.email_id && seenEmailIds.has(e.email_id)) continue;
    merged.push(e);
  }

  merged.sort((a, b) => b.urgency - a.urgency);
  const top = merged.slice(0, 5);

  // ---- Greeting copy ----
  const hour = now.getHours();
  const profile = await service
    .from("user_profile")
    .select("bio")
    .eq("user_id", user.id)
    .maybeSingle();
  const emailLocal = (user.email || "").split("@")[0].split(".")[0];
  const name = emailLocal ? emailLocal[0].toUpperCase() + emailLocal.slice(1) : "there";
  const greeting =
    hour < 5 ? `Up late, ${name}.` :
    hour < 12 ? `Good morning, ${name}.` :
    hour < 17 ? `Good afternoon, ${name}.` :
    hour < 21 ? `Good evening, ${name}.` :
    `Late night, ${name}.`;
  void profile;

  let summary: string;
  if (top.length === 0) {
    summary = "Your day is clear. Oushi is watching the inbox.";
  } else if (top.length === 1) {
    summary = "One thing needs you today.";
  } else {
    summary = `${top.length} things on your plate today.`;
  }

  // ---- Sources status ----
  const { data: tokens } = await service
    .from("user_tokens")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: push } = await service
    .from("push_subscriptions")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", user.id);

  // ---- "Quietly handled" stats for today ----
  const { count: mutedToday } = await service
    .from("user_mutes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", dayStart.toISOString());
  const { count: autoFulfilledToday } = await service
    .from("commitments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "fulfilled")
    .gte("fulfilled_at", dayStart.toISOString());
  const { count: nudgesSentToday } = await service
    .from("push_nudges_sent")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("sent_at", dayStart.toISOString());

  const response: TodayResponse = {
    greeting,
    summary,
    items: top,
    sources: {
      gmail: !!tokens,
      calendar: !!tokens, // assumed scoped together
      push_enabled: (push?.length ?? 0) > 0,
    },
    quietly_handled: {
      muted_today: mutedToday || 0,
      auto_fulfilled_today: autoFulfilledToday || 0,
      nudges_sent_today: nudgesSentToday || 0,
    },
    generated_at: now.toISOString(),
  };

  return NextResponse.json(response);
}
