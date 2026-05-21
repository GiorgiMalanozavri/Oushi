"use client";

/**
 * NarrativeToday — Direction A from the design audit.
 *
 * A morning brief, not an inbox list. Oushi writes you a few sentences
 * about what matters today, with email cards woven in as evidence.
 *
 * Visual language:
 *   - Source Serif headers + sans body. Editorial, manuscript-like.
 *   - Warm cream radial gradient for depth instead of flat #FAF6EB.
 *   - Cards with soft sienna-tinted shadow + 1px inner highlight (Claude-style).
 *   - Spring-physics motion on appear / hover / expand.
 *   - Inline action pills — no modal context-switch for the obvious moves.
 *   - "Quietly handled" footer expands to show the rest of the day's email.
 */

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Mail,
  Calendar,
  AlertCircle,
  Handshake,
  ChevronDown,
  ArrowUpRight,
  Clock,
  Archive,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/toast";
import { SetupChecklist } from "@/components/setup-checklist";

interface TodayItem {
  id: string;
  type: "meeting" | "commitment" | "email";
  urgency: number;
  title: string;
  subtitle: string | null;
  detail: string | null;
  time_label: string | null;
  email_id: string | null;
  commitment_id: string | null;
  calendar_event_id: string | null;
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
}

const ICON_MAP: Record<TodayItem["icon"], LucideIcon> = {
  meeting: Calendar,
  deadline: AlertCircle,
  mail: Mail,
  handshake: Handshake,
  calendar: Calendar,
};

// Tint pairs intentionally rebalanced toward warmer Claude-like hues —
// less corporate blue, more sienna and ink.
const ICON_TINT: Record<TodayItem["icon"], { bg: string; fg: string }> = {
  meeting: { bg: "#E8DDC9", fg: "#7A5A36" },
  deadline: { bg: "#F2DDD0", fg: "#B86B4A" },
  mail: { bg: "#E1D8C2", fg: "#5C5042" },
  handshake: { bg: "#DEE6D8", fg: "#5C7257" },
  calendar: { bg: "#E8DDC9", fg: "#7A5A36" },
};

interface Props {
  onOpenSpotlight: (initialPrompt?: string) => void;
  onOpenEmail: (emailId: string) => void;
  onOpenCommitments: () => void;
  onDismissEmail?: (emailId: string) => void;
  /** Optional small switch chip that flips back to the classic cards view */
  rightAdornment?: React.ReactNode;
}

// Time-aware greeting fallback. The server provides one too, but if it's
// missing we want something on screen instantly.
function timeGreeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Up late.";
  if (h < 12) return "Good morning.";
  if (h < 17) return "Good afternoon.";
  if (h < 22) return "Good evening.";
  return "Late night.";
}

// The narrative connector phrases that go ABOVE each card. Position-aware
// so a 3-item day reads naturally; a 1-item day skips the connectors.
function connectorFor(index: number, total: number): string | null {
  if (total <= 1) return null;
  if (index === 0) return "First, and most pressing.";
  if (index === total - 1) return "And one more.";
  if (index === 1) return "Then this.";
  return "Also waiting.";
}

// Open-line that picks the right narrative based on what's on the plate.
function leadParagraph(count: number): string {
  if (count === 0) {
    return "Your inbox is calm. Nothing pressing right now — Oushi is watching, and will surface anything that needs you the moment it arrives.";
  }
  if (count === 1) {
    return "One thing is waiting on you today.";
  }
  if (count === 2) {
    return "Two things to tend to today.";
  }
  if (count === 3) {
    return "Three things matter today.";
  }
  if (count <= 5) {
    return `Here's what's calling your attention — ${count} threads worth a look.`;
  }
  return `${count} threads worth a look. The rest are quietly handled.`;
}

export function NarrativeToday({
  onOpenSpotlight,
  onOpenEmail,
  onOpenCommitments,
  onDismissEmail,
  rightAdornment,
}: Props) {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedHandled, setExpandedHandled] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const toast = useToast();

  // Refresh the minute display every 30s so "5:47 AM" doesn't go stale
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/today");
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || `Couldn't load your day (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/today");
        if (!res.ok) {
          if (!cancelled) {
            const j = await res.json().catch(() => null);
            setError(j?.error || `Couldn't load your day (HTTP ${res.status})`);
          }
          return;
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dateLine = useMemo(
    () =>
      now.toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [now]
  );

  const greeting = data?.greeting || timeGreeting(now);
  const items = data?.items ?? [];
  const quietHandledCount =
    (data?.quietly_handled?.muted_today ?? 0) +
    (data?.quietly_handled?.auto_fulfilled_today ?? 0) +
    (data?.quietly_handled?.nudges_sent_today ?? 0);

  return (
    <div
      className="min-h-full w-full relative narrative-bg"
      // Background lives in a CSS class so dark mode can override it without
      // overriding the whole inline style. See globals.css → .narrative-bg.
    >
      <div className="px-5 sm:px-8 py-12 sm:py-20 max-w-[720px] mx-auto">
        {/* Top meta line — date stamp on left, view-mode toggle on right.
            Lives inside the content column so it doesn't fight with the
            global ⌘K / ? chrome in the top-right of the viewport. */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-between gap-3 mb-3"
        >
          <p className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-[#A89F92]">
            {dateLine}
          </p>
          {rightAdornment && <div>{rightAdornment}</div>}
        </motion.div>

        {/* Serif greeting */}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="font-serif text-[40px] sm:text-[48px] leading-[1.05] tracking-[-0.018em] text-[#2A2520]"
          style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
        >
          {greeting}
        </motion.h1>

        {/* Lead paragraph — narrative */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="font-serif text-[19px] sm:text-[20px] leading-[1.55] text-[#3F362C] mt-5"
          style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
        >
          {loading ? "Reading your inbox…" : leadParagraph(items.length)}
        </motion.p>

        {data?.summary && !loading && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-[14px] text-[#766E63] mt-3 leading-relaxed"
          >
            {data.summary}
          </motion.p>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="mt-10 rounded-xl border border-[#B86B4A]/30 bg-[#F5E8E0]/40 px-5 py-4">
            <p className="text-[13px] font-medium text-[#B86B4A] mb-1">
              Couldn&apos;t load your day.
            </p>
            <p className="text-[12px] text-[#A66556] mb-3">{error}</p>
            <button
              onClick={load}
              className="text-[12px] font-medium text-[#B86B4A] underline-offset-2 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading skeleton — keeps narrative shape */}
        {loading && (
          <div className="mt-12 space-y-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-3xl bg-[#FFFCF3]/60 border border-[#E6DCC4]/60 p-6 animate-pulse"
                style={{
                  boxShadow: "0 1px 0 rgba(255,255,255,0.5) inset, 0 8px 32px -8px rgba(106,76,38,0.06)",
                }}
              >
                <div className="h-3 w-24 bg-[#E6DCC4]/80 rounded mb-3" />
                <div className="h-5 w-2/3 bg-[#E6DCC4]/80 rounded mb-2" />
                <div className="h-3 w-full bg-[#E6DCC4]/50 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Setup checklist — auto-hides when all done or dismissed.
            Sits BETWEEN the lead paragraph and the email cards so new
            users discover the feature gates before they get into the
            inbox triage. */}
        {!loading && (
          <div className="mt-10">
            <SetupChecklist />
          </div>
        )}

        {/* Items — interleaved with narrative connectors */}
        {!loading && !error && items.length > 0 && (
          <div className="mt-12 space-y-7">
            <AnimatePresence>
              {items.map((item, i) => {
                const connector = connectorFor(i, items.length);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.45,
                      delay: 0.18 + i * 0.07,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    {connector && (
                      <p
                        className="font-serif text-[15px] italic text-[#8A7F70] mb-2.5 ml-1"
                        style={{
                          fontFamily: "var(--font-source-serif), Georgia, serif",
                        }}
                      >
                        {connector}
                      </p>
                    )}
                    <NarrativeCard
                      item={item}
                      onOpen={() =>
                        item.email_id
                          ? onOpenEmail(item.email_id)
                          : onOpenCommitments()
                      }
                      onSnooze={() => {
                        toast.info("Snooze coming to narrative view soon", {
                          detail: "For now, open the email and snooze from inside.",
                        });
                      }}
                      onArchive={() => {
                        if (item.email_id && onDismissEmail) {
                          onDismissEmail(item.email_id);
                        }
                      }}
                      onDraft={() => {
                        if (item.email_id) onOpenEmail(item.email_id);
                      }}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Empty state — calm narrative, not a card */}
        {!loading && !error && items.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-14"
          >
            <p
              className="font-serif text-[16px] italic text-[#8A7F70] leading-relaxed"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              You can close this tab. I&apos;ll let you know.
            </p>
          </motion.div>
        )}

        {/* Ask Oushi affordance — feels more like a thought than a search */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-16 sm:mt-20"
        >
          <button
            onClick={() => onOpenSpotlight()}
            className="group w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-[#FFFCF3]/80 border border-[#E6DCC4] hover:border-[#B86B4A]/40 transition-all text-left backdrop-blur-sm"
            style={{
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 24px -8px rgba(106,76,38,0.07)",
            }}
          >
            <Sparkles className="w-4 h-4 text-[#B86B4A] shrink-0" />
            <span className="flex-1 text-[14px] text-[#8A7F70] group-hover:text-[#3F362C] transition-colors">
              Ask anything about your inbox…
            </span>
            <kbd className="text-[10.5px] font-mono text-[#A89F92] bg-[#FAF6EB] rounded px-1.5 py-0.5 border border-[#E6DCC4]">
              ⌘K
            </kbd>
          </button>
        </motion.div>

        {/* Quietly handled — expandable footer */}
        {!loading && quietHandledCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.65 }}
            className="mt-10 pt-8 border-t border-[#E6DCC4]/70"
          >
            <button
              onClick={() => setExpandedHandled((v) => !v)}
              className="group w-full flex items-center justify-between gap-3 text-left"
            >
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-[#A89F92]">
                  Quietly handled
                </p>
                <p className="font-serif text-[15px] italic text-[#766E63] mt-1">
                  {quietHandledCount} action{quietHandledCount === 1 ? "" : "s"} taken
                  on your behalf today.
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[#A89F92] transition-transform ${
                  expandedHandled ? "rotate-180" : ""
                }`}
              />
            </button>
            <AnimatePresence initial={false}>
              {expandedHandled && data && (
                <motion.div
                  key="handled-detail"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="pt-4 space-y-1.5">
                    {data.quietly_handled.muted_today > 0 && (
                      <p className="text-[13px] text-[#766E63]">
                        Muted{" "}
                        <span className="font-medium text-[#3F362C]">
                          {data.quietly_handled.muted_today}
                        </span>{" "}
                        sender
                        {data.quietly_handled.muted_today === 1 ? "" : "s"} you
                        marked as noise.
                      </p>
                    )}
                    {data.quietly_handled.auto_fulfilled_today > 0 && (
                      <p className="text-[13px] text-[#766E63]">
                        Closed{" "}
                        <span className="font-medium text-[#3F362C]">
                          {data.quietly_handled.auto_fulfilled_today}
                        </span>{" "}
                        promise
                        {data.quietly_handled.auto_fulfilled_today === 1 ? "" : "s"}{" "}
                        as you replied.
                      </p>
                    )}
                    {data.quietly_handled.nudges_sent_today > 0 && (
                      <p className="text-[13px] text-[#766E63]">
                        Sent{" "}
                        <span className="font-medium text-[#3F362C]">
                          {data.quietly_handled.nudges_sent_today}
                        </span>{" "}
                        nudge
                        {data.quietly_handled.nudges_sent_today === 1 ? "" : "s"} so
                        you wouldn&apos;t lose a thread.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Footer breath — gentle, no chrome */}
        <div className="h-24" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Card — depth, hover lift, inline action pills
// ─────────────────────────────────────────────────────────────────────────

function NarrativeCard({
  item,
  onOpen,
  onSnooze,
  onArchive,
  onDraft,
}: {
  item: TodayItem;
  onOpen: () => void;
  onSnooze: () => void;
  onArchive: () => void;
  onDraft: () => void;
}) {
  const Icon = ICON_MAP[item.icon];
  const tint = ICON_TINT[item.icon];
  const isUrgent = item.urgency >= 85;
  const [hover, setHover] = useState(false);

  return (
    <motion.div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="rounded-3xl bg-[#FFFCF3] border border-[#E6DCC4]/80 overflow-hidden cursor-pointer"
      style={{
        boxShadow: hover
          ? "0 1px 0 rgba(255,255,255,0.7) inset, 0 12px 36px -10px rgba(106,76,38,0.16), 0 2px 8px -2px rgba(106,76,38,0.06)"
          : "0 1px 0 rgba(255,255,255,0.6) inset, 0 6px 24px -10px rgba(106,76,38,0.10), 0 1px 3px rgba(106,76,38,0.04)",
        transition: "box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onClick={onOpen}
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: tint.bg }}
          >
            <Icon className="w-4 h-4" style={{ color: tint.fg }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2
                className="font-serif text-[19px] leading-[1.3] text-[#2A2520] font-semibold"
                style={{
                  fontFamily: "var(--font-source-serif), Georgia, serif",
                }}
              >
                {item.title}
              </h2>
              {item.time_label && (
                <span
                  className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-mono tabular-nums ${
                    isUrgent ? "text-[#B86B4A] font-semibold" : "text-[#A89F92]"
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {item.time_label}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className="text-[13px] text-[#766E63] mb-2">{item.subtitle}</p>
            )}
            {item.detail && (
              <p
                className="font-serif text-[15px] leading-[1.55] text-[#3F362C] line-clamp-3"
                style={{
                  fontFamily: "var(--font-source-serif), Georgia, serif",
                }}
              >
                {item.detail}
              </p>
            )}
          </div>
        </div>

        {/* Inline action row */}
        {item.email_id && (
          <div className="mt-5 flex items-center gap-1.5 -mb-1">
            <ActionPill
              icon={<Sparkles className="w-3 h-3" />}
              label="Reply with Oushi"
              tone="primary"
              onClick={(e) => {
                e.stopPropagation();
                onDraft();
              }}
            />
            <ActionPill
              icon={<Clock className="w-3 h-3" />}
              label="Snooze"
              onClick={(e) => {
                e.stopPropagation();
                onSnooze();
              }}
            />
            <ActionPill
              icon={<Archive className="w-3 h-3" />}
              label="Archive"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
            />
            <div className="ml-auto">
              <ActionPill
                icon={<ArrowUpRight className="w-3 h-3" />}
                label="Open"
                tone="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ActionPill({
  icon,
  label,
  tone = "default",
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "primary" | "ghost";
  onClick: (e: React.MouseEvent) => void;
}) {
  const styles =
    tone === "primary"
      ? "bg-[#B86B4A] text-white border-[#A65B3F] hover:bg-[#A65B3F]"
      : tone === "ghost"
        ? "bg-transparent text-[#766E63] border-transparent hover:bg-[#FAF6EB] hover:text-[#3F362C]"
        : "bg-[#FAF6EB]/80 text-[#766E63] border-[#E6DCC4] hover:bg-[#FAF6EB] hover:text-[#3F362C]";

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 24 }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[12px] font-medium transition-colors ${styles}`}
    >
      {icon}
      <span>{label}</span>
    </motion.button>
  );
}
