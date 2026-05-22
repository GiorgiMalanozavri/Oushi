"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Sparkles,
  Infinity as InfinityIcon,
  Mail,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/toast";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Where in the app the user opened the modal from — gets recorded with
   * the upgrade request so we can see which paywalls/CTAs actually
   * convert (e.g., "ask-quota", "settings-plan", "auto-draft-toggle",
   * "pricing-page").
   */
  source?: string;
  /**
   * Optional headline override. Defaults to "Unlock everything in Oushi"
   * but a paywall in a specific flow can be more specific, e.g.
   * "Ran out of Ask Oushi for today?".
   */
  headline?: string;
  /** Optional supporting line under the headline. */
  subhead?: string;
}

/**
 * Upgrade modal. Two-column Free vs Pro comparison, optional textarea
 * for "what would make this worth it for you", and a single CTA that
 * fires POST /api/upgrade-request. During the beta there's no Stripe —
 * we manually flip subscription_tier='pro' once the team sees the
 * request notification email.
 *
 * Used anywhere a free user might hit a wall: the pricing page CTA, the
 * Ask Oushi quota cap, the Pro-locked toggles in Settings, etc.
 */
export function UpgradeModal({
  open,
  onClose,
  source = "modal",
  headline = "Unlock everything in Oushi",
  subhead = "Pro removes every cap and turns on auto-draft. We're still pre-Stripe — request access and we'll flip it on within a few hours.",
}: UpgradeModalProps) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Reset state every time the modal closes so the next opener starts
  // clean (otherwise the previous "Request sent" screen sticks around).
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setReason("");
        setSubmitted(false);
        setSubmitting(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape — standard modal behavior, less surprising than
  // forcing a click on the X.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/upgrade-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Couldn't send your request");
      }
      setSubmitted(true);
      toast.success("Request sent — we'll be in touch shortly", {
        detail: "Usually within a few hours during beta.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2A2520]/30 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#E6DCC4] bg-[#FFFCF3] shadow-[0_32px_80px_-24px_rgba(106,76,38,0.35)]"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-[#766E63] hover:bg-[#FAF6EB] hover:text-[#2A2520] transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {submitted ? (
              <SubmittedView onClose={onClose} />
            ) : (
              <>
                {/* Header */}
                <div className="px-6 sm:px-8 pt-7 sm:pt-9 pb-5 border-b border-[#E6DCC4]/60">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#D0E1F0]/50 border border-[#5E8FBF]/20 px-2.5 py-0.5 mb-3">
                    <Sparkles className="w-3 h-3 text-[#3D6A95]" />
                    <span className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-[#3D6A95]">
                      Oushi Pro
                    </span>
                  </div>
                  <h2
                    className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-[#2A2520] leading-[1.18]"
                    style={{
                      fontFamily: "var(--font-source-serif), Georgia, serif",
                    }}
                  >
                    {headline}
                  </h2>
                  <p className="mt-2 text-[13.5px] leading-[1.55] text-[#766E63] max-w-[520px]">
                    {subhead}
                  </p>
                </div>

                {/* Comparison */}
                <div className="px-6 sm:px-8 pt-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <PlanColumn
                    label="Free"
                    price="$0"
                    priceNote="forever"
                    items={[
                      { label: "20 Ask Oushi messages / day" },
                      { label: "3 topic boards" },
                      { label: "10 sender rules" },
                      { label: "Daily briefing email" },
                      { label: "Smart labels + snooze" },
                      { label: "Manual drafts in your voice" },
                    ]}
                    tone="muted"
                  />
                  <PlanColumn
                    label="Pro"
                    price="$15"
                    priceNote="/ month"
                    items={[
                      { label: "Unlimited Ask Oushi", emphasis: true },
                      { label: "Unlimited topic boards" },
                      { label: "Unlimited sender rules" },
                      { label: "Everything in Free, +" },
                      { label: "Auto-drafted replies (the killer feature)", emphasis: true },
                      { label: "Priority support from the founder" },
                    ]}
                    tone="accent"
                  />
                </div>

                {/* Optional reason */}
                <div className="px-6 sm:px-8 pb-1">
                  <label
                    htmlFor="upgrade-reason"
                    className="block text-[11.5px] font-mono uppercase tracking-[0.14em] text-[#A89F92] mb-2"
                  >
                    Anything we should know? <span className="text-[#A89F92]/70 normal-case font-sans tracking-normal">(optional)</span>
                  </label>
                  <textarea
                    id="upgrade-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="What would make Pro worth it for you?"
                    rows={2}
                    maxLength={1000}
                    className="w-full rounded-lg border border-[#E6DCC4] bg-[#FAF6EB]/40 px-3.5 py-2.5 text-[13.5px] leading-[1.5] text-[#2A2520] placeholder:text-[#A89F92] focus:border-[#5E8FBF]/50 focus:outline-none focus:ring-2 focus:ring-[#5E8FBF]/15 transition-colors resize-none"
                  />
                </div>

                {/* Footer / CTA */}
                <div className="px-6 sm:px-8 py-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:justify-between bg-[#FAF6EB]/30 border-t border-[#E6DCC4]/60 rounded-b-2xl">
                  <p className="text-[12px] text-[#766E63] leading-snug">
                    No card needed yet. Beta is invite-flip while we wire Stripe.
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5E8FBF] px-5 py-2.5 text-[13.5px] font-medium text-white shadow-sm hover:bg-[#4A7AAB] hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Request Pro access
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PlanColumn({
  label,
  price,
  priceNote,
  items,
  tone,
}: {
  label: string;
  price: string;
  priceNote: string;
  items: Array<{ label: string; emphasis?: boolean }>;
  tone: "muted" | "accent";
}) {
  const isAccent = tone === "accent";
  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 ${
        isAccent
          ? "border-[#5E8FBF]/30 bg-gradient-to-b from-[#D0E1F0]/30 to-[#FFFCF3]"
          : "border-[#E6DCC4] bg-[#FFFCF3]"
      }`}
    >
      <div className="flex items-baseline justify-between mb-3">
        <span
          className={`text-[12px] font-mono uppercase tracking-[0.16em] ${
            isAccent ? "text-[#3D6A95]" : "text-[#A89F92]"
          }`}
        >
          {label}
        </span>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-[20px] font-semibold tracking-tight ${
              isAccent ? "text-[#2A2520]" : "text-[#766E63]"
            }`}
            style={{
              fontFamily: "var(--font-source-serif), Georgia, serif",
            }}
          >
            {price}
          </span>
          <span className="text-[11.5px] text-[#A89F92]">{priceNote}</span>
        </div>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-start gap-2 text-[13px] leading-[1.45]"
          >
            <span
              className={`mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${
                isAccent ? "bg-[#5E8FBF]/15" : "bg-[#E6DCC4]/60"
              }`}
            >
              {item.label.toLowerCase().includes("unlimited") ? (
                <InfinityIcon
                  className={`h-2.5 w-2.5 ${
                    isAccent ? "text-[#3D6A95]" : "text-[#766E63]"
                  }`}
                  strokeWidth={2.5}
                />
              ) : (
                <Check
                  className={`h-2.5 w-2.5 ${
                    isAccent ? "text-[#3D6A95]" : "text-[#766E63]"
                  }`}
                  strokeWidth={3}
                />
              )}
            </span>
            <span
              className={`${
                item.emphasis
                  ? "font-medium text-[#2A2520]"
                  : isAccent
                  ? "text-[#2A2520]"
                  : "text-[#766E63]"
              }`}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubmittedView({ onClose }: { onClose: () => void }) {
  return (
    <div className="px-6 sm:px-8 py-12 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-[#E8EFE5] flex items-center justify-center mb-5">
        <Mail className="w-6 h-6 text-[#6B8E68]" strokeWidth={2.2} />
      </div>
      <h2
        className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-[#2A2520] leading-[1.2]"
        style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
      >
        We&rsquo;ll be in touch.
      </h2>
      <p className="mt-3 text-[14px] text-[#766E63] leading-relaxed max-w-md mx-auto">
        Your request landed with the team. During the beta we flip Pro on
        manually — usually within a few hours. You&rsquo;ll get an email at
        the address on your Oushi account.
      </p>
      <button
        onClick={onClose}
        className="mt-7 inline-flex items-center justify-center rounded-lg bg-[#FAF6EB] border border-[#E6DCC4] px-5 py-2 text-[13px] font-medium text-[#2A2520] hover:bg-[#F0E9D6] transition-colors"
      >
        Got it
      </button>
    </div>
  );
}
