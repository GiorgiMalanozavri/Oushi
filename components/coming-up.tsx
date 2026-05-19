"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Users, Video, ChevronRight, MapPin } from "lucide-react";

interface CalendarEvent {
  google_event_id: string;
  summary: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean;
  hangout_link: string | null;
  attendees: Array<{ email: string; name?: string }>;
  organizer_name: string | null;
  related_email_id: string | null;
  related_email_subject: string | null;
  related_email_from_name: string | null;
  related_email_snippet: string | null;
}

/**
 * Compact "Coming up" widget for the Today view. Shows the next 1-3 events
 * with a glance-friendly summary of what email context you might owe the
 * attendees.
 */
export function ComingUp({
  onOpenEmail,
}: {
  onOpenEmail: (emailId: string) => void;
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/calendar/sync");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.events)) {
          setEvents(data.events);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Filter: next 24h, not too far in the future
  const now = Date.now();
  const horizon = now + 24 * 60 * 60 * 1000;
  const upcoming = events
    .filter((e) => {
      const start = new Date(e.start_at).getTime();
      return start >= now - 5 * 60 * 1000 && start <= horizon;
    })
    .slice(0, 3);

  if (loading || upcoming.length === 0) return null;

  return (
    <div className="mb-8">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-[#5E8FBF] mb-3">
        Coming up
      </p>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {upcoming.map((e, i) => (
            <motion.li
              key={e.google_event_id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
            >
              <EventCard event={e} onOpenEmail={onOpenEmail} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function EventCard({
  event,
  onOpenEmail,
}: {
  event: CalendarEvent;
  onOpenEmail: (emailId: string) => void;
}) {
  const start = new Date(event.start_at);
  const minsUntil = Math.round((start.getTime() - Date.now()) / 60000);

  const timeLabel = (() => {
    if (minsUntil <= 5 && minsUntil >= -5) return "Now";
    if (minsUntil < 60 && minsUntil > 0) return `In ${minsUntil} min`;
    if (minsUntil < 0) return "Started";
    // Same day?
    const isToday = isSameDay(start, new Date());
    return isToday
      ? start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : `${start.toLocaleDateString("en-US", { weekday: "short" })} ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  })();

  // Filter out the current user from the attendees display
  const others = event.attendees.filter((a) => !a.email.includes("noreply"));
  const otherCount = others.length;

  return (
    <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] hover:border-[#5E8FBF]/40 hover:shadow-sm transition-all overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Time pill */}
          <div className="shrink-0 w-[68px] text-center">
            <p
              className={`text-[11px] font-semibold ${
                minsUntil < 60 && minsUntil >= 0 ? "text-[#B86B4A]" : "text-[#5E8FBF]"
              } font-mono tabular-nums`}
            >
              {timeLabel}
            </p>
            {minsUntil >= 60 && (
              <p className="text-[10px] text-[#A89F92] mt-0.5 font-mono">
                {Math.floor(minsUntil / 60)}h {minsUntil % 60}m
              </p>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-medium text-[#2A2520] truncate">
              {event.summary || "Untitled event"}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11.5px] text-[#766E63]">
              {otherCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3 h-3 text-[#A89F92]" />
                  {otherCount === 1 ? others[0].name || others[0].email.split("@")[0] : `${otherCount} people`}
                </span>
              )}
              {event.hangout_link && (
                <a
                  href={event.hangout_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[#3D6A95] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Video className="w-3 h-3 text-[#A89F92]" />
                  Meet
                </a>
              )}
              {event.location && (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 text-[#A89F92]" />
                  {event.location.slice(0, 40)}
                </span>
              )}
            </div>

            {/* Related email — the Oushi-specific magic */}
            {event.related_email_id && event.related_email_snippet && (
              <button
                onClick={() => onOpenEmail(event.related_email_id!)}
                className="mt-2 group w-full flex items-start gap-2 rounded-md border border-[#D0E1F0]/60 bg-[#D0E1F0]/20 px-2.5 py-1.5 text-left hover:bg-[#D0E1F0]/40 transition-colors"
              >
                <Calendar className="w-3 h-3 text-[#3D6A95] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#3D6A95]">
                    Last from {event.related_email_from_name || "them"}
                  </p>
                  <p className="text-[12px] text-[#2A2520] leading-snug mt-0.5 line-clamp-2">
                    {event.related_email_snippet.slice(0, 140)}
                  </p>
                </div>
                <ChevronRight className="w-3 h-3 text-[#A89F92] mt-1 shrink-0 group-hover:text-[#3D6A95] transition-colors" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
