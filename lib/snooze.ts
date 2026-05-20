/**
 * Smart snooze: compute the right "until" timestamp + display reason for
 * each preset. The "smart" part is the calendar-aware presets that look at
 * the user's actual schedule to find a sensible resurface moment.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SnoozePreset =
  | "later_today"          // +3 hours
  | "tomorrow_morning"     // tomorrow 9am
  | "next_week"            // Monday 9am
  | "this_weekend"         // Saturday 9am
  | "next_free"            // smart: next free 30+min on calendar
  | "after_meetings"       // smart: after the user's last meeting today
  | "custom";              // user-supplied ISO time

export interface SnoozeResolution {
  until: string;           // ISO timestamp
  reason: string;          // human-readable display label
}

/**
 * Resolve a preset (and optional user-supplied custom time) into a concrete
 * snooze target + display label. Looks at the user's calendar for the
 * "smart" presets.
 */
export async function resolveSnooze(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, "public", any>,
  userId: string,
  preset: SnoozePreset,
  options?: { custom_until?: string; now?: Date }
): Promise<SnoozeResolution> {
  const now = options?.now || new Date();

  switch (preset) {
    case "later_today": {
      const until = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      return {
        until: until.toISOString(),
        reason: `Later today · ${formatTime(until)}`,
      };
    }

    case "tomorrow_morning": {
      const until = nextWeekdayAt(now, /* anyDay */ true, 9);
      until.setDate(until.getDate() + 1);
      until.setHours(9, 0, 0, 0);
      return {
        until: until.toISOString(),
        reason: "Tomorrow morning",
      };
    }

    case "next_week": {
      const until = new Date(now);
      const day = until.getDay(); // 0=Sun, 1=Mon
      const daysUntilMonday = day === 1 ? 7 : day === 0 ? 1 : 8 - day;
      until.setDate(until.getDate() + daysUntilMonday);
      until.setHours(9, 0, 0, 0);
      return {
        until: until.toISOString(),
        reason: "Next Monday",
      };
    }

    case "this_weekend": {
      const until = new Date(now);
      const day = until.getDay();
      const daysUntilSat = day === 6 ? 7 : day === 0 ? 6 : 6 - day;
      until.setDate(until.getDate() + daysUntilSat);
      until.setHours(9, 0, 0, 0);
      return {
        until: until.toISOString(),
        reason: "This weekend",
      };
    }

    case "next_free": {
      // Find the next 30+ minute free slot on the user's calendar today.
      // Falls back to tomorrow morning if nothing today.
      const slot = await findNextFreeSlot(service, userId, now);
      if (!slot) {
        const fallback = nextWeekdayAt(now, true, 9);
        fallback.setDate(fallback.getDate() + 1);
        fallback.setHours(9, 0, 0, 0);
        return {
          until: fallback.toISOString(),
          reason: "Tomorrow morning (no free time today)",
        };
      }
      return {
        until: slot.toISOString(),
        reason: `When you're free · ${formatTime(slot)}`,
      };
    }

    case "after_meetings": {
      // After the last meeting of the day, or tomorrow morning if nothing today
      const end = await findEndOfLastMeetingToday(service, userId, now);
      if (!end) {
        const fallback = nextWeekdayAt(now, true, 9);
        fallback.setDate(fallback.getDate() + 1);
        fallback.setHours(9, 0, 0, 0);
        return {
          until: fallback.toISOString(),
          reason: "Tomorrow (no meetings today)",
        };
      }
      return {
        until: end.toISOString(),
        reason: `After your meetings · ${formatTime(end)}`,
      };
    }

    case "custom": {
      const target = options?.custom_until ? new Date(options.custom_until) : null;
      if (!target || isNaN(target.getTime()) || target.getTime() <= now.getTime()) {
        // Fall back to tomorrow morning
        const fallback = new Date(now);
        fallback.setDate(fallback.getDate() + 1);
        fallback.setHours(9, 0, 0, 0);
        return {
          until: fallback.toISOString(),
          reason: "Tomorrow morning",
        };
      }
      return {
        until: target.toISOString(),
        reason: `Until ${formatDateTime(target)}`,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Smart slot finders
// ─────────────────────────────────────────────────────────────────────────

/**
 * Find the next 30+ minute free block on the user's calendar today.
 * Respects working hours (9am-7pm). Returns the start time of that gap,
 * or null if no gap fits.
 */
async function findNextFreeSlot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, "public", any>,
  userId: string,
  now: Date
): Promise<Date | null> {
  const WORK_END_HOUR = 19;
  const MIN_GAP_MINS = 30;

  // End of today's working window
  const endOfDay = new Date(now);
  endOfDay.setHours(WORK_END_HOUR, 0, 0, 0);
  if (now >= endOfDay) return null; // already past working hours

  // Earliest we'd consider: now + 5 min buffer
  const earliest = new Date(now.getTime() + 5 * 60 * 1000);
  // If before 9am, jump to 9am
  if (earliest.getHours() < 9) earliest.setHours(9, 0, 0, 0);

  const { data: events } = await service
    .from("calendar_events")
    .select("start_at, end_at")
    .eq("user_id", userId)
    .gte("end_at", earliest.toISOString())
    .lte("start_at", endOfDay.toISOString())
    .order("start_at", { ascending: true })
    .limit(20);

  if (!events || events.length === 0) {
    // No events at all — return earliest
    return earliest;
  }

  // Walk through events, find first gap of MIN_GAP_MINS
  let cursor = earliest;
  for (const ev of events) {
    const evStart = new Date(ev.start_at);
    const evEnd = ev.end_at ? new Date(ev.end_at) : new Date(evStart.getTime() + 60 * 60 * 1000);

    const gapMins = (evStart.getTime() - cursor.getTime()) / 60000;
    if (gapMins >= MIN_GAP_MINS) {
      return cursor;
    }
    if (evEnd > cursor) cursor = evEnd;
  }

  // After all events — check if there's still room before end of day
  const remainingMins = (endOfDay.getTime() - cursor.getTime()) / 60000;
  if (remainingMins >= MIN_GAP_MINS) {
    return cursor;
  }
  return null;
}

/**
 * Find the end of the user's last meeting today. Returns the time, or null
 * if there are no meetings today.
 */
async function findEndOfLastMeetingToday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, "public", any>,
  userId: string,
  now: Date
): Promise<Date | null> {
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: events } = await service
    .from("calendar_events")
    .select("start_at, end_at")
    .eq("user_id", userId)
    .gte("end_at", now.toISOString())
    .lte("start_at", endOfDay.toISOString())
    .order("end_at", { ascending: false })
    .limit(1);

  if (!events || events.length === 0) return null;
  const last = events[0];
  if (!last.end_at) return null;
  return new Date(last.end_at);
}

// ─────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(d: Date): string {
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  if (sameDay) return `today ${formatTime(d)}`;
  if (isTomorrow) return `tomorrow ${formatTime(d)}`;
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${formatTime(d)}`;
}

function nextWeekdayAt(now: Date, _anyDay: boolean, hour: number): Date {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  return d;
}
