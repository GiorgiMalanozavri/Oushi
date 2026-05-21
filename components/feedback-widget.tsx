"use client";

/**
 * Feedback module — three exports that share one modal:
 *
 *   <FeedbackModal />          The slide-up panel with textarea + Send.
 *                              Controlled via open/onClose props.
 *
 *   <ReportBugItem />          A small inline row designed to live in the
 *                              sidebar, just above the user footer. Bug
 *                              icon + "Report bug" text. Click → opens
 *                              the modal via the global "oushi:feedback"
 *                              event.
 *
 *   <FeedbackPrompt />         A non-intrusive bottom-of-screen banner
 *                              that appears 30s after first mount AND
 *                              every 30 minutes while the dashboard stays
 *                              open. Dismissable. Tracks last-shown in
 *                              localStorage so a page refresh respects
 *                              the same cadence.
 *
 * All three communicate via a window CustomEvent ("oushi:feedback") so
 * they don't need to share React state — the sidebar, prompt, and even
 * keyboard shortcuts can all open the modal without prop drilling.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bug, X, Send, Check, Loader2, MessageSquare } from "lucide-react";

const FEEDBACK_EVENT = "oushi:feedback";
const LAST_PROMPT_KEY = "oushi.lastFeedbackPrompt";
const PROMPT_DISMISSED_AT_KEY = "oushi.feedbackPromptDismissedAt";

// 30 min between periodic prompts (the user-requested cadence). First
// prompt fires 30s after dashboard mount so you've had time to actually
// look at the product before being asked about it.
const PROMPT_INTERVAL_MS = 30 * 60 * 1000;
const FIRST_PROMPT_DELAY_MS = 30 * 1000;
// If the user explicitly dismissed a prompt, hold off for 60min so we
// don't seem pushy. Distinct from the "shown" cadence above.
const DISMISS_COOLDOWN_MS = 60 * 60 * 1000;

function dispatchOpen() {
  window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT));
}

// ─────────────────────────────────────────────────────────────────────────
// MODAL — the actual textarea + send logic
// ─────────────────────────────────────────────────────────────────────────

export function FeedbackModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for the open event from any other component
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setSent(false);
      setError(null);
    };
    window.addEventListener(FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(FEEDBACK_EVENT, onOpen);
  }, []);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async () => {
    const text = message.trim();
    if (text.length < 3) {
      setError("Tell us a bit more — even a few words helps.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't send — try again?");
        return;
      }
      setSent(true);
      setMessage("");
      setTimeout(() => setOpen(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="fb-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] bg-[#2A2520]/40 backdrop-blur-sm"
          />
          <motion.div
            key="fb-panel"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[min(420px,calc(100vw-32px))] rounded-2xl bg-[#FFFCF3] dark:bg-[#25201A] border border-[#E6DCC4] dark:border-[#3A3127] overflow-hidden"
            style={{
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 24px 60px -20px rgba(106,76,38,0.30), 0 8px 20px -8px rgba(106,76,38,0.16)",
            }}
          >
            <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-[#E6DCC4]/60 dark:border-[#3A3127]/60">
              <div>
                <p
                  className="text-[15px] tracking-[-0.01em] text-[#2A2520] dark:text-[#FBF4DF]"
                  style={{
                    fontFamily: "var(--font-source-serif), Georgia, serif",
                  }}
                >
                  Send feedback
                </p>
                <p className="text-[11.5px] text-[#A89F92] mt-0.5">
                  Goes straight to Giorgi.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] p-1 rounded-md hover:bg-[#FAF6EB] dark:hover:bg-[#2E2820] transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sent ? (
              <div className="px-5 py-8 text-center">
                <div
                  className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, #E8EFE5 0%, #DEE6D8 100%)",
                  }}
                >
                  <Check className="w-5 h-5 text-[#6B8E68]" strokeWidth={3} />
                </div>
                <p
                  className="text-[15px] text-[#2A2520] dark:text-[#FBF4DF]"
                  style={{
                    fontFamily: "var(--font-source-serif), Georgia, serif",
                  }}
                >
                  Thanks — got it.
                </p>
                <p className="text-[12px] text-[#766E63] dark:text-[#A89F92] mt-1">
                  I read every message. I&apos;ll reply if a response makes
                  sense.
                </p>
              </div>
            ) : (
              <div className="p-5">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's broken? What's confusing? What would make this 10x better?"
                  autoFocus
                  rows={5}
                  className="w-full rounded-lg border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FAF6EB]/40 dark:bg-[#1B1813]/40 px-3 py-2.5 text-[13.5px] text-[#2A2520] dark:text-[#FBF4DF] placeholder:text-[#A89F92] resize-none focus:outline-none focus:border-[#B86B4A] focus:bg-[#FFFCF3] dark:focus:bg-[#25201A] transition-colors"
                />
                {error && (
                  <p className="mt-2 text-[12px] text-[#B86B4A] dark:text-[#D9956E]">
                    {error}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[10.5px] text-[#A89F92] leading-snug max-w-[220px]">
                    Sent with the current URL and your account, nothing else.
                  </p>
                  <button
                    onClick={send}
                    disabled={sending || message.trim().length < 3}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#B86B4A] to-[#A65B3F] px-3.5 py-2 text-[12.5px] font-medium text-white hover:from-[#A65B3F] hover:to-[#9C523A] transition-all disabled:opacity-50"
                    style={{
                      boxShadow:
                        "0 4px 16px -4px rgba(184,107,74,0.30), 0 1px 0 rgba(255,255,255,0.15) inset",
                    }}
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Send
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SIDEBAR ITEM — small inline "Report bug" row above the user footer
// ─────────────────────────────────────────────────────────────────────────

export function ReportBugItem() {
  return (
    <button
      onClick={dispatchOpen}
      className="group w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[12px] text-[#766E63] dark:text-[#A89F92] hover:text-[#B86B4A] dark:hover:text-[#D9956E] hover:bg-[#FAF6EB] dark:hover:bg-[#2E2820] transition-colors"
      title="Report a bug or send feedback"
    >
      <Bug className="w-3.5 h-3.5 text-[#A89F92] group-hover:text-[#B86B4A] dark:group-hover:text-[#D9956E] transition-colors" />
      <span>Report bug</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PERIODIC PROMPT — banner that appears on mount + every 30 min
// ─────────────────────────────────────────────────────────────────────────

export function FeedbackPrompt() {
  const [visible, setVisible] = useState(false);

  // Decide whether to show the prompt based on last-shown timestamps.
  // Called on mount and then on a recurring interval.
  const maybeShow = () => {
    if (typeof window === "undefined") return;
    try {
      const dismissedRaw = window.localStorage.getItem(
        PROMPT_DISMISSED_AT_KEY
      );
      if (dismissedRaw) {
        const dismissedAt = parseInt(dismissedRaw, 10);
        if (Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
          return; // user dismissed recently, back off
        }
      }
      const lastRaw = window.localStorage.getItem(LAST_PROMPT_KEY);
      const lastAt = lastRaw ? parseInt(lastRaw, 10) : 0;
      if (Date.now() - lastAt < PROMPT_INTERVAL_MS) return;
      setVisible(true);
      window.localStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
    } catch {
      // localStorage blocked — show anyway
      setVisible(true);
    }
  };

  useEffect(() => {
    // First prompt: short delay after mount so the user gets to see
    // the product before being asked about it.
    const firstTimer = setTimeout(maybeShow, FIRST_PROMPT_DELAY_MS);
    // Recurring prompts every interval.
    const interval = setInterval(maybeShow, PROMPT_INTERVAL_MS);
    return () => {
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(PROMPT_DISMISSED_AT_KEY, String(Date.now()));
    } catch {
      // best-effort
    }
  };

  const open = () => {
    dispatchOpen();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="feedback-prompt"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-5 right-5 z-40 max-w-[340px] rounded-2xl bg-[#FFFCF3] dark:bg-[#25201A] border border-[#E6DCC4] dark:border-[#3A3127] px-4 py-3.5"
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.6) inset, 0 16px 40px -16px rgba(106,76,38,0.20), 0 4px 12px -4px rgba(106,76,38,0.10)",
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, #F2DDD0 0%, #E8DDC9 100%)",
              }}
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#B86B4A]" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-[13.5px] text-[#2A2520] dark:text-[#FBF4DF] leading-snug"
                style={{
                  fontFamily: "var(--font-source-serif), Georgia, serif",
                }}
              >
                How&apos;s Oushi going so far?
              </p>
              <p className="text-[11.5px] text-[#766E63] dark:text-[#A89F92] mt-0.5 leading-snug">
                Even a one-line reply helps a ton.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  onClick={open}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#B86B4A] to-[#A65B3F] px-2.5 py-1 text-[11.5px] font-medium text-white hover:from-[#A65B3F] hover:to-[#9C523A] transition-all"
                  style={{
                    boxShadow:
                      "0 2px 6px -2px rgba(184,107,74,0.30)",
                  }}
                >
                  Tell us
                </button>
                <button
                  onClick={dismiss}
                  className="text-[11.5px] text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] px-2 py-1 transition-colors"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] p-0.5 rounded transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
