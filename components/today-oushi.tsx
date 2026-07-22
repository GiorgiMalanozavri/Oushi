"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Mail,
  Handshake,
  Calendar,
  AlertCircle,
  Plus,
  ArrowRight,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { SkeletonList, EmptyState, ErrorPanel } from "@/components/feedback";
import { useToast } from "@/components/toast";

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

const ICON_TINT: Record<TodayItem["icon"], { bg: string; fg: string }> = {
  meeting: { bg: "#D0E1F0", fg: "#3D6A95" },
  deadline: { bg: "#F5E8E0", fg: "#B86B4A" },
  mail: { bg: "#D0E1F0", fg: "#3D6A95" },
  handshake: { bg: "#E8EFE5", fg: "#6B8E68" },
  calendar: { bg: "#D0E1F0", fg: "#3D6A95" },
};

const SUGGESTIONS = [
  "what's waiting on me?",
  "any bills due soon?",
  "summarize this week",
  "who haven't I replied to?",
];

interface Props {
  onOpenSpotlight: (initialPrompt?: string) => void;
  onOpenEmail: (emailId: string) => void;
  onOpenCommitments: () => void;
}

export function TodayOushi({ onOpenSpotlight, onOpenEmail, onOpenCommitments }: Props) {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    return () => { cancelled = true; };
  }, []);

  const handleItemClick = (item: TodayItem) => {
    if (item.email_id) onOpenEmail(item.email_id);
    else if (item.commitment_id) onOpenCommitments();
  };

  return (
    <div className="min-h-full w-full px-5 sm:px-8 py-10 sm:py-16">
      <div className="max-w-[640px] mx-auto">
        {/* Greeting */}
        <div className="mb-10 sm:mb-12">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-[-0.015em] text-[#2A2520] leading-[1.15]">
              {data?.greeting || "Hello."}
            </h1>
            <p className="mt-2 text-[15px] sm:text-[16px] text-[#766E63] leading-relaxed">
              {data?.summary || (loading ? "Reading your day…" : "Your day is clear.")}
            </p>
          </motion.div>
        </div>

        {/* Hero card — loading / error / items / empty */}
        <div className="mb-8">
          <AnimatePresence mode="wait">
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <SkeletonList count={3} />
              </motion.div>
            )}

            {!loading && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <ErrorPanel
                  title="Couldn't load your day."
                  detail={error}
                  onRetry={load}
                />
              </motion.div>
            )}

            {!loading && !error && data && data.items.length > 0 && (
              <motion.div
                key="items"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="rounded-2xl bg-[#FFFCF3] border border-[#E6DCC4]/80 shadow-[0_1px_3px_rgba(42,37,32,0.04)] overflow-hidden">
                  {data.items.map((item, i) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      isLast={i === data.items.length - 1}
                      onClick={() => handleItemClick(item)}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {!loading && !error && data && data.items.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <EmptyState
                  icon={Inbox}
                  tone="sage"
                  title="Nothing pressing."
                  body="Oushi is watching the inbox. I'll ping you if something needs you."
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat input — primary affordance, opens Spotlight */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <button
            onClick={() => onOpenSpotlight()}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#FFFCF3] border border-[#E6DCC4]/80 hover:border-[#5E8FBF]/40 hover:shadow-[0_4px_16px_rgba(94,143,191,0.08)] transition-all text-left group"
          >
            <Sparkles className="w-4 h-4 text-[#5E8FBF] shrink-0" />
            <span className="flex-1 text-[14px] text-[#A89F92] group-hover:text-[#766E63] transition-colors">
              Ask Oushi anything…
            </span>
            <kbd className="text-[10.5px] font-mono text-[#A89F92] bg-[#FAF6EB] rounded px-1.5 py-0.5 border border-[#E6DCC4]">
              ⌘K
            </kbd>
          </button>

          {/* Suggested questions */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onOpenSpotlight(s)}
                className="px-2.5 py-1 rounded-full bg-[#FFFCF3]/60 border border-[#E6DCC4]/60 text-[11.5px] text-[#766E63] hover:bg-white hover:border-[#5E8FBF]/40 hover:text-[#3D6A95] transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Sources + quietly handled */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 sm:mt-20 pt-6 border-t border-[#E6DCC4]/60"
        >
          {data && hasAnyQuietStat(data.quietly_handled) && (
            <div className="mb-5">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-1.5">
                Quietly handled today
              </p>
              <p className="text-[12.5px] text-[#766E63] leading-relaxed">
                {formatQuietStats(data.quietly_handled)}
              </p>
            </div>
          )}

          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2.5">
              Sources
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <SourceChip label="Gmail" connected={data?.sources.gmail ?? false} />
              <SourceChip label="Google Calendar" connected={data?.sources.calendar ?? false} />
              <SourceChip label="Notifications" connected={data?.sources.push_enabled ?? false} />
              <ComingSoonChip label="Slack" />
              <ComingSoonChip label="Linear" />
              <ComingSoonChip label="Notion" />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  isLast,
  onClick,
}: {
  item: TodayItem;
  isLast: boolean;
  onClick: () => void;
}) {
  const Icon = ICON_MAP[item.icon];
  const tint = ICON_TINT[item.icon];
  const isUrgent = item.urgency >= 85;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-4 flex items-start gap-4 transition-colors hover:bg-[#FAF6EB]/50 ${
        isLast ? "" : "border-b border-[#E6DCC4]/50"
      }`}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: tint.bg }}
      >
        <Icon className="w-4 h-4" style={{ color: tint.fg }} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3 mb-0.5">
          <p className="text-[14px] font-semibold text-[#2A2520] truncate">
            {item.title}
          </p>
          {item.time_label && (
            <p
              className={`shrink-0 text-[11.5px] font-mono tabular-nums ${
                isUrgent ? "text-[#B86B4A] font-semibold" : "text-[#A89F92]"
              }`}
            >
              {item.time_label}
            </p>
          )}
        </div>
        {item.subtitle && (
          <p className="text-[12.5px] text-[#766E63] truncate">{item.subtitle}</p>
        )}
        {item.detail && (
          <p className="text-[12px] text-[#A89F92] mt-1 line-clamp-2 leading-relaxed">
            {item.detail}
          </p>
        )}
      </div>

      <ArrowRight className="w-3.5 h-3.5 text-[#D6CDB8] shrink-0 mt-3" />
    </button>
  );
}

function SourceChip({ label, connected }: { label: string; connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] ${
        connected
          ? "border-[#6B8E68]/30 bg-[#E8EFE5]/40 text-[#4F6B4D]"
          : "border-[#E6DCC4] bg-[#FFFCF3] text-[#A89F92]"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          connected ? "bg-[#6B8E68]" : "bg-[#D6CDB8]"
        }`}
      />
      {label}
    </span>
  );
}

function ComingSoonChip({ label }: { label: string }) {
  return (
    <ComingSoonChipInteractive label={label} />
  );
}

function ComingSoonChipInteractive({ label }: { label: string }) {
  const toast = useToast();
  return (
    <button
      onClick={() =>
        toast.info(`${label} coming soon`, {
          detail: "I'll let you know the moment it lands. Promise.",
        })
      }
      title={`${label} integration, coming soon`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-[#E6DCC4] bg-[#FFFCF3]/40 text-[11.5px] text-[#A89F92] hover:text-[#3D6A95] hover:border-[#5E8FBF]/40 transition-all"
    >
      <Plus className="w-2.5 h-2.5" strokeWidth={2.5} />
      {label}
    </button>
  );
}

function hasAnyQuietStat(s: TodayResponse["quietly_handled"]): boolean {
  return s.muted_today + s.auto_fulfilled_today + s.nudges_sent_today > 0;
}

function formatQuietStats(s: TodayResponse["quietly_handled"]): string {
  const parts: string[] = [];
  if (s.muted_today > 0) parts.push(`${s.muted_today} sender${s.muted_today === 1 ? "" : "s"} muted`);
  if (s.auto_fulfilled_today > 0) parts.push(`${s.auto_fulfilled_today} promise${s.auto_fulfilled_today === 1 ? "" : "s"} auto-closed`);
  if (s.nudges_sent_today > 0) parts.push(`${s.nudges_sent_today} nudge${s.nudges_sent_today === 1 ? "" : "s"} sent`);
  return parts.join(" · ");
}

