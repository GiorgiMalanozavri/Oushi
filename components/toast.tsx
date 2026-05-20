"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, AlertCircle, Sparkles, X, Undo2 } from "lucide-react";

/**
 * Lightweight toast system. Any client component can call useToast() and
 * fire toast.success("Promise marked done") / toast.error("Send failed") /
 * toast.info("Sync complete").
 *
 * Stacks bottom-right, auto-dismisses after 3.5s (or 6s if there's an
 * undo button). Pause-on-hover. Brand-matched.
 */

type ToastTone = "success" | "error" | "info";

interface ToastOptions {
  /** Time before auto-dismiss in ms. Default 3500, or 6000 if onUndo is set. */
  duration?: number;
  /** Optional undo handler — adds an "Undo" button to the toast. */
  onUndo?: () => void;
  /** Optional secondary detail line. */
  detail?: string;
}

interface ToastEntry {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
  onUndo?: () => void;
}

interface ToastApi {
  success: (msg: string, opts?: ToastOptions) => number;
  error: (msg: string, opts?: ToastOptions) => number;
  info: (msg: string, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Useful debug — if a component fires toast without a provider, we
    // log instead of crashing the page.
    return {
      success: (msg) => {
        console.warn("[toast] (no provider mounted)", msg);
        return 0;
      },
      error: (msg) => {
        console.warn("[toast] (no provider mounted)", msg);
        return 0;
      },
      info: (msg) => {
        console.warn("[toast] (no provider mounted)", msg);
        return 0;
      },
      dismiss: () => {},
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, opts?: ToastOptions) => {
      const id = Date.now() + Math.random();
      const entry: ToastEntry = {
        id,
        tone,
        message,
        detail: opts?.detail,
        onUndo: opts?.onUndo,
      };
      setToasts((prev) => [...prev, entry]);
      const duration = opts?.duration ?? (opts?.onUndo ? 6000 : 3500);
      window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const api: ToastApi = {
    success: (msg, opts) => push("success", msg, opts),
    error: (msg, opts) => push("error", msg, opts),
    info: (msg, opts) => push("info", msg, opts),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-32px)]">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <Toast key={t.id} entry={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

const TONE_STYLES: Record<
  ToastTone,
  { bg: string; border: string; iconBg: string; iconFg: string }
> = {
  success: {
    bg: "bg-[#FFFCF3]",
    border: "border-[#6B8E68]/30",
    iconBg: "bg-[#E8EFE5]",
    iconFg: "text-[#6B8E68]",
  },
  error: {
    bg: "bg-[#FFFCF3]",
    border: "border-[#B86B4A]/30",
    iconBg: "bg-[#F5E8E0]",
    iconFg: "text-[#B86B4A]",
  },
  info: {
    bg: "bg-[#FFFCF3]",
    border: "border-[#5E8FBF]/30",
    iconBg: "bg-[#D0E1F0]",
    iconFg: "text-[#3D6A95]",
  },
};

function Toast({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: () => void;
}) {
  const styles = TONE_STYLES[entry.tone];
  const Icon = entry.tone === "success" ? Check : entry.tone === "error" ? AlertCircle : Sparkles;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={`pointer-events-auto flex items-start gap-3 px-3.5 py-3 rounded-xl border ${styles.bg} ${styles.border} shadow-[0_8px_24px_-6px_rgba(42,37,32,0.12)] min-w-[280px] max-w-[380px]`}
    >
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${styles.iconBg}`}
      >
        <Icon className={`w-3.5 h-3.5 ${styles.iconFg}`} strokeWidth={entry.tone === "success" ? 3 : 2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#2A2520] leading-snug">
          {entry.message}
        </p>
        {entry.detail && (
          <p className="text-[11.5px] text-[#766E63] mt-0.5 leading-relaxed">
            {entry.detail}
          </p>
        )}
      </div>
      {entry.onUndo && (
        <button
          onClick={() => {
            entry.onUndo?.();
            onDismiss();
          }}
          className="shrink-0 inline-flex items-center gap-1 text-[11.5px] font-medium text-[#3D6A95] hover:text-[#2A2520] px-2 py-0.5 rounded transition-colors"
        >
          <Undo2 className="w-3 h-3" />
          Undo
        </button>
      )}
      <button
        onClick={onDismiss}
        className="shrink-0 text-[#A89F92] hover:text-[#2A2520] p-0.5 rounded transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}
