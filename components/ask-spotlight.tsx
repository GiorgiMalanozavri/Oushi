"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ArrowUp,
  Loader2,
  RotateCcw,
  MessageSquare,
  Trash2,
  Paperclip,
  FileText,
  Image as ImageIcon,
  X,
  AlertCircle,
  Infinity as InfinityIcon,
} from "lucide-react";
import { CardStack } from "@/components/oushi-cards/card-renderer";
import type { OushiCard } from "@/components/oushi-cards/types";
import type { CardActionContext } from "@/components/oushi-cards/card-actions";
import { LoadingDots } from "@/components/feedback";
import { UpgradeModal } from "@/components/upgrade-modal";

export interface AttachmentPreview {
  filename: string;
  mime_type: string;
  size_bytes: number;
  data_base64: string;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  cards?: OushiCard[];
  streaming?: boolean; // true while the assistant is still streaming
  attachments?: Array<{ filename: string; mime_type: string }>; // metadata only — for history rendering
  error?: boolean;
};

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
const MAX_FILE_BYTES_CLIENT = 5 * 1024 * 1024;
const MAX_FILES_CLIENT = 3;

const SUGGESTIONS = [
  "anything urgent today?",
  "what's waiting on me?",
  "what's my flight info?",
  "summarize this week",
  "who haven't I replied to?",
  "any bills due soon?",
];

export interface RecentThread {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

interface AskQuota {
  tier: "free" | "pro";
  used: number;
  /** -1 means unlimited (Pro). Otherwise the daily cap. */
  limit: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onSend: (text: string, attachments?: AttachmentPreview[]) => void;
  onClear: () => void;
  actionCtx: CardActionContext;
  recentThreads?: RecentThread[];
  onLoadThread?: (id: string) => void;
  onDeleteThread?: (id: string) => void;
}

export function AskSpotlight({
  open,
  onClose,
  messages,
  input,
  setInput,
  loading,
  onSend,
  onClear,
  actionCtx,
  recentThreads = [],
  onLoadThread,
  onDeleteThread,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [pendingFiles, setPendingFiles] = useState<AttachmentPreview[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [quota, setQuota] = useState<AskQuota | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const hasMessages = messages.length > 0;
  // Derived directly from message presence — when the user sends a question,
  // the input moves to a slim bar at the bottom and the conversation fills the body.
  const showInputAtBottom = hasMessages;

  // Pull the user's tier + today's Ask Oushi usage so we can show
  // "13 / 20 today" in the input bar. Refetch on two transitions:
  //   1. open flips false → true (spotlight just opened)
  //   2. loading flips true → false while open (assistant just finished —
  //      the /api/ask handler bumped the counter on the server)
  // Other re-runs (e.g., user just sent and loading went false→true) are
  // also fine to refetch on; the counter just hasn't moved yet.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/state");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setQuota({
          tier: data.tier === "pro" ? "pro" : "free",
          used: data.ask_quota?.used ?? 0,
          limit: data.ask_quota?.limit ?? 20,
        });
      } catch {
        // Best-effort — if billing state is unreachable we just hide
        // the pill rather than show a broken counter.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loading]);

  useEffect(() => {
    if (open) {
      // Refocus input every time the user submits or the panel opens
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open, messages.length]);

  useEffect(() => {
    if (resultsRef.current) {
      resultsRef.current.scrollTo({
        top: resultsRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages.length, loading]);

  const submit = () => {
    if ((!input.trim() && pendingFiles.length === 0) || loading) return;
    onSend(input || "(see attachment)", pendingFiles.length > 0 ? pendingFiles : undefined);
    setPendingFiles([]);
    setFileError(null);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFileError(null);

    const room = MAX_FILES_CLIENT - pendingFiles.length;
    if (room <= 0) {
      setFileError(`Max ${MAX_FILES_CLIENT} files per message.`);
      return;
    }

    const incoming = Array.from(files).slice(0, room);
    const newFiles: AttachmentPreview[] = [];

    for (const f of incoming) {
      if (!ALLOWED_MIME_TYPES.includes(f.type)) {
        setFileError(`"${f.name}" — only PDFs and images supported.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES_CLIENT) {
        setFileError(`"${f.name}" — file is over 5MB.`);
        continue;
      }
      try {
        const data_base64 = await fileToBase64(f);
        newFiles.push({
          filename: f.name,
          mime_type: f.type,
          size_bytes: f.size,
          data_base64,
        });
      } catch {
        setFileError(`"${f.name}" — couldn't read the file.`);
      }
    }

    if (newFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="spotlight-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-[#2A2520]/30 backdrop-blur-md"
          />

          {/* Spotlight */}
          <motion.div
            key="spotlight"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-[10vh] z-[61] -translate-x-1/2 w-[640px] max-w-[calc(100vw-24px)]"
          >
            <div className="rounded-2xl bg-[#FFFCF3]/95 backdrop-blur-xl border border-[#E6DCC4] shadow-[0_24px_80px_-12px_rgba(42,37,32,0.35),_0_0_0_1px_rgba(94,143,191,0.04)] overflow-hidden flex flex-col max-h-[80vh]">
              {/* Top input bar (empty state only) */}
              {!showInputAtBottom && (
                <>
                  <AttachmentPills files={pendingFiles} onRemove={removeFile} error={fileError} variant="top" />
                  <SpotlightInput
                    inputRef={inputRef}
                    input={input}
                    setInput={setInput}
                    loading={loading}
                    onSubmit={submit}
                    onEscape={onClose}
                    onAddFiles={addFiles}
                    variant="top"
                    quota={quota}
                    onUpgrade={() => setUpgradeOpen(true)}
                  />
                </>
              )}

              {/* Results / chat history */}
              <div
                ref={resultsRef}
                className={`flex-1 overflow-y-auto ${
                  hasMessages ? "" : "max-h-[420px]"
                }`}
              >
                {!hasMessages ? (
                  <EmptyState
                    onPick={(s) => onSend(s)}
                    recentThreads={recentThreads}
                    onLoadThread={onLoadThread}
                    onDeleteThread={onDeleteThread}
                  />
                ) : (
                  <div className="px-5 py-4 space-y-4">
                    {messages.map((m, i) => (
                      <Message key={i} message={m} actionCtx={actionCtx} />
                    ))}
                    {loading && messages[messages.length - 1]?.role === "user" && (
                      <LoadingBubble />
                    )}
                  </div>
                )}
              </div>

              {/* Bottom input bar (active chat) */}
              {showInputAtBottom && (
                <div className="border-t border-[#E6DCC4]/60 bg-[#FFFCF3]/80 backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2 px-3 pt-2">
                    <button
                      onClick={onClear}
                      className="inline-flex items-center gap-1.5 text-[10.5px] text-[#A89F92] hover:text-[#2A2520] px-2 py-1 rounded transition-colors"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      New chat
                    </button>
                    <div className="flex items-center gap-2.5">
                      <QuotaPill quota={quota} onUpgrade={() => setUpgradeOpen(true)} />
                      <p className="text-[10.5px] text-[#A89F92]">Enter to send · Esc to close</p>
                    </div>
                  </div>
                  <AttachmentPills files={pendingFiles} onRemove={removeFile} error={fileError} variant="bottom" />
                  <SpotlightInput
                    inputRef={inputRef}
                    input={input}
                    setInput={setInput}
                    loading={loading}
                    onSubmit={submit}
                    onEscape={onClose}
                    onAddFiles={addFiles}
                    variant="bottom"
                    quota={null}
                    onUpgrade={() => setUpgradeOpen(true)}
                  />
                </div>
              )}
            </div>
          </motion.div>
          <UpgradeModal
            open={upgradeOpen}
            onClose={() => setUpgradeOpen(false)}
            source="ask-quota"
            headline="Ran out of Ask Oushi for today?"
            subhead="Pro removes the daily cap entirely — ask as much as you want. We flip Pro on manually during beta, usually within a few hours."
          />
        </>
      )}
    </AnimatePresence>
  );
}

function SpotlightInput({
  inputRef,
  input,
  setInput,
  loading,
  onSubmit,
  onEscape,
  onAddFiles,
  variant,
  quota,
  onUpgrade,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onEscape: () => void;
  onAddFiles: (files: FileList | null) => void;
  variant: "top" | "bottom";
  quota: AskQuota | null;
  onUpgrade: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div
      className={`flex items-center gap-2.5 px-4 ${
        variant === "top" ? "py-3.5 border-b border-[#E6DCC4]/60" : "py-3"
      }`}
    >
      <Sparkles className="w-4 h-4 text-[#5E8FBF] shrink-0" />
      <textarea
        ref={inputRef}
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onEscape();
          }
        }}
        placeholder={variant === "top" ? "Ask Oushi anything — or drop a PDF…" : "Ask anything, attach files…"}
        className="flex-1 resize-none bg-transparent text-[15px] text-[#2A2520] outline-none placeholder:text-[#A89F92] leading-[1.45] py-0.5 max-h-[120px]"
      />

      {/* Paperclip — files (PDF / image) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          onAddFiles(e.target.files);
          // Reset so the same file can be picked again later
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        title="Attach a PDF or image"
        className="p-1.5 rounded-md text-[#766E63] hover:text-[#3D6A95] hover:bg-[#FAF6EB] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
      >
        <Paperclip className="w-3.5 h-3.5" />
      </button>

      {variant === "top" ? (
        <div className="flex items-center gap-2 shrink-0">
          <QuotaPill quota={quota} onUpgrade={onUpgrade} />
          <kbd className="text-[10.5px] font-mono text-[#A89F92] bg-[#FAF6EB] rounded px-1.5 py-0.5 border border-[#E6DCC4]">
            esc
          </kbd>
        </div>
      ) : (
        <button
          onClick={onSubmit}
          disabled={(!input.trim() && true) || loading}
          className="p-1.5 rounded-md bg-[#5E8FBF] hover:bg-[#3D6A95] disabled:bg-[#D6CDB8] disabled:cursor-not-allowed text-white transition-colors shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

/**
 * Tiny tier-aware pill that shows "13 / 20 today" for free users, an
 * infinity glyph for Pro. Clicking when free opens the upgrade modal —
 * this is the single most visible paywall surface in the product, so the
 * affordance has to be obvious without being annoying.
 *
 * Hidden entirely if billing state hasn't loaded yet (avoids a flash of
 * "0 / 20" that gives the wrong impression on first open).
 */
function QuotaPill({
  quota,
  onUpgrade,
}: {
  quota: AskQuota | null;
  onUpgrade: () => void;
}) {
  if (!quota) return null;
  if (quota.tier === "pro" || quota.limit === -1) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[#D0E1F0]/40 border border-[#5E8FBF]/20 px-2 py-0.5 text-[10.5px] font-mono text-[#3D6A95]"
        title="You're on Pro — no daily cap."
      >
        <InfinityIcon className="w-3 h-3" strokeWidth={2.5} />
        <span>unlimited</span>
      </span>
    );
  }
  const remaining = Math.max(0, quota.limit - quota.used);
  const isLow = remaining <= 3;
  const isOut = remaining === 0;
  const colorClasses = isOut
    ? "bg-[#F5E8E0] border-[#B86B4A]/30 text-[#B86B4A] hover:bg-[#F0DCD0]"
    : isLow
    ? "bg-[#FAF1DC] border-[#C99A50]/30 text-[#8E6A2A] hover:bg-[#F0E5C0]"
    : "bg-[#FAF6EB] border-[#E6DCC4] text-[#766E63] hover:bg-[#F0E9D6] hover:text-[#3D6A95]";
  return (
    <button
      onClick={onUpgrade}
      title={
        isOut
          ? "Out of messages today — upgrade for unlimited"
          : `Free tier · ${remaining} Ask Oushi messages left today`
      }
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-mono transition-colors ${colorClasses}`}
    >
      <span className="font-semibold tabular-nums">{quota.used}</span>
      <span className="opacity-70">/ {quota.limit}</span>
      <span className="hidden sm:inline">today</span>
    </button>
  );
}

function AttachmentPills({
  files,
  onRemove,
  error,
  variant,
}: {
  files: AttachmentPreview[];
  onRemove: (idx: number) => void;
  error: string | null;
  variant: "top" | "bottom";
}) {
  if (files.length === 0 && !error) return null;
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 px-4 ${
        variant === "top" ? "pt-3" : "pt-2"
      } ${files.length > 0 || error ? "pb-1" : ""}`}
    >
      {files.map((f, i) => {
        const isPdf = f.mime_type === "application/pdf";
        const Icon = isPdf ? FileText : ImageIcon;
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-[#D0E1F0] bg-[#D0E1F0]/30 text-[11.5px] text-[#3D6A95] max-w-[200px]"
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="truncate font-medium">{f.filename}</span>
            <span className="text-[10px] text-[#5E8FBF]/70 font-mono shrink-0">
              {formatBytes(f.size_bytes)}
            </span>
            <button
              onClick={() => onRemove(i)}
              className="ml-0.5 text-[#5E8FBF] hover:text-[#B86B4A] shrink-0"
              title="Remove"
            >
              <X className="w-2.5 h-2.5" strokeWidth={3} />
            </button>
          </span>
        );
      })}
      {error && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[#B86B4A]">
          <AlertCircle className="w-3 h-3" />
          {error}
        </span>
      )}
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader returned non-string"));
        return;
      }
      // result is "data:<mime>;base64,<...>" — strip the prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function EmptyState({
  onPick,
  recentThreads,
  onLoadThread,
  onDeleteThread,
}: {
  onPick: (s: string) => void;
  recentThreads: RecentThread[];
  onLoadThread?: (id: string) => void;
  onDeleteThread?: (id: string) => void;
}) {
  const top = recentThreads.slice(0, 5);
  return (
    <div className="px-5 pb-5 pt-2 space-y-4">
      {/* Suggestions */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2">
          Try asking
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="text-left px-3 py-2 rounded-lg border border-[#E6DCC4] bg-white/40 hover:bg-white hover:border-[#5E8FBF] hover:text-[#3D6A95] text-[12.5px] text-[#2A2520] transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Recent threads */}
      {top.length > 0 && onLoadThread && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2">
            Recent
          </p>
          <ul className="-mx-1.5">
            {top.map((t) => (
              <li key={t.id} className="group">
                <div className="flex items-center gap-2 rounded-lg hover:bg-white/60 px-2 py-1.5">
                  <button
                    onClick={() => onLoadThread(t.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#A89F92] shrink-0" />
                    <span className="text-[12.5px] text-[#2A2520] truncate">{t.title}</span>
                    <span className="text-[10.5px] text-[#A89F92] shrink-0 font-mono tabular-nums">
                      {relativeTime(t.updated_at)}
                    </span>
                  </button>
                  {onDeleteThread && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteThread(t.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#A89F92] hover:text-[#B86B4A] hover:bg-[#F5E8E0] transition-all"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function Message({
  message,
  actionCtx,
}: {
  message: ChatMessage;
  actionCtx: CardActionContext;
}) {
  if (message.role === "user") {
    const atts = message.attachments || [];
    return (
      <div className="flex flex-col items-end gap-1.5">
        {atts.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5 max-w-[85%]">
            {atts.map((a, i) => {
              const isPdf = a.mime_type === "application/pdf";
              const Icon = isPdf ? FileText : ImageIcon;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-[#5E8FBF]/30 bg-[#D0E1F0]/40 text-[11.5px] text-[#3D6A95] max-w-[200px]"
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{a.filename}</span>
                </span>
              );
            })}
          </div>
        )}
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#5E8FBF] text-white px-3.5 py-2 text-[13.5px] leading-[1.5] whitespace-pre-wrap shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  const hasCards = !!message.cards && message.cards.length > 0;
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#5E8FBF] to-[#3D6A95] flex items-center justify-center shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className={`min-w-0 ${hasCards ? "flex-1" : "max-w-[85%]"}`}>
        {message.content && (
          <div className="rounded-2xl rounded-tl-sm bg-[#FAF6EB] border border-[#E6DCC4] px-3.5 py-2 text-[13.5px] leading-[1.6] text-[#2A2520] whitespace-pre-wrap inline-block max-w-full">
            {message.content}
            {message.streaming && (
              <span className="inline-block w-[2px] h-[13px] bg-[#5E8FBF] align-middle ml-0.5 animate-pulse" />
            )}
          </div>
        )}
        {hasCards && <CardStack cards={message.cards!} actionCtx={actionCtx} />}
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#5E8FBF] to-[#3D6A95] flex items-center justify-center shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-[#FAF6EB] border border-[#E6DCC4] px-3.5 py-2.5 flex items-center gap-2 text-[#766E63]">
        <LoadingDots size="md" />
        <span className="text-[12.5px]">Reading your inbox…</span>
      </div>
    </div>
  );
}
