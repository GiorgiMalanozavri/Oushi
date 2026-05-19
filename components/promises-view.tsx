"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Handshake,
  Check,
  X,
  Clock,
  AlertCircle,
  RefreshCw,
  Mail,
  Loader2,
} from "lucide-react";

export interface Commitment {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  sent_at: string;
  recipient_email: string | null;
  recipient_name: string | null;
  summary: string;
  raw_quote: string | null;
  due_phrase: string | null;
  due_at: string | null;
  urgency: "today" | "this_week" | "soon" | "vague";
  status: "open" | "fulfilled" | "dismissed" | "snoozed";
  snoozed_until: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
}

const URGENCY_STYLE: Record<
  Commitment["urgency"],
  { bg: string; fg: string; label: string }
> = {
  today: { bg: "#F5E8E0", fg: "#B86B4A", label: "Today" },
  this_week: { bg: "#FFE8D6", fg: "#A35420", label: "This week" },
  soon: { bg: "#D0E1F0", fg: "#3D6A95", label: "Soon" },
  vague: { bg: "#F0E9D6", fg: "#766E63", label: "Open" },
};

export function PromisesView() {
  const [items, setItems] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ extracted: number; scanned: number; autoFulfilled?: number } | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/commitments?status=open");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.commitments || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const scan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/commitments/scan", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setScanResult({
          extracted: data.extracted || 0,
          scanned: data.scanned || 0,
          autoFulfilled: data.autoFulfilled || 0,
        });
        await load();
      }
    } finally {
      setScanning(false);
    }
  };

  const act = async (
    id: string,
    action: "fulfill" | "dismiss" | "snooze",
    days?: number
  ) => {
    // Optimistic
    setItems((p) => p.filter((c) => c.id !== id));
    try {
      await fetch(`/api/commitments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days }),
      });
    } catch {
      // Reload on failure
      load();
    }
  };

  // Group by urgency
  const groups: Array<{ key: Commitment["urgency"]; items: Commitment[] }> = (
    [
      { key: "today", items: items.filter((c) => c.urgency === "today") },
      { key: "this_week", items: items.filter((c) => c.urgency === "this_week") },
      { key: "soon", items: items.filter((c) => c.urgency === "soon") },
      { key: "vague", items: items.filter((c) => c.urgency === "vague") },
    ] as const
  ).filter((g) => g.items.length > 0);

  return (
    <div className="px-6 sm:px-10 pt-12 pb-20 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-[#5E8FBF] mb-2">
            Promises
          </p>
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-[-0.01em] text-[#2A2520] leading-[1.1]">
            What you said you&apos;d do.
          </h1>
          <p className="mt-2 text-[14px] text-[#766E63] max-w-lg leading-relaxed">
            Pulled from your sent mail. If you said &ldquo;I&apos;ll get back to you&rdquo; — it&apos;s here until you do.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="shrink-0 mt-1.5 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#E6DCC4] bg-[#FFFCF3] hover:border-[#5E8FBF] hover:text-[#3D6A95] text-[12.5px] font-medium text-[#2A2520] transition-all disabled:opacity-60 disabled:cursor-wait"
        >
          {scanning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {scanning ? "Scanning…" : "Scan now"}
        </button>
      </div>

      {scanResult && (
        <div className="mt-5 rounded-lg border border-[#D0E1F0] bg-[#D0E1F0]/30 px-3.5 py-2 text-[12px] text-[#3D6A95]">
          Scanned {scanResult.scanned} sent emails · Found{" "}
          <span className="font-semibold">{scanResult.extracted}</span> new commitment
          {scanResult.extracted === 1 ? "" : "s"}
          {(scanResult.autoFulfilled ?? 0) > 0 && (
            <>
              {" "}· Auto-closed{" "}
              <span className="font-semibold">{scanResult.autoFulfilled}</span> follow-up
              {scanResult.autoFulfilled === 1 ? "" : "s"}
            </>
          )}
          .
        </div>
      )}

      {/* Body */}
      <div className="mt-8">
        {loading ? (
          <div className="flex items-center gap-2 text-[#A89F92] text-[13px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading…
          </div>
        ) : items.length === 0 ? (
          <EmptyState onScan={scan} hasScannedBefore={!!scanResult} scanning={scanning} />
        ) : (
          <div className="space-y-8">
            <AnimatePresence initial={false}>
              {groups.map((g) => (
                <motion.section
                  key={g.key}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <SectionHeader urgency={g.key} count={g.items.length} />
                  <ul className="mt-3 space-y-2">
                    {g.items.map((c) => (
                      <CommitmentCard key={c.id} c={c} onAction={act} />
                    ))}
                  </ul>
                </motion.section>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ urgency, count }: { urgency: Commitment["urgency"]; count: number }) {
  const style = URGENCY_STYLE[urgency];
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: style.fg }}>
        {style.label}
      </h2>
      <span className="text-[11px] text-[#A89F92] font-mono tabular-nums">
        {count}
      </span>
    </div>
  );
}

function CommitmentCard({
  c,
  onAction,
}: {
  c: Commitment;
  onAction: (id: string, action: "fulfill" | "dismiss" | "snooze", days?: number) => void;
}) {
  const [showQuote, setShowQuote] = useState(false);
  const ageDays = Math.floor((Date.now() - new Date(c.sent_at).getTime()) / (24 * 60 * 60 * 1000));
  const overdue =
    c.due_at && new Date(c.due_at) < new Date()
      ? Math.floor((Date.now() - new Date(c.due_at).getTime()) / (24 * 60 * 60 * 1000))
      : null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="group rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] hover:border-[#5E8FBF]/40 hover:shadow-sm transition-all overflow-hidden"
    >
      <div className="px-4 pt-3.5 pb-3">
        {/* Top line: summary + recipient */}
        <div className="flex items-start gap-3">
          <Handshake className="w-4 h-4 text-[#5E8FBF] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-[#2A2520] leading-snug">{c.summary}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11.5px] text-[#766E63]">
              {c.recipient_name && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3 h-3 text-[#A89F92]" />
                  {c.recipient_name}
                </span>
              )}
              <span className="font-mono tabular-nums">
                you said this {relativeDays(ageDays)}
              </span>
              {c.due_phrase && (
                <span className="font-mono">· due {c.due_phrase}</span>
              )}
              {overdue !== null && overdue > 0 && (
                <span className="inline-flex items-center gap-1 text-[#B86B4A] font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {overdue}d overdue
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quote toggle */}
        {c.raw_quote && (
          <button
            onClick={() => setShowQuote((p) => !p)}
            className="mt-2 ml-7 text-[11px] text-[#A89F92] hover:text-[#3D6A95] transition-colors"
          >
            {showQuote ? "hide quote" : "show what you wrote"}
          </button>
        )}
        {showQuote && c.raw_quote && (
          <blockquote className="mt-1.5 ml-7 pl-3 border-l-2 border-[#5E8FBF]/40 text-[12px] italic text-[#766E63] leading-relaxed">
            &ldquo;{c.raw_quote}&rdquo;
          </blockquote>
        )}

        {/* Actions */}
        <div className="mt-3 ml-7 flex flex-wrap items-center gap-1.5">
          <ActionButton
            onClick={() => onAction(c.id, "fulfill")}
            icon={<Check className="w-3 h-3" strokeWidth={3} />}
            label="Mark done"
            variant="primary"
          />
          <ActionButton
            onClick={() => onAction(c.id, "snooze", 3)}
            icon={<Clock className="w-3 h-3" />}
            label="Snooze 3d"
          />
          <ActionButton
            onClick={() => onAction(c.id, "dismiss")}
            icon={<X className="w-3 h-3" />}
            label="Not a promise"
          />
        </div>
      </div>
    </motion.li>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  variant,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  variant?: "primary";
}) {
  if (variant === "primary") {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium bg-[#6B8E68] hover:bg-[#5A7A57] text-white transition-colors"
      >
        {icon}
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium border border-[#E6DCC4] bg-white hover:border-[#5E8FBF] hover:text-[#3D6A95] text-[#766E63] transition-all"
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({
  onScan,
  hasScannedBefore,
  scanning,
}: {
  onScan: () => void;
  hasScannedBefore: boolean;
  scanning: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#E6DCC4] bg-[#FFFCF3]/50 px-6 py-12 text-center">
      <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D0E1F0] to-[#A8C5E0] items-center justify-center mb-4 shadow-sm">
        <Handshake className="w-6 h-6 text-[#3D6A95]" />
      </div>
      {hasScannedBefore ? (
        <>
          <p className="text-[15px] font-semibold text-[#2A2520] mb-1">No open promises.</p>
          <p className="text-[12.5px] text-[#766E63] max-w-sm mx-auto">
            Nothing you said you&apos;d do is sitting unfinished. Nice.
          </p>
        </>
      ) : (
        <>
          <p className="text-[15px] font-semibold text-[#2A2520] mb-1">No commitments yet.</p>
          <p className="text-[12.5px] text-[#766E63] max-w-sm mx-auto mb-4">
            Run a scan to extract promises from your last 30 days of sent mail.
            Oushi looks for things like &ldquo;I&apos;ll send by Friday&rdquo; and tracks them until you mark them done.
          </p>
          <button
            onClick={onScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-br from-[#5E8FBF] to-[#3D6A95] text-white text-[12.5px] font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-60"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {scanning ? "Scanning…" : "Scan my sent mail"}
          </button>
        </>
      )}
    </div>
  );
}

function relativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "a week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
