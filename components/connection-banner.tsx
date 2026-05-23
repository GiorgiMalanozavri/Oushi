"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, RefreshCw, X } from "lucide-react";

interface ConnectionStatus {
  gmail_ok: boolean;
  invalidated_at: string | null;
  invalidation_reason: string | null;
  has_token: boolean;
  last_token_update_at: string | null;
}

/**
 * Dashboard banner that surfaces a broken Gmail connection.
 *
 * Without this, when a user's refresh token expires or gets revoked
 * (they re-installed Oushi's permission in a fresh window, said no by
 * mistake, etc) every sync silently fails. The dashboard just stops
 * updating and the user has no signal anything's wrong.
 *
 * Fetches /api/connection/status on mount. If gmail_ok is false,
 * shows a terra-toned banner with a one-click reconnect that walks
 * the user back through Google OAuth. The dismiss only hides for
 * this session — the banner reappears on next page load if the
 * connection is still bad. (We don't want users to permanently
 * dismiss a real outage.)
 */
export function ConnectionBanner() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/connection/status");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ConnectionStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // best-effort — if status is unreachable we just don't show
        // the banner. Better than showing a false alarm.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shouldShow =
    status && !status.gmail_ok && status.has_token && !dismissed;

  // Pretty "X ago" for the timestamp. Same format as elsewhere in the app.
  const sinceText = (() => {
    if (!status?.invalidated_at) return null;
    const ms = Date.now() - new Date(status.invalidated_at).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    const day = Math.floor(hr / 24);
    return `${day} day${day === 1 ? "" : "s"} ago`;
  })();

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="sticky top-0 z-40 px-4 sm:px-6 pt-3"
        >
          <div className="max-w-[720px] mx-auto rounded-xl border border-[#B86B4A]/30 bg-[#F5E8E0]/90 dark:bg-[#3A2A1F]/90 backdrop-blur-md px-4 sm:px-5 py-3 sm:py-3.5 shadow-[0_8px_24px_-8px_rgba(184,107,74,0.30)] flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B86B4A]/15">
              <AlertTriangle className="h-3.5 w-3.5 text-[#B86B4A]" strokeWidth={2.5} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold text-[#B86B4A] leading-snug">
                Gmail connection paused
              </p>
              <p className="mt-0.5 text-[12px] text-[#A35A3D] dark:text-[#D9956E] leading-snug">
                Oushi can&apos;t reach your inbox right now
                {sinceText ? ` — last failed ${sinceText}` : ""}. New emails
                aren&apos;t syncing and labels aren&apos;t updating until you
                reconnect.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href="/api/gmail/connect"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#B86B4A] hover:bg-[#A65B3F] px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reconnect
              </a>
              <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss for now"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#A35A3D] hover:bg-[#B86B4A]/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
