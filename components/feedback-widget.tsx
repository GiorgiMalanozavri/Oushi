"use client";

/**
 * Floating "Send feedback" button — always visible on every authenticated
 * page. During a 15-person beta you'll get ~5x more reports if it's one
 * click away than if it lives in a settings menu.
 *
 * Submits to /api/feedback-report which both stores the row AND emails
 * support@oushi.app so the team sees it live.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Check, Loader2 } from "lucide-react";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset transient state when reopening after a send
  useEffect(() => {
    if (open && sent) {
      // Fresh open after a successful send — reset so user can send again
      setSent(false);
      setMessage("");
      setError(null);
    }
  }, [open, sent]);

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
      // Auto-close after a beat so the user sees the confirmation
      setTimeout(() => setOpen(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(true)}
        title="Send feedback to the team"
        className="fixed bottom-5 left-5 z-40 group inline-flex items-center gap-2 rounded-full px-3.5 py-2 bg-gradient-to-br from-[#B86B4A] to-[#A65B3F] text-white text-[12px] font-medium transition-all hover:from-[#A65B3F] hover:to-[#9C523A]"
        style={{
          boxShadow:
            "0 8px 24px -8px rgba(184,107,74,0.35), 0 1px 0 rgba(255,255,255,0.15) inset",
        }}
      >
        <MessageSquare className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Send feedback</span>
      </button>

      {/* Modal */}
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
              className="fixed inset-x-4 bottom-4 sm:inset-auto sm:bottom-20 sm:left-5 z-[70] w-auto sm:w-[420px] rounded-2xl bg-[#FFFCF3] dark:bg-[#25201A] border border-[#E6DCC4] dark:border-[#3A3127] overflow-hidden"
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
                    <Check
                      className="w-5 h-5 text-[#6B8E68]"
                      strokeWidth={3}
                    />
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
    </>
  );
}
