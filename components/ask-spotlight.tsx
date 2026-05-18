"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowUp, Loader2, RotateCcw } from "lucide-react";
import { CardStack } from "@/components/oushi-cards/card-renderer";
import type { OushiCard } from "@/components/oushi-cards/types";
import type { CardActionContext } from "@/components/oushi-cards/card-actions";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  cards?: OushiCard[];
  streaming?: boolean; // true while the assistant is still streaming
};

const SUGGESTIONS = [
  "anything urgent today?",
  "what's waiting on me?",
  "what's my flight info?",
  "summarize this week",
  "who haven't I replied to?",
  "any bills due soon?",
];

interface Props {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  actionCtx: CardActionContext;
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
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const hasMessages = messages.length > 0;
  // Derived directly from message presence — when the user sends a question,
  // the input moves to a slim bar at the bottom and the conversation fills the body.
  const showInputAtBottom = hasMessages;

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
    if (!input.trim() || loading) return;
    onSend(input);
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
                <SpotlightInput
                  inputRef={inputRef}
                  input={input}
                  setInput={setInput}
                  loading={loading}
                  onSubmit={submit}
                  onEscape={onClose}
                  variant="top"
                />
              )}

              {/* Results / chat history */}
              <div
                ref={resultsRef}
                className={`flex-1 overflow-y-auto ${
                  hasMessages ? "" : "max-h-[420px]"
                }`}
              >
                {!hasMessages ? (
                  <SuggestionsGrid onPick={(s) => onSend(s)} />
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
                  <div className="flex items-center justify-between px-3 pt-2">
                    <button
                      onClick={onClear}
                      className="inline-flex items-center gap-1.5 text-[10.5px] text-[#A89F92] hover:text-[#2A2520] px-2 py-1 rounded transition-colors"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      New chat
                    </button>
                    <p className="text-[10.5px] text-[#A89F92]">Enter to send · Esc to close</p>
                  </div>
                  <SpotlightInput
                    inputRef={inputRef}
                    input={input}
                    setInput={setInput}
                    loading={loading}
                    onSubmit={submit}
                    onEscape={onClose}
                    variant="bottom"
                  />
                </div>
              )}
            </div>
          </motion.div>
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
  variant,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onEscape: () => void;
  variant: "top" | "bottom";
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 ${
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
        placeholder="Ask Oushi anything about your inbox…"
        className="flex-1 resize-none bg-transparent text-[15px] text-[#2A2520] outline-none placeholder:text-[#A89F92] leading-[1.45] py-0.5 max-h-[120px]"
      />
      {variant === "top" ? (
        <kbd className="text-[10.5px] font-mono text-[#A89F92] bg-[#FAF6EB] rounded px-1.5 py-0.5 border border-[#E6DCC4]">
          esc
        </kbd>
      ) : (
        <button
          onClick={onSubmit}
          disabled={!input.trim() || loading}
          className="p-1.5 rounded-md bg-[#5E8FBF] hover:bg-[#3D6A95] disabled:bg-[#D6CDB8] disabled:cursor-not-allowed text-white transition-colors shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

function SuggestionsGrid({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="px-5 pb-5 pt-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2.5">
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
  );
}

function Message({
  message,
  actionCtx,
}: {
  message: ChatMessage;
  actionCtx: CardActionContext;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
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
        <span className="inline-flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#5E8FBF] oushi-loading-dot"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
        <span className="text-[12.5px]">Reading your inbox…</span>
      </div>
    </div>
  );
}
