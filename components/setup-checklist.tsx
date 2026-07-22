"use client";

/**
 * Setup checklist — surfaced on the Today view for new users who
 * haven't yet enabled the major Oushi features (labels, push, voice).
 *
 * Each row links to the relevant Settings section. The checklist
 * auto-hides once all three items are done OR the user dismisses it.
 *
 * Inferred state — we don't track per-item progress columns. Instead:
 *   Labels:  user_sync_state.gmail_labels_enabled
 *   Push:    any push_subscriptions row for the user
 *   Voice:   user_profile.voice_profile is non-null
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Tag,
  Bell,
  Sparkles,
  X,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface SetupState {
  labels_enabled: boolean;
  push_enabled: boolean;
  voice_trained: boolean;
  dismissed: boolean;
}

export function SetupChecklist() {
  const [state, setState] = useState<SetupState | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/setup-state");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setState(data);
      } catch {
        // Best-effort — just don't render if we can't fetch
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const allDone =
    state.labels_enabled && state.push_enabled && state.voice_trained;

  // Don't render when there's nothing to nudge about
  if (state.dismissed || allDone) return null;

  const dismiss = async () => {
    setDismissing(true);
    try {
      await fetch("/api/setup-state", { method: "POST" });
      setState({ ...state, dismissed: true });
    } catch {
      // ignore
    } finally {
      setDismissing(false);
    }
  };

  const items: Array<{
    key: "labels" | "push" | "voice";
    icon: React.ReactNode;
    title: string;
    description: string;
    href: string;
    done: boolean;
  }> = [
    {
      key: "labels",
      icon: <Tag className="w-3.5 h-3.5" />,
      title: "Auto-label your Gmail",
      description:
        "Oushi labels every email, Respond, Awaiting, Receipt, Marketing, directly in your Gmail sidebar.",
      href: "/settings?section=labels",
      done: state.labels_enabled,
    },
    {
      key: "voice",
      icon: <Sparkles className="w-3.5 h-3.5" />,
      title: "Teach Oushi how you write",
      description:
        "Reads your sent folder so AI-drafted replies actually sound like you, not a robot.",
      href: "/settings?section=voice",
      done: state.voice_trained,
    },
    {
      key: "push",
      icon: <Bell className="w-3.5 h-3.5" />,
      title: "Get nudges before you forget",
      description:
        "Push notifications when something urgent arrives or a promise is overdue.",
      href: "/settings?section=notifications",
      done: state.push_enabled,
    },
  ];

  const remaining = items.filter((i) => !i.done).length;
  const total = items.length;

  return (
    <AnimatePresence>
      <motion.div
        key="setup-checklist"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-2xl border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] overflow-hidden"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 28px -12px rgba(106,76,38,0.14), 0 1px 3px rgba(106,76,38,0.04)",
        }}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-[#A89F92] mb-1">
              {remaining} of {total} left
            </p>
            <h3
              className="text-[18px] tracking-[-0.01em] text-[#2A2520] dark:text-[#FBF4DF] leading-snug"
              style={{
                fontFamily: "var(--font-source-serif), Georgia, serif",
              }}
            >
              Get the most out of Oushi
            </h3>
            <p className="text-[12.5px] text-[#766E63] dark:text-[#A89F92] mt-1 leading-relaxed">
              Three things take 60 seconds each. You can do them all now, one
              at a time, or skip for later.
            </p>
          </div>
          <button
            onClick={dismiss}
            disabled={dismissing}
            title="Skip, won't ask again"
            className="text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] dark:hover:text-[#FBF4DF] p-1 rounded-md hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] dark:hover:bg-[#2E2820] transition-colors disabled:opacity-50"
          >
            {dismissing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Items */}
        <div className="divide-y divide-[#E6DCC4]/60 dark:divide-[#3A3127]/60 border-t border-[#E6DCC4]/60 dark:border-[#3A3127]/60 dark:border-[#3A3127]/60">
          {items.map((item) => (
            <ChecklistItem key={item.key} item={item} />
          ))}
        </div>

        {/* Footer — "skip for now" */}
        <div className="px-5 py-3 border-t border-[#E6DCC4]/60 dark:border-[#3A3127]/60 dark:border-[#3A3127]/60 flex items-center justify-between">
          <p className="text-[11px] text-[#A89F92]">
            Each item links to the right Settings section.
          </p>
          <button
            onClick={dismiss}
            disabled={dismissing}
            className="text-[11.5px] text-[#766E63] dark:text-[#A89F92] hover:text-[#B86B4A] dark:hover:text-[#D9956E] transition-colors disabled:opacity-50"
          >
            Hide checklist
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ChecklistItem({
  item,
}: {
  item: {
    key: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    href: string;
    done: boolean;
  };
}) {
  return (
    <Link
      href={item.href}
      className="group flex items-start gap-3 px-5 py-3.5 hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520]/50 dark:hover:bg-[#2E2820]/40 transition-colors"
    >
      {/* Status circle — checked when done */}
      <div
        className={`shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
          item.done
            ? "bg-[#6B8E68] text-white"
            : "border-[1.5px] border-[#D6CDB8] dark:border-[#4A3F33] text-transparent group-hover:border-[#B86B4A]"
        }`}
      >
        {item.done ? (
          <Check className="w-3 h-3" strokeWidth={3} />
        ) : (
          <span className="opacity-0 group-hover:opacity-100 text-[#B86B4A]">
            <ArrowRight className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Icon */}
      <div
        className={`shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
          item.done
            ? "bg-[#E8EFE5] text-[#6B8E68]"
            : "bg-[#FAF6EB] dark:bg-[#2A2520] dark:bg-[#2E2820] text-[#B86B4A] group-hover:bg-[#F5E8E0] dark:group-hover:bg-[#3A2F23]"
        }`}
      >
        {item.icon}
      </div>

      {/* Title + description */}
      <div className="min-w-0 flex-1">
        <p
          className={`text-[13.5px] leading-tight transition-colors ${
            item.done
              ? "text-[#A89F92] line-through"
              : "text-[#2A2520] dark:text-[#FBF4DF] font-medium group-hover:text-[#B86B4A] dark:group-hover:text-[#D9956E]"
          }`}
        >
          {item.title}
        </p>
        <p className="text-[11.5px] text-[#766E63] dark:text-[#A89F92] mt-0.5 leading-snug">
          {item.description}
        </p>
      </div>

      {/* Right-side chevron / status text */}
      <div className="shrink-0 self-center text-[11px] text-[#A89F92] group-hover:text-[#B86B4A] transition-colors">
        {item.done ? (
          <span className="text-[#6B8E68]">Done</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            Set up
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </Link>
  );
}
