"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Settings,
  Check,
  X,
  Mail,
  ExternalLink,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Calendar,
  Send,
  Inbox,
  AlertCircle,
  CornerDownLeft,
  Clock,
  PanelLeftClose,
  PanelLeft,
  Hash,
  CircleDot,
  Archive,
  Handshake,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  ArrowRight,
  Tag,
} from "lucide-react";
import type { Classified } from "@/lib/outstanding";
import {
  OUSHI_LABELS,
  computeLabelForEmail,
  getLabelByKey,
  type OushiLabelKey,
} from "@/lib/gmail-labels-shared";
import { ErrorBoundary } from "@/components/error-boundary";
import { OushiMark } from "@/components/oushi-mark";
import { AmbientBackground } from "@/components/ambient-bg";
import { isOushiCard, type OushiCard } from "@/components/oushi-cards/types";
import type { CardActionContext } from "@/components/oushi-cards/card-actions";
import { AskSpotlight, type ChatMessage, type AttachmentPreview } from "@/components/ask-spotlight";
import { parsePartialAsk } from "@/lib/partial-json";
import { PromisesView } from "@/components/promises-view";
import { FirstSyncSplash } from "@/components/first-sync-splash";
import { DashboardSkeleton } from "@/components/skeleton";
import { KeyboardHelp } from "@/components/keyboard-help";
import {
  FeedbackModal,
  FeedbackPrompt,
  ReportBugItem,
} from "@/components/feedback-widget";
import {
  enableFeedbackFx,
  fxDismiss,
  fxNav,
  fxComplete,
} from "@/lib/feedback-fx";
import { TodayOushi } from "@/components/today-oushi";
import { NarrativeToday } from "@/components/narrative-today";
import {
  readStoredTodayMode,
  writeStoredTodayMode,
  type TodayMode,
} from "@/components/today-mode-toggle";
import { useToast } from "@/components/toast";
import { EmptyState as FeedbackEmptyState } from "@/components/feedback";
import { SnoozePopover } from "@/components/snooze-popover";

interface Profile {
  bio: string;
  interests: string[];
  priorities: string[];
  noise: string[];
}

interface Topic {
  id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
}

interface Buckets {
  urgent: Classified[];
  awaiting_reply: Classified[];
  following_up: Classified[];
  reference: Classified[];
  fresh: Classified[];
  background: Classified[];
  handled: Classified[];
}

interface DashboardClientProps {
  buckets: Buckets;
  allEmails: Classified[];
  topics: Topic[];
  totalEmails: number;
  hasGmail: boolean;
  isFirstSync: boolean;
  userEmail: string;
  userAvatar?: string | null;
  userName?: string | null;
  profile: Profile;
  feedbackCount: number;
  lastSyncedAt: string | null;
  /** Error code from the OAuth callback if Gmail connect failed */
  gmailError?: string | null;
}

type ViewKey =
  | { type: "today" }
  | { type: "urgent" }
  | { type: "awaiting" }
  | { type: "following" }
  | { type: "reference" }
  | { type: "untagged" }
  | { type: "promises" }
  | { type: "board"; id: string };

// ChatMessage type now lives in ask-spotlight.tsx — imported above.

/**
 * Decode the gmailError code from /api/gmail/callback into a human-readable
 * banner the connect-empty-state can render. Each code maps to a title,
 * a one-line explanation, an optional hint, and an optional outbound link
 * (e.g. Google's permissions page where the user can revoke and retry).
 */
function decodeGmailError(code: string): {
  title: string;
  detail: string;
  hint?: string;
  actionLink?: { label: string; href: string };
} {
  if (code === "no_refresh_token") {
    return {
      title: "Google didn't send back a refresh token.",
      detail:
        "This usually happens when you've already approved Oushi at least once and Google decided to skip the re-consent. Revoke Oushi's access on your Google account, then try again — Google will issue a fresh refresh token.",
      hint: "If your OAuth app is still in pending-verification, also make sure your Google account is added as a test user in Google Cloud Console.",
      actionLink: {
        label: "Open Google account permissions",
        href: "https://myaccount.google.com/permissions",
      },
    };
  }
  if (code === "access_denied") {
    return {
      title: "Google blocked the sign-in.",
      detail:
        "Either you cancelled the consent, or your Google account isn't authorized to use this app while it's pending verification.",
      hint: "If you're the developer: add your Google account as a test user at console.cloud.google.com → OAuth consent screen.",
      actionLink: {
        label: "Open Google Cloud OAuth consent screen",
        href: "https://console.cloud.google.com/apis/credentials/consent",
      },
    };
  }
  if (code === "missing_code") {
    return {
      title: "Google didn't return an authorization code.",
      detail:
        "The OAuth flow finished without the code we need. Usually a brief network blip — give it another try.",
    };
  }
  if (code.startsWith("token_exchange:")) {
    return {
      title: "We couldn't exchange Google's code for tokens.",
      detail:
        decodeURIComponent(code.slice("token_exchange:".length)) ||
        "Google rejected the authorization code.",
      hint: "Codes can only be used once and expire fast — try the connect flow again from the start.",
    };
  }
  if (code.startsWith("storage:") || code.startsWith("storage_exception:")) {
    const detail = decodeURIComponent(
      code.replace(/^storage(_exception)?:/, "")
    );
    return {
      title: "We got the tokens but couldn't save them.",
      detail: detail || "Database write failed.",
      hint: "This is on our side — try once more. If it keeps failing, ping support.",
    };
  }
  return {
    title: "Couldn't finish connecting Gmail.",
    detail:
      "Google returned an unexpected response: " +
      decodeURIComponent(code).slice(0, 200),
    hint: "Try the connect flow once more. If it keeps failing, the OAuth app may need its verification renewed.",
  };
}

export function DashboardClient({
  buckets: initialBuckets,
  allEmails,
  topics: initialTopics,
  totalEmails,
  hasGmail,
  isFirstSync,
  gmailError,
  userEmail,
  userAvatar = null,
  userName = null,
  profile,
  feedbackCount,
  lastSyncedAt,
}: DashboardClientProps) {
  const toast = useToast();
  const [buckets, setBuckets] = useState(initialBuckets);
  const [topics, setTopics] = useState(initialTopics);
  const [loading, setLoading] = useState(isFirstSync);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<ViewKey>({ type: "today" });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Default to closed on mobile, open on desktop (first load only)
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  // briefing state was for the old TodayView's briefing card —
  // TodayOushi pulls its own summary from /api/today now.
  const [askMessages, setAskMessages] = useState<ChatMessage[]>([]);
  const [askInput, setAskInput] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [recentThreads, setRecentThreads] = useState<
    Array<{ id: string; title: string; updated_at: string; message_count: number }>
  >([]);
  const [promisesCount, setPromisesCount] = useState<number>(0);

  // Lazy-fetch promises count for the sidebar badge.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/commitments?status=open");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.commitments)) {
          setPromisesCount(data.commitments.length);
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [view]);
  const [suggested, setSuggested] = useState<Array<{ name: string; description: string; color: string }>>([]);
  const [rematching, setRematching] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Classified | null>(null);
  const [showAddTopic, setShowAddTopic] = useState(false);
  // Keyboard-driven focus + help overlay state
  const [focusedEmailId, setFocusedEmailId] = useState<string | null>(null);
  const [kbdHelpOpen, setKbdHelpOpen] = useState(false);

  // Today view mode — Narrative (default, Direction A) or Classic cards.
  // The user changes it from Settings → Appearance; we just read on mount
  // and listen for the storage event so a change in Settings reflects
  // here without a full reload.
  const [todayMode, setTodayMode] = useState<TodayMode>("narrative");
  useEffect(() => {
    setTodayMode(readStoredTodayMode());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "oushi.todayMode") {
        const v = e.newValue;
        if (v === "classic" || v === "narrative") setTodayMode(v);
      }
    };
    window.addEventListener("storage", onStorage);
    // Also listen for a custom in-tab event since `storage` only fires
    // across tabs. Settings dispatches "oushi:todayMode" when the toggle
    // is flipped in the same tab.
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ mode: TodayMode }>).detail;
      if (detail?.mode) setTodayMode(detail.mode);
    };
    window.addEventListener("oushi:todayMode", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("oushi:todayMode", onCustom);
    };
  }, []);
  // writeStoredTodayMode is now only used inside Settings; keep the
  // helper available so the in-dashboard updater is intentionally absent.
  void writeStoredTodayMode;

  // Unlock audio FX on the first real user interaction. Safari/iOS require
  // a synchronous user gesture before AudioContext can resume; calling
  // enableFeedbackFx() inside this listener is the simplest way to satisfy
  // that across browsers. Cheap no-op after the first call.
  useEffect(() => {
    const onFirstInteraction = () => enableFeedbackFx();
    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isFirstSync || !hasGmail) return;
    (async () => {
      try {
        // Sync is the user-visible blocker — wait for it first
        await fetch("/api/gmail/sync", { method: "POST" });
        // Bootstrap personalization runs in parallel with sync — it reads
        // sent / starred / important emails to seed sender reputation BEFORE
        // ranking. Without it, the first-pass ranking is just Claude guessing.
        const bootstrap = fetch("/api/personalize/bootstrap", { method: "POST" }).catch(() => null);
        await bootstrap; // wait so the rank call sees the bootstrap signals
        // Then ranking + calendar in parallel (fewer round-trips than serial)
        const ranking = fetch("/api/rank", { method: "POST" });
        const calendar = fetch("/api/calendar/sync", { method: "POST" }).catch(() => null);
        await Promise.allSettled([ranking, calendar]);
        // Brief floor so the splash doesn't strobe on fast accounts
        await new Promise((r) => setTimeout(r, 600));
        window.history.replaceState({}, "", "/dashboard");
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Initial sync failed");
        setLoading(false);
      }
    })();
  }, [isFirstSync, hasGmail]);

  // Auto-sync on dashboard mount — pulls anything new from Gmail since
  // last_history_id, then runs a rank pass on the diff so labels appear
  // within seconds of the user opening Oushi.
  //
  // Gated by a sessionStorage flag so it runs ONCE per browser tab/session.
  // Without this gate, every re-mount (e.g., clicking the Oushi logo from
  // within the dashboard) would re-trigger the sync → reload → fresh
  // mount → re-trigger → infinite loading-skeleton loop.
  useEffect(() => {
    if (!hasGmail || isFirstSync) return;
    if (typeof window === "undefined") return;
    const FLAG_KEY = "oushi.autoSyncFired";
    try {
      if (window.sessionStorage.getItem(FLAG_KEY)) return;
      window.sessionStorage.setItem(FLAG_KEY, String(Date.now()));
    } catch {
      // sessionStorage blocked (private mode, etc.) — fall through
      // and run once; subsequent navigations will re-run but that's
      // tolerable in the edge case
    }
    let cancelled = false;
    (async () => {
      try {
        const syncRes = await fetch("/api/gmail/sync", { method: "POST" });
        if (cancelled || !syncRes.ok) return;
        const syncData = await syncRes.json().catch(() => ({}));
        const added = Number(syncData?.added) || 0;
        if (added > 0) {
          await fetch("/api/rank", { method: "POST" });
          await new Promise((r) => setTimeout(r, 500));
          if (!cancelled) window.location.reload();
        }
      } catch {
        // Silent — the every-2-min cron + diagnose effect catch it
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasGmail, isFirstSync]);

  // Inbox health check — runs once on mount. Detects "all buckets empty
  // because ranking never finished" and auto-triggers a re-rank, so the
  // user isn't stuck staring at empty views.
  const [diagnosis, setDiagnosis] = useState<null | {
    diagnosis: string;
    total_14d: number;
    unranked_14d: number;
    scored_14d: number;
    dismissed_14d: number;
  }>(null);
  const [reranking, setReranking] = useState(false);
  const [undismissing, setUndismissing] = useState(false);

  useEffect(() => {
    if (!hasGmail || loading || isFirstSync) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/diagnose");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setDiagnosis({
          diagnosis: data.diagnosis,
          total_14d: data.total_14d,
          unranked_14d: data.unranked_14d,
          scored_14d: data.scored_14d,
          dismissed_14d: data.dismissed_14d,
        });
        // Auto-rank if everything is unranked — this is the silent failure
        // case where onboarding finished but rank didn't (network hiccup,
        // Claude API timeout, etc.). One-shot defensive call.
        if (data.diagnosis === "all_unranked" && data.unranked_14d > 0) {
          setReranking(true);
          await fetch("/api/rank", { method: "POST" });
          if (!cancelled) {
            setReranking(false);
            // Reload so the new scores feed into bucketize
            window.location.reload();
          }
        }
      } catch {
        // Best-effort — no banner if the diagnostic itself errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasGmail, loading, isFirstSync]);

  const manualRerank = async () => {
    setReranking(true);
    try {
      await fetch("/api/rank", { method: "POST" });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-rank failed");
      setReranking(false);
    }
  };

  const resurfaceDismissed = async () => {
    setUndismissing(true);
    try {
      // 30 = the same threshold the buckets use to consider an email
      // "visible" at all. Clearing dismissed_at on these surfaces them
      // back into the active views.
      const res = await fetch("/api/email/undismiss-recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 14, minScore: 30 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't resurface emails");
        setUndismissing(false);
        return;
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resurface emails");
      setUndismissing(false);
    }
  };

  // (briefing useEffect removed — was only used by the old TodayView)

  useEffect(() => {
    if (loading || !hasGmail || topics.length >= 10) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/topics/suggest");
        const data = await res.json();
        if (!cancelled && data.topics) setSuggested(data.topics);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [loading, hasGmail, topics.length]);

  // Filter dismissed
  const visible = useMemo(() => {
    const filter = (arr: Classified[]) => arr.filter((e) => !dismissedIds.has(e.id));
    return {
      urgent: filter(buckets.urgent),
      awaiting: filter(buckets.awaiting_reply),
      following: filter(buckets.following_up),
      reference: filter(buckets.reference),
    };
  }, [buckets, dismissedIds]);

  // const totalNeedsAttention = visible.urgent.length + visible.awaiting.length + visible.following.length;

  // Emails by board (topic)
  const emailsByTopic = useMemo(() => {
    const map = new Map<string, Classified[]>();
    for (const t of topics) map.set(t.name, []);
    const untagged: Classified[] = [];
    for (const e of allEmails) {
      if (dismissedIds.has(e.id)) continue;
      if (e.bucket === "handled" || e.score < 30) continue;
      const matched = e.matched_topics || [];
      if (matched.length === 0) {
        untagged.push(e);
      } else {
        for (const t of matched) {
          const list = map.get(t);
          if (list) list.push(e);
        }
      }
    }
    return { byTopic: map, untagged };
  }, [allEmails, topics, dismissedIds]);

  const handleFeedback = async (emailId: string, signal: "upvote" | "downvote") => {
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_id: emailId, signal }),
    });
    setBuckets((prev) => {
      const adjust = (arr: Classified[]) =>
        arr.map((e) => {
          if (e.id !== emailId) return e;
          const delta = signal === "upvote" ? 15 : -30;
          return { ...e, score: Math.max(0, Math.min(100, e.score + delta)) };
        });
      return {
        urgent: adjust(prev.urgent),
        awaiting_reply: adjust(prev.awaiting_reply),
        following_up: adjust(prev.following_up),
        reference: adjust(prev.reference),
        fresh: adjust(prev.fresh),
        background: adjust(prev.background),
        handled: adjust(prev.handled),
      };
    });
    if (signal === "downvote") setDismissedIds((p) => new Set(p).add(emailId));
  };

  const handleDismiss = async (emailId: string) => {
    setDismissedIds((p) => new Set(p).add(emailId));
    fetch("/api/email/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_id: emailId }),
    });
    toast.success("Email archived", {
      detail: "Also archived in Gmail.",
      onUndo: () => {
        // Undo: clear from dismissedIds locally + best-effort un-archive
        setDismissedIds((p) => {
          const next = new Set(p);
          next.delete(emailId);
          return next;
        });
      },
    });
  };

  const sendAsk = async (text: string, attachments?: AttachmentPreview[]) => {
    const trimmed = text.trim();
    if ((!trimmed && (!attachments || attachments.length === 0)) || askLoading) return;
    setAskOpen(true);

    // Strip the base64 from the message we put in state — it's huge and
    // not needed for rendering. Keep only filename + mime metadata.
    const attachmentMeta = (attachments || []).map((a) => ({
      filename: a.filename,
      mime_type: a.mime_type,
    }));

    const userMessages: ChatMessage[] = [
      ...askMessages,
      {
        role: "user",
        content: trimmed || "(see attached file)",
        attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
      },
    ];
    setAskMessages(userMessages);
    setAskInput("");
    setAskLoading(true);

    // 60s overall timeout + 25s per-chunk timeout for streaming
    const controller = new AbortController();
    const overallTimeout = setTimeout(() => controller.abort("overall_timeout"), 60_000);
    let chunkTimeout: ReturnType<typeof setTimeout> | null = null;
    const resetChunkTimeout = () => {
      if (chunkTimeout) clearTimeout(chunkTimeout);
      chunkTimeout = setTimeout(() => controller.abort("chunk_timeout"), 25_000);
    };

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          // Strip cards + attachments from the message history — model only needs role/content
          messages: userMessages.map(({ role, content }) => ({ role, content })),
          // But send the actual files with this turn
          attachments: attachments || [],
        }),
      });

      if (!res.ok || !res.body) {
        const errPayload = await res.json().catch(() => null);
        setAskMessages([
          ...userMessages,
          {
            role: "assistant",
            content: errPayload?.error || "Couldn't reach Oushi.",
            error: true,
          },
        ]);
        return;
      }

      // Streaming parse loop. Server prefilled "{" and pumps heartbeats
      // so the connection doesn't appear idle. We re-parse partial JSON
      // on every chunk to surface text + complete card objects as they arrive.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "{";
      let gotAnyText = false;

      setAskMessages([
        ...userMessages,
        { role: "assistant", content: "", streaming: true },
      ]);

      resetChunkTimeout();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        resetChunkTimeout();
        buffer += decoder.decode(value, { stream: true });

        try {
          const partial = parsePartialAsk(buffer);
          const cards = partial.cards.filter(isOushiCard) as OushiCard[];
          if (partial.text || cards.length > 0) gotAnyText = true;

          setAskMessages([
            ...userMessages,
            {
              role: "assistant",
              content: partial.text,
              cards: cards.length > 0 ? cards : undefined,
              streaming: !partial.textComplete,
            },
          ]);
        } catch (parseErr) {
          // Skip a bad chunk — keep going
          console.warn("[ask] parse error mid-stream", parseErr);
        }
      }

      if (chunkTimeout) clearTimeout(chunkTimeout);

      // Final pass: clear streaming flag
      const finalPartial = parsePartialAsk(buffer);
      const finalCards = finalPartial.cards.filter(isOushiCard) as OushiCard[];
      const finalContent = finalPartial.text || (gotAnyText ? "(no response)" : "Something interrupted the answer — try again?");
      const finalMessages: ChatMessage[] = [
        ...userMessages,
        {
          role: "assistant",
          content: finalContent,
          cards: finalCards.length > 0 ? finalCards : undefined,
          streaming: false,
          error: !gotAnyText,
        },
      ];
      setAskMessages(finalMessages);

      // Save thread (fire and forget). Title comes from the first user message.
      const firstUserMsg = finalMessages.find((m) => m.role === "user");
      const title = (firstUserMsg?.content || "Untitled chat").slice(0, 80);
      try {
        const saveRes = await fetch("/api/chat/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: currentThreadId || undefined,
            title,
            messages: finalMessages,
          }),
        });
        if (saveRes.ok) {
          const data = await saveRes.json();
          if (!currentThreadId && data.id) setCurrentThreadId(data.id);
        }
      } catch {
        // Non-fatal — the chat still works, just won't be saved.
      }
    } catch (e) {
      // Stream timeout / network error
      const reason = controller.signal.aborted
        ? controller.signal.reason || "timeout"
        : e instanceof Error
          ? e.message
          : "network error";
      const friendly =
        reason === "overall_timeout"
          ? "Took too long — try again with a shorter question."
          : reason === "chunk_timeout"
            ? "The answer stalled mid-stream. Try again."
            : "Couldn't reach Oushi.";
      setAskMessages([
        ...userMessages,
        { role: "assistant", content: friendly, error: true },
      ]);
    } finally {
      clearTimeout(overallTimeout);
      if (chunkTimeout) clearTimeout(chunkTimeout);
      setAskLoading(false);
    }
  };

  // Fetch recent threads when the spotlight opens with no messages.
  useEffect(() => {
    if (!askOpen || askMessages.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/threads");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.threads)) {
          setRecentThreads(data.threads);
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [askOpen, askMessages.length]);

  const loadThread = async (threadId: string) => {
    try {
      const res = await fetch(`/api/chat/threads/${threadId}`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      // Strip the streaming flag from any old messages
      const clean: ChatMessage[] = msgs.map((m: { role: string; content?: string; cards?: unknown[] }) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: typeof m.content === "string" ? m.content : "",
        cards: Array.isArray(m.cards) ? (m.cards.filter(isOushiCard) as OushiCard[]) : undefined,
        streaming: false,
      }));
      setAskMessages(clean);
      setCurrentThreadId(threadId);
    } catch {
      // ignore
    }
  };

  const deleteThread = async (threadId: string) => {
    setRecentThreads((p) => p.filter((t) => t.id !== threadId));
    try {
      await fetch(`/api/chat/threads/${threadId}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  };

  // Action handlers used by card buttons (Reply / Open / Dismiss / Mute etc.)
  const actionCtx: CardActionContext = useMemo(
    () => ({
      openEmail: (emailId) => {
        const found = allEmails.find((e) => e.id === emailId);
        if (found) {
          setSelectedEmail(found);
          setAskOpen(false); // dismiss spotlight so the modal is visible
        }
      },
      ask: (prompt) => {
        sendAsk(prompt);
      },
      dismiss: async (emailId) => {
        setDismissedIds((p) => new Set(p).add(emailId));
        fxDismiss();
        await fetch("/api/email/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_id: emailId }),
        });
        toast.success("Email archived");
      },
      muteSender: async (emailId) => {
        const found = allEmails.find((e) => e.id === emailId);
        if (!found?.from_email) return;
        await fetch("/api/mute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mute_type: "sender", value: found.from_email }),
        });
        toast.success(`Muted ${found.from_email}`, {
          detail: "Future emails from this sender will be hidden.",
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEmails, askMessages]
  );

  const resetChat = () => {
    setAskMessages([]);
    setAskInput("");
    setCurrentThreadId(null);
  };

  // Compute the list of emails the keyboard arrows navigate. Tracks the
  // current view so J/K moves through what the user is actually looking at.
  const navList = useMemo<Classified[]>(() => {
    switch (view.type) {
      case "urgent":
        return visible.urgent;
      case "awaiting":
        return visible.awaiting;
      case "following":
        return visible.following;
      case "reference":
        return visible.reference;
      case "untagged":
        return emailsByTopic.untagged;
      case "board": {
        const t = topics.find((x) => x.id === view.id);
        return (t && emailsByTopic.byTopic.get(t.name)) || [];
      }
      case "today":
      default:
        // Today view shows urgent + awaiting + following in order
        return [...visible.urgent, ...visible.awaiting, ...visible.following];
    }
  }, [view, visible, emailsByTopic, topics]);

  // Reset focus when the underlying list changes (view switch or list mutates)
  useEffect(() => {
    if (!focusedEmailId) return;
    if (!navList.some((e) => e.id === focusedEmailId)) {
      setFocusedEmailId(null);
    }
  }, [navList, focusedEmailId]);

  // ── Global keyboard shortcuts ────────────────────────────────────────
  // Power-user navigation: J/K to move through the list, Enter to open,
  // E to archive, R to draft reply, S to snooze, G+? for view jumps,
  // ? to show help. Skip everything while the user is typing in a field.
  useEffect(() => {
    // "g" is a leader key — pressing it puts us in a pending state for
    // the next 1.5s. Then "t" jumps to Today, "u" to Urgent, etc.
    let pendingG = false;
    let pendingGTimer: ReturnType<typeof setTimeout> | null = null;

    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl combos always work — they don't conflict with typing
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAskOpen(true);
        return;
      }

      // Escape closes whatever overlay is open
      if (e.key === "Escape") {
        if (kbdHelpOpen) {
          setKbdHelpOpen(false);
          return;
        }
        if (askOpen) {
          setAskOpen(false);
          return;
        }
        if (selectedEmail) {
          setSelectedEmail(null);
          return;
        }
        return;
      }

      // Don't intercept while the user is typing or another modifier is held
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // "?" — help overlay (Shift+/ on most layouts)
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setKbdHelpOpen((v) => !v);
        return;
      }

      // While the help overlay or any modal is open, suspend the rest
      if (kbdHelpOpen || askOpen) return;

      // The "g" leader for view jumps
      if (pendingG) {
        pendingG = false;
        if (pendingGTimer) {
          clearTimeout(pendingGTimer);
          pendingGTimer = null;
        }
        const k = e.key.toLowerCase();
        if (k === "t") {
          e.preventDefault();
          setView({ type: "today" });
          return;
        }
        if (k === "u") {
          e.preventDefault();
          setView({ type: "urgent" });
          return;
        }
        if (k === "a") {
          e.preventDefault();
          setView({ type: "awaiting" });
          return;
        }
        if (k === "f") {
          e.preventDefault();
          setView({ type: "following" });
          return;
        }
        if (k === "r") {
          e.preventDefault();
          setView({ type: "reference" });
          return;
        }
        // Fall through to single-key actions if not a g-combo
      }
      if (e.key.toLowerCase() === "g" && !selectedEmail) {
        pendingG = true;
        pendingGTimer = setTimeout(() => {
          pendingG = false;
        }, 1500);
        return;
      }

      // Single-key actions — most affect the focused or modal-open email.
      const activeId = selectedEmail?.id || focusedEmailId;
      const activeEmail = selectedEmail
        ? selectedEmail
        : navList.find((x) => x.id === focusedEmailId) || null;

      const key = e.key.toLowerCase();

      // J / Down — next in list
      if (key === "j" || e.key === "ArrowDown") {
        if (navList.length === 0) return;
        e.preventDefault();
        const idx = focusedEmailId
          ? navList.findIndex((x) => x.id === focusedEmailId)
          : -1;
        const next = navList[Math.min(idx + 1, navList.length - 1)] || navList[0];
        if (next) {
          setFocusedEmailId(next.id);
          fxNav();
          // Scroll the focused row into view if possible
          requestAnimationFrame(() => {
            document
              .getElementById(`email-row-${next.id}`)
              ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          });
        }
        return;
      }
      // K / Up — previous in list
      if (key === "k" || e.key === "ArrowUp") {
        if (navList.length === 0) return;
        e.preventDefault();
        const idx = focusedEmailId
          ? navList.findIndex((x) => x.id === focusedEmailId)
          : 1;
        const prev = navList[Math.max(idx - 1, 0)] || navList[0];
        if (prev) {
          setFocusedEmailId(prev.id);
          fxNav();
          requestAnimationFrame(() => {
            document
              .getElementById(`email-row-${prev.id}`)
              ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          });
        }
        return;
      }

      // Enter — open focused
      if (e.key === "Enter" && activeEmail && !selectedEmail) {
        e.preventDefault();
        setSelectedEmail(activeEmail);
        return;
      }

      // E — archive
      if (key === "e" && activeId && actionCtx.dismiss) {
        e.preventDefault();
        actionCtx.dismiss(activeId);
        // Close the modal if we dismissed the currently-open email
        if (selectedEmail?.id === activeId) setSelectedEmail(null);
        // Advance focus to the next row in the list
        if (!selectedEmail) {
          const idx = navList.findIndex((x) => x.id === activeId);
          const next = navList[idx + 1] || navList[idx - 1] || null;
          setFocusedEmailId(next ? next.id : null);
        }
        return;
      }

      // R — open + draft reply
      if (key === "r" && activeEmail) {
        e.preventDefault();
        if (!selectedEmail) setSelectedEmail(activeEmail);
        // The modal auto-opens; drafting is the next action the user
        // would take. We don't force-trigger draft from out here — the
        // modal exposes the Draft button big and obvious — but opening
        // the modal puts the user one click away.
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (pendingGTimer) clearTimeout(pendingGTimer);
    };
  }, [
    askOpen,
    kbdHelpOpen,
    selectedEmail,
    focusedEmailId,
    navList,
    actionCtx,
  ]);

  const triggerRematch = async () => {
    setRematching(true);
    try {
      await fetch("/api/topics/rematch", { method: "POST" });
      window.location.reload();
    } catch { setRematching(false); }
  };

  const addTopic = async (name: string, description?: string, color?: string) => {
    if (adding) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (topics.length >= 10) { setError("Max 10 boards."); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, description, color }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to add"); return; }
      setTopics((prev) => [...prev, data.topic]);
      setSuggested((prev) => prev.filter((s) => s.name.toLowerCase() !== trimmed.toLowerCase()));
      setNewTopicName("");
      setShowAddTopic(false);
      fetch("/api/topics/rematch", { method: "POST" }).then(() => window.location.reload());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally { setAdding(false); }
  };

  const deleteTopic = async (id: string) => {
    await fetch(`/api/topics/${id}`, { method: "DELETE" });
    setTopics((prev) => prev.filter((t) => t.id !== id));
    if (view.type === "board" && view.id === id) setView({ type: "today" });
  };

  const renameTopic = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/topics/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      const data = await res.json();
      setTopics((prev) => prev.map((t) => (t.id === id ? data.topic : t)));
      fetch("/api/topics/rematch", { method: "POST" }).then(() => window.location.reload());
    }
  };

  // ===== Early states =====

  if (!hasGmail) {
    // Decode the OAuth error code into a human-readable explanation +
    // the right next step. Codes are set by /api/gmail/callback.
    const errorMessage = gmailError ? decodeGmailError(gmailError) : null;

    return (
      <div className="min-h-screen narrative-bg text-[#2A2520] dark:text-[#FBF4DF] flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-md"
        >
          <div
            className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-6 ring-1 ring-white/60"
            style={{
              background:
                "linear-gradient(135deg, #F2DDD0 0%, #E8DDC9 100%)",
            }}
          >
            <Mail className="w-5 h-5 text-[#7A5A36]" />
          </div>
          <h1
            className="text-[32px] sm:text-[38px] tracking-[-0.014em] leading-[1.08] text-[#2A2520] dark:text-[#FBF4DF]"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            Connect your inbox.
          </h1>
          <p
            className="mt-4 text-[16px] text-[#766E63] dark:text-[#A89F92] leading-[1.55] italic max-w-sm mx-auto"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            Oushi reads your Gmail and surfaces what matters — quietly, in your
            own voice.
          </p>

          {/* Error from a previous failed OAuth attempt */}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-6 rounded-2xl border border-[#B86B4A]/25 bg-[#F5E8E0]/40 dark:bg-[#3A2F23]/40 dark:border-[#D9956E]/30 px-5 py-4 text-left"
              style={{
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.5) inset, 0 2px 8px -4px rgba(184,107,74,0.10)",
              }}
            >
              <p className="text-[13px] font-medium text-[#B86B4A] dark:text-[#D9956E] mb-1.5">
                {errorMessage.title}
              </p>
              <p className="text-[12.5px] text-[#A66556] dark:text-[#C9BFAA] leading-relaxed mb-2">
                {errorMessage.detail}
              </p>
              {errorMessage.hint && (
                <p className="text-[11.5px] text-[#A89F92] italic leading-relaxed">
                  {errorMessage.hint}
                </p>
              )}
            </motion.div>
          )}

          <motion.a
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            href="/api/gmail/connect"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-[#B86B4A] to-[#A65B3F] px-6 py-3 text-[14px] font-medium text-white hover:from-[#A65B3F] hover:to-[#9C523A] transition-all"
            style={{
              boxShadow:
                "0 8px 24px -8px rgba(184,107,74,0.30), 0 1px 0 rgba(255,255,255,0.15) inset",
            }}
          >
            {errorMessage ? "Try again" : "Connect Gmail"}
          </motion.a>

          {errorMessage?.actionLink && (
            <a
              href={errorMessage.actionLink.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-[12px] text-[#766E63] dark:text-[#A89F92] hover:text-[#B86B4A] dark:text-[#A89F92] dark:hover:text-[#D9956E] underline-offset-2 hover:underline transition-colors"
            >
              {errorMessage.actionLink.label} →
            </a>
          )}
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  // ===== Main =====

  // Wrapper so picking a view on mobile auto-closes the sidebar
  const handleSetView = (v: ViewKey) => {
    setView(v);
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div className="app-shell h-screen text-[#2A2520] dark:text-[#FBF4DF] overflow-hidden flex relative">
      {/* First-time setup splash — covers everything until the auto-reload */}
      {isFirstSync && hasGmail && <FirstSyncSplash />}
      <AmbientBackground variant="subtle" />
      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && isMobile && (
          <motion.div
            key="mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-[#2A2520]/30 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence mode="wait" initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={isMobile ? { x: -260, opacity: 1 } : { width: 0, opacity: 0 }}
            animate={isMobile ? { x: 0, opacity: 1 } : { width: 260, opacity: 1 }}
            exit={isMobile ? { x: -260, opacity: 1 } : { width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className={`shrink-0 h-full flex flex-col border-r border-[#E6DCC4] dark:border-[#3A3127] overflow-hidden relative z-10 ${
              isMobile ? "fixed z-40 w-[260px] shadow-2xl" : ""
            }`}
            style={isMobile ? {} : { width: 260 }}
          >
            <Sidebar
              userEmail={userEmail}
              userAvatar={userAvatar}
              userName={userName}
              topics={topics}
              counts={{
                urgent: visible.urgent.length,
                awaiting: visible.awaiting.length,
                following: visible.following.length,
                reference: visible.reference.length,
                untagged: emailsByTopic.untagged.length,
                promises: promisesCount,
                total: allEmails.filter((e) => !dismissedIds.has(e.id) && e.score >= 30 && e.bucket !== "handled").length,
              }}
              boardCounts={emailsByTopic.byTopic}
              view={view}
              setView={handleSetView}
              onCollapse={() => setSidebarOpen(false)}
              lastSyncedAt={lastSyncedAt}
              now={now}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 h-full overflow-y-auto relative z-10">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed top-3 left-3 z-30 rounded-md p-2 bg-[#FFFCF3] dark:bg-[#25201A]border border-[#E6DCC4] dark:border-[#3A3127] text-[#766E63] dark:text-[#A89F92] hover:text-[#2A2520] dark:text-[#FBF4DF] shadow-sm"
            title="Open menu"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        {/* Floating Ask Oushi pill — Spotlight-style search trigger */}
        {!askOpen && (
          <div className="fixed top-3 right-3 z-30 flex items-center gap-2">
            <button
              onClick={() => setAskOpen(true)}
              className="group flex items-center gap-2.5 pl-3.5 pr-2 py-1.5 rounded-full bg-[#FFFCF3]/90 backdrop-blur-md border border-[#E6DCC4] dark:border-[#3A3127] hover:border-[#5E8FBF] text-[#766E63] dark:text-[#A89F92] hover:text-[#3D6A95] shadow-[0_4px_24px_-4px_rgba(42,37,32,0.12)] hover:shadow-[0_8px_32px_-4px_rgba(94,143,191,0.25)] transition-all"
              title="Ask Oushi (⌘K)"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#5E8FBF]" />
              <span className="text-[13px] font-medium">Ask Oushi anything</span>
              <kbd className="text-[10px] font-mono text-[#A89F92] bg-[#FAF6EB] rounded px-1.5 py-0.5 border border-[#E6DCC4] dark:border-[#3A3127]group-hover:border-[#5E8FBF]/30">⌘K</kbd>
            </button>
            <button
              onClick={() => setKbdHelpOpen(true)}
              title="Keyboard shortcuts (?)"
              className="w-7 h-7 rounded-full bg-[#FFFCF3]/90 backdrop-blur-md border border-[#E6DCC4] dark:border-[#3A3127] hover:border-[#5E8FBF] text-[#A89F92] hover:text-[#3D6A95] text-[12.5px] font-mono shadow-[0_4px_24px_-4px_rgba(42,37,32,0.12)] flex items-center justify-center transition-all"
              aria-label="Keyboard shortcuts"
            >
              ?
            </button>
          </div>
        )}

        {/* Mobile-only top bar (when sidebar is closed) — gives breathing room for the floating menu button */}
        {isMobile && !sidebarOpen && <div className="h-12" />}

        {error && (
          <div className="mx-8 mt-6 flex items-center justify-between gap-3 rounded-lg border border-[#B86B4A]/30 bg-[#F5E8E0]/50 dark:bg-[#3A2F23]/40 dark:border-[#D9956E]/30 px-4 py-2.5 text-[13px] text-[#B86B4A] dark:text-[#D9956E]">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Inbox health banner — explains "all buckets empty" honestly.
            Auto-rank is already firing for "all_unranked", so the banner
            here is for the slower failure modes (partial rank, low scores,
            or "everything is dismissed because Gmail archive flows through"). */}
        {diagnosis &&
          !reranking &&
          !undismissing &&
          (diagnosis.diagnosis === "mostly_unranked" ||
            diagnosis.diagnosis === "low_scores" ||
            diagnosis.diagnosis === "all_dismissed" ||
            diagnosis.diagnosis === "mostly_dismissed") && (
            <div className="mx-8 mt-6 rounded-xl border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3]/70 dark:bg-[#25201A]/70 dark:border-[#3A3127] px-5 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[14px] text-[#2A2520] dark:text-[#FBF4DF] mb-1"
                    style={{
                      fontFamily: "var(--font-source-serif), Georgia, serif",
                    }}
                  >
                    {diagnosis.diagnosis === "mostly_unranked"
                      ? `${diagnosis.unranked_14d} of ${diagnosis.total_14d} emails still need to be ranked.`
                      : diagnosis.diagnosis === "all_dismissed" ||
                          diagnosis.diagnosis === "mostly_dismissed"
                        ? `${diagnosis.dismissed_14d} of ${diagnosis.total_14d} emails are marked dismissed.`
                        : `${diagnosis.total_14d} emails synced — none scored as urgent.`}
                  </p>
                  <p className="text-[12px] text-[#766E63] dark:text-[#A89F92] leading-relaxed">
                    {diagnosis.diagnosis === "mostly_unranked"
                      ? "Ranking ran but didn't finish — probably timed out. One re-rank should sort it."
                      : diagnosis.diagnosis === "all_dismissed" ||
                          diagnosis.diagnosis === "mostly_dismissed"
                        ? "Oushi treats Gmail archive as dismiss — so anything you archived in Gmail vanishes from these views, even high-priority threads. Click Resurface to clear that flag for scored emails in the last 14 days."
                        : "Either your inbox is genuinely calm, or Oushi doesn't know what matters to you yet. Re-rank with your current profile, or add interests in Settings → Profile to teach it."}
                  </p>
                </div>
                {(diagnosis.diagnosis === "all_dismissed" ||
                  diagnosis.diagnosis === "mostly_dismissed") ? (
                  <button
                    onClick={resurfaceDismissed}
                    disabled={undismissing}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#B86B4A] to-[#A65B3F] px-3 py-1.5 text-[12px] font-medium text-white hover:from-[#A65B3F] hover:to-[#9C523A] transition-all disabled:opacity-60"
                    style={{
                      boxShadow:
                        "0 2px 8px -2px rgba(184,107,74,0.30)",
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    Resurface
                  </button>
                ) : (
                  <button
                    onClick={manualRerank}
                    disabled={reranking}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#B86B4A] to-[#A65B3F] px-3 py-1.5 text-[12px] font-medium text-white hover:from-[#A65B3F] hover:to-[#9C523A] transition-all disabled:opacity-60"
                    style={{
                      boxShadow:
                        "0 2px 8px -2px rgba(184,107,74,0.30)",
                    }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-rank now
                  </button>
                )}
              </div>
            </div>
          )}

        {/* Auto-rank in progress — visible feedback while the diagnose
            useEffect's defensive re-rank is firing. */}
        {reranking && (
          <div className="mx-8 mt-6 rounded-xl border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3]/70 dark:bg-[#25201A]/70 dark:border-[#3A3127] px-5 py-3.5 flex items-center gap-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86B4A]" />
            <p className="text-[13px] text-[#3F362C] dark:text-[#E8D9B8]">
              Ranking your inbox — this takes about a minute on first run.
            </p>
          </div>
        )}

        {undismissing && (
          <div className="mx-8 mt-6 rounded-xl border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3]/70 dark:bg-[#25201A]/70 dark:border-[#3A3127] px-5 py-3.5 flex items-center gap-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86B4A]" />
            <p className="text-[13px] text-[#3F362C] dark:text-[#E8D9B8]">
              Resurfacing dismissed emails…
            </p>
          </div>
        )}

        {/* Spotlight-style chat overlay */}
        <AskSpotlight
          open={askOpen}
          onClose={() => setAskOpen(false)}
          messages={askMessages}
          input={askInput}
          setInput={setAskInput}
          loading={askLoading}
          onSend={sendAsk}
          onClear={resetChat}
          actionCtx={actionCtx}
          recentThreads={recentThreads}
          onLoadThread={loadThread}
          onDeleteThread={deleteThread}
        />
        {/* View content */}
        <ErrorBoundary label="View content">
          {view.type === "today" && todayMode === "narrative" && (
            <NarrativeToday
              onOpenSpotlight={(initialPrompt) => {
                if (initialPrompt) setAskInput(initialPrompt);
                setAskOpen(true);
              }}
              onOpenEmail={(id) => {
                const found = allEmails.find((e) => e.id === id);
                if (found) setSelectedEmail(found);
              }}
              onOpenCommitments={() => setView({ type: "promises" })}
              onDismissEmail={(id) => actionCtx.dismiss && actionCtx.dismiss(id)}
            />
          )}
          {view.type === "today" && todayMode === "classic" && (
            <TodayOushi
              onOpenSpotlight={(initialPrompt) => {
                if (initialPrompt) setAskInput(initialPrompt);
                setAskOpen(true);
              }}
              onOpenEmail={(id) => {
                const found = allEmails.find((e) => e.id === id);
                if (found) setSelectedEmail(found);
              }}
              onOpenCommitments={() => setView({ type: "promises" })}
            />
          )}
          {view.type === "urgent" && (
            <ListView
              title="Urgent"
              subtitle="High-priority email sitting unread"
              icon={<AlertCircle className="w-4 h-4" />}
              accent="terracotta"
              emails={visible.urgent}
              onOpen={setSelectedEmail}
              now={now}
              emptyMessage="Nothing urgent. Nice."
              focusedEmailId={focusedEmailId}
            />
          )}
          {view.type === "awaiting" && (
            <ListView
              title="Awaiting your reply"
              subtitle="You've seen these but haven't written back"
              icon={<CornerDownLeft className="w-4 h-4" />}
              accent="sky"
              emails={visible.awaiting}
              onOpen={setSelectedEmail}
              now={now}
              emptyMessage="No replies pending."
              focusedEmailId={focusedEmailId}
            />
          )}
          {view.type === "following" && (
            <ListView
              title="Following up"
              subtitle="You wrote last and they've gone quiet"
              icon={<Clock className="w-4 h-4" />}
              accent="ink"
              emails={visible.following}
              onOpen={setSelectedEmail}
              now={now}
              emptyMessage="No threads need a nudge."
              focusedEmailId={focusedEmailId}
            />
          )}
          {view.type === "reference" && (
            <ListView
              title="Worth keeping"
              subtitle="Receipts, confirmations, things to remember"
              icon={<Archive className="w-4 h-4" />}
              accent="muted"
              emails={visible.reference}
              onOpen={setSelectedEmail}
              now={now}
              emptyMessage="Nothing saved yet."
              focusedEmailId={focusedEmailId}
            />
          )}
          {view.type === "untagged" && (
            <ListView
              title="Untagged"
              subtitle="Doesn't match any board"
              icon={<Inbox className="w-4 h-4" />}
              accent="muted"
              emails={emailsByTopic.untagged}
              onOpen={setSelectedEmail}
              now={now}
              emptyMessage="Everything is sorted."
              focusedEmailId={focusedEmailId}
            />
          )}
          {view.type === "promises" && <PromisesView />}
          {view.type === "board" && (() => {
            const topic = topics.find((t) => t.id === view.id);
            if (!topic) return null;
            return (
              <BoardView
                topic={topic}
                emails={emailsByTopic.byTopic.get(topic.name) || []}
                onOpen={setSelectedEmail}
                onDelete={() => deleteTopic(topic.id)}
                onRename={(n) => renameTopic(topic.id, n)}
                onRematch={triggerRematch}
                rematching={rematching}
                now={now}
                focusedEmailId={focusedEmailId}
              />
            );
          })()}
        </ErrorBoundary>

        {/* Add board prompt — show on every view at the bottom of Today */}
      </main>

      {/* Add board modal */}
      <AnimatePresence>
        {showAddTopic && (
          <AddTopicModal
            onClose={() => { setShowAddTopic(false); setNewTopicName(""); }}
            onSubmit={(name) => addTopic(name)}
            value={newTopicName}
            setValue={setNewTopicName}
            adding={adding}
            suggested={suggested.slice(0, 6)}
            onUseSuggestion={(s) => addTopic(s.name, s.description, s.color)}
          />
        )}
      </AnimatePresence>

      {/* Floating add-board button if no topics yet */}
      {topics.length < 10 && (
        <button
          onClick={() => setShowAddTopic(true)}
          className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-30 inline-flex items-center gap-2 rounded-full bg-[#5E8FBF] px-4 py-2.5 text-[13px] font-medium text-white shadow-lg hover:bg-[#4A7AAB] transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New board</span>
        </button>
      )}

      {/* Email panel */}
      <ErrorBoundary label="Email panel">
        <EmailPanel
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onFeedback={handleFeedback}
          onDismiss={handleDismiss}
          now={now}
        />
      </ErrorBoundary>

      {/* Keyboard shortcut help — opens with "?" */}
      <KeyboardHelp open={kbdHelpOpen} onClose={() => setKbdHelpOpen(false)} />

      {/* Feedback system — modal, periodic prompt, and a sidebar item.
          The sidebar item lives inside Sidebar/SidebarFooter; this
          mounts the controllers at the page root. */}
      <FeedbackModal />
      <FeedbackPrompt />

      {totalEmails === 0 && view.type === "today" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Inbox className="w-10 h-10 text-[#A89F92] mx-auto mb-3" />
            <p className="text-[14px] text-[#766E63] dark:text-[#A89F92]">First sync in progress…</p>
          </div>
        </div>
      )}

      {/* Unused profile var to keep types happy */}
      {profile && feedbackCount >= 0 && <span className="hidden" />}
    </div>
  );
}

// ====== HELPERS ======

function ageString(received: string, now: Date): string {
  const diffMs = now.getTime() - new Date(received).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(received).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatAgoShort(mins: number): string {
  if (mins < 1) return "now";
  if (mins < 60) return `${Math.floor(mins)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

function scoreShade(score: number): { bg: string; text: string; ring: string } {
  if (score >= 90) return { bg: "bg-[#3D6A95]", text: "text-white", ring: "ring-[#3D6A95]/20" };
  if (score >= 70) return { bg: "bg-[#5E8FBF]", text: "text-white", ring: "ring-[#5E8FBF]/20" };
  if (score >= 50) return { bg: "bg-[#D0E1F0]", text: "text-[#3D6A95]", ring: "ring-[#5E8FBF]/15" };
  if (score >= 30) return { bg: "bg-[#F0E9D6]", text: "text-[#766E63] dark:text-[#A89F92]", ring: "ring-[#E6DCC4]" };
  return { bg: "bg-[#F0E9D6]/60", text: "text-[#A89F92]", ring: "ring-[#E6DCC4]/50" };
}

/**
 * Reading-mode body. Source-Serif typography, generous line-height,
 * collapsible after a few paragraphs if the email is long.
 */
function ReadableBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!body || !body.trim()) {
    return (
      <p className="text-[13px] italic text-[#A89F92]">
        No preview available — open in Gmail to see the original.
      </p>
    );
  }
  const cleaned = cleanEmailBody(body);
  const isLong = cleaned.length > 1200;
  const visible = expanded ? cleaned : cleaned.slice(0, 1200);

  return (
    <div>
      <div
        className="text-[14.5px] leading-[1.7] text-[#2A2520] dark:text-[#FBF4DF] whitespace-pre-wrap break-words"
        style={{ fontFamily: "var(--font-source-serif), Georgia, serif", maxWidth: "62ch" }}
      >
        {cleanAndRender(visible)}
        {isLong && !expanded && (
          <span className="text-[#A89F92]">… </span>
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-3 text-[12px] font-medium text-[#3D6A95] hover:text-[#5E8FBF] transition-colors"
        >
          {expanded ? "Show less" : "Show full email"}
        </button>
      )}
    </div>
  );
}

/**
 * Clean up plain-text email body for readable rendering:
 * - Strip bracket-style image refs like [https://...png]
 * - Collapse 3+ newlines into 2
 * - Trim Unicode invisibles + zero-width chars that show as boxes
 * - Drop very long no-space "token" strings (Stripe/Mailchimp tracking blobs)
 */
function cleanEmailBody(raw: string): string {
  if (!raw) return "";
  let s = raw;
  // Strip [https://...png] / [https://...jpg] image refs entirely
  s = s.replace(/\[https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)\S*\]/gi, "");
  // Strip zero-width / invisible Unicode that renders as boxes (͏, ‌, ‍, etc)
  s = s.replace(/[​-‏‪- ⁠-⁯﻿͏͙͡็‎‏]/g, "");
  // Collapse runs of repeated whitespace except newlines
  s = s.replace(/[ \t]+/g, " ");
  // Collapse 3+ newlines into exactly 2
  s = s.replace(/\n{3,}/g, "\n\n");
  // Drop "no-space" tokens longer than 40 chars that aren't a URL (tracking blobs)
  s = s.replace(/(?<![\w\-.])([A-Za-z0-9\-_]{60,})(?![\w\-.])/g, (token) =>
    token.length > 80 ? "" : token
  );
  return s.trim();
}

/**
 * Render text with URLs converted to compact pill-style links.
 * Long URLs are shown as their domain + "↗" rather than the full URL,
 * so a Stripe invoice link doesn't take 3 lines on screen.
 */
function cleanAndRender(text: string): React.ReactNode[] {
  if (!text) return [];
  const cleaned = cleanEmailBody(text);
  // Capture URL and the parenthetical wrapping if present
  const urlRegex = /(https?:\/\/[^\s)<>"']+|www\.[^\s)<>"']+)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = urlRegex.exec(cleaned)) !== null) {
    if (m.index > lastIdx) parts.push(cleaned.slice(lastIdx, m.index));
    const url = m[0];
    const href = url.startsWith("http") ? url : `https://${url}`;
    let label = url;
    // For URLs longer than 40 chars, show just the domain as the label
    if (url.length > 40) {
      try {
        const parsed = new URL(href);
        label = parsed.hostname.replace(/^www\./, "");
      } catch {
        label = url.slice(0, 32) + "…";
      }
    }
    parts.push(
      <a
        key={`l${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-[#3D6A95] underline underline-offset-2 hover:text-[#5E8FBF] decoration-[#5E8FBF]/30 break-all"
      >
        {label}
        {url.length > 40 && <ExternalLink className="w-2.5 h-2.5 shrink-0" />}
      </a>
    );
    lastIdx = m.index + url.length;
  }
  if (lastIdx < cleaned.length) parts.push(cleaned.slice(lastIdx));
  return parts;
}

// ====== SIDEBAR ======

function Sidebar({
  userEmail,
  userAvatar,
  userName,
  topics,
  counts,
  boardCounts,
  view,
  setView,
  onCollapse,
  lastSyncedAt,
  now,
}: {
  userEmail: string;
  userAvatar?: string | null;
  userName?: string | null;
  topics: Topic[];
  counts: { urgent: number; awaiting: number; following: number; reference: number; untagged: number; promises: number; total: number };
  boardCounts: Map<string, Classified[]>;
  view: ViewKey;
  setView: (v: ViewKey) => void;
  onCollapse: () => void;
  lastSyncedAt: string | null;
  now: Date;
}) {
  const syncFresh = lastSyncedAt && (now.getTime() - new Date(lastSyncedAt).getTime()) / 60000 < 10;

  return (
    <div
      className="sidebar-bg h-full flex flex-col relative"
      style={{ width: 260 }}
    >
      {/* Top: logo + collapse — serif wordmark, more breathing room.
          Logo is a button (not a Link) so clicking it from within the
          dashboard just resets the view to Today instead of triggering
          a full route navigation (which used to cause a skeleton flash). */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <button
          onClick={() => setView({ type: "today" })}
          className="flex items-center gap-2.5 group"
          title="Go to Today"
        >
          <OushiMark size={26} />
          <span
            className="text-[19px] tracking-[-0.012em] text-[#2A2520] dark:text-[#FBF4DF] group-hover:text-[#B86B4A] transition-colors font-medium"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            Oushi
          </span>
        </button>
        <button
          onClick={onCollapse}
          className="text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] p-1.5 rounded-md hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] transition-colors"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Subtle gradient divider — softer than a hard border */}
      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-[#E6DCC4] to-transparent" />

      {/* Nav — minimal AI-first layout. Bucket views are tucked behind
          a "More views" toggle so they don't compete with the dashboard. */}
      <SidebarNav
        view={view}
        setView={setView}
        counts={counts}
        topics={topics}
        boardCounts={boardCounts}
      />

      {/* Bottom: avatar + tappable sync indicator + settings */}
      <SidebarFooter
        userEmail={userEmail}
        userAvatar={userAvatar}
        userName={userName}
        syncFresh={!!syncFresh}
        lastSyncedAt={lastSyncedAt}
        now={now}
      />
    </div>
  );
}

function SidebarFooter({
  userEmail,
  userAvatar,
  userName,
  syncFresh,
  lastSyncedAt,
  now,
}: {
  userEmail: string;
  userAvatar?: string | null;
  userName?: string | null;
  syncFresh: boolean;
  lastSyncedAt: string | null;
  now: Date;
}) {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const displayName = userName || userEmail;
  const initial = (userName?.[0] || userEmail[0] || "?").toUpperCase();
  const showImage = !!userAvatar && !imgFailed;

  const triggerSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      if (res.ok) {
        toast.success("Inbox synced", { detail: "Pulling latest emails…" });
        // Refresh state so any new emails surface
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.error("Sync failed");
      }
    } catch {
      toast.error("Couldn't reach the sync");
    } finally {
      setSyncing(false);
    }
  };

  const ageLabel = lastSyncedAt
    ? `${formatAgoShort((now.getTime() - new Date(lastSyncedAt).getTime()) / 60000)} ago`
    : "pending";

  return (
    <div className="p-3">
      {/* Soft gradient divider above the footer */}
      <div className="mx-2 h-px bg-gradient-to-r from-transparent via-[#E6DCC4] to-transparent mb-3" />

      {/* Report-bug row — lives ABOVE the user card so the launcher is
          inline with the sidebar's other interaction targets, not a
          floating button that covers the user's name. */}
      <div className="mb-2">
        <ReportBugItem />
      </div>

      <div
        className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-[#FFFCF3]/60 dark:bg-[#25201A]/60"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 3px rgba(106,76,38,0.05)",
        }}
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F2DDD0] to-[#E8DDC9] flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-white/60">
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userAvatar!}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={() => setImgFailed(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-[12px] font-semibold text-[#7A5A36]">
              {initial}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[12.5px] font-medium text-[#2A2520] dark:text-[#FBF4DF] truncate leading-tight"
            title={userEmail}
          >
            {displayName}
          </p>
          <button
            onClick={triggerSync}
            disabled={syncing}
            title={syncing ? "Syncing…" : "Click to sync now"}
            className="mt-0.5 inline-flex items-center gap-1.5 text-[10.5px] text-[#A89F92] hover:text-[#B86B4A] transition-colors disabled:cursor-wait"
          >
            {syncing ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin text-[#B86B4A]" />
            ) : (
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  syncFresh ? "bg-[#6B8E68] animate-pulse" : "bg-[#C9BFAA]"
                }`}
              />
            )}
            <span>{syncing ? "syncing…" : syncFresh ? "live" : ageLabel}</span>
          </button>
        </div>
        <Link
          href="/settings"
          title="Settings"
          className="text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] p-1.5 rounded-md hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] transition-colors"
        >
          <Settings className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

function SidebarNav({
  view,
  setView,
  counts,
  topics,
  boardCounts,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  counts: { urgent: number; awaiting: number; following: number; reference: number; untagged: number; promises: number; total: number };
  topics: Topic[];
  boardCounts: Map<string, Classified[]>;
}) {
  // Auto-expand if the user is already on a non-Today view so they're not
  // confused about where their current page disappeared to.
  const onNonPrimaryView =
    view.type !== "today" && view.type !== "promises";
  const [expanded, setExpanded] = useState(onNonPrimaryView);

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {/* Primary — the two views every user uses constantly */}
      <NavItem
        icon={<Sparkles className="w-3.5 h-3.5" />}
        label="Today"
        active={view.type === "today"}
        onClick={() => setView({ type: "today" })}
      />
      <NavItem
        icon={<Handshake className="w-3.5 h-3.5" />}
        label="Promises"
        count={counts.promises}
        countColor="sky"
        active={view.type === "promises"}
        onClick={() => setView({ type: "promises" })}
      />

      {/* More views — bucket nav tucked away */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="mt-5 w-full flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10.5px] text-[#A89F92] hover:text-[#766E63] dark:text-[#A89F92] transition-colors group"
      >
        <ChevronRight
          className={`w-2.5 h-2.5 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span
          className="italic text-[#A89F92] group-hover:text-[#766E63] dark:text-[#A89F92] transition-colors"
          style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
        >
          {expanded ? "Fewer views" : "More views"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="more"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-1">
              <NavItem
                icon={<CircleDot className="w-3.5 h-3.5 text-[#B86B4A]" />}
                label="Urgent"
                count={counts.urgent}
                countColor="terracotta"
                active={view.type === "urgent"}
                onClick={() => setView({ type: "urgent" })}
              />
              <NavItem
                icon={<CornerDownLeft className="w-3.5 h-3.5" />}
                label="Awaiting reply"
                count={counts.awaiting}
                countColor="sky"
                active={view.type === "awaiting"}
                onClick={() => setView({ type: "awaiting" })}
              />
              <NavItem
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Following up"
                count={counts.following}
                countColor="ink"
                active={view.type === "following"}
                onClick={() => setView({ type: "following" })}
              />
              <NavItem
                icon={<Archive className="w-3.5 h-3.5" />}
                label="Worth keeping"
                count={counts.reference}
                active={view.type === "reference"}
                onClick={() => setView({ type: "reference" })}
              />

              {/* Boards — also semi-hidden */}
              {topics.length > 0 && (
                <>
                  <SectionLabel className="mt-5">Boards</SectionLabel>
                  {topics.map((t) => (
                    <NavItem
                      key={t.id}
                      icon={<Hash className="w-3.5 h-3.5" />}
                      label={t.name}
                      count={(boardCounts.get(t.name) || []).length}
                      active={view.type === "board" && view.id === t.id}
                      onClick={() => setView({ type: "board", id: t.id })}
                      dot={t.color || "#A89F92"}
                    />
                  ))}
                </>
              )}

              {counts.untagged > 0 && (
                <NavItem
                  icon={<Inbox className="w-3.5 h-3.5" />}
                  label="Untagged"
                  count={counts.untagged}
                  active={view.type === "untagged"}
                  onClick={() => setView({ type: "untagged" })}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`px-3 mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#A89F92] ${className}`}
    >
      {children}
    </p>
  );
}

function NavItem({
  icon,
  label,
  count,
  countColor,
  active,
  onClick,
  dot,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  countColor?: "terracotta" | "sky" | "ink";
  active: boolean;
  onClick: () => void;
  /** Optional CSS color for a small leading dot — used by Boards */
  dot?: string;
}) {
  const countClass =
    countColor === "terracotta"
      ? "text-[#B86B4A]"
      : countColor === "ink"
        ? "text-[#3D6A95]"
        : "text-[#766E63] dark:text-[#A89F92]";
  return (
    <button
      onClick={onClick}
      className={`group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] mb-0.5 transition-all ${
        active
          ? "text-[#2A2520] dark:text-[#FBF4DF] font-medium"
          : "text-[#766E63] dark:text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF]"
      }`}
    >
      {/* Sliding active pill — framer-motion layoutId animates it between
          NavItems for that Linear-style fluid feel. */}
      {active && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-lg bg-[#FBF4DF]"
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 3px rgba(106,76,38,0.06)",
          }}
          transition={{ type: "spring", stiffness: 480, damping: 36 }}
        />
      )}
      {/* Subtle hover wash — sits below the active pill */}
      {!active && (
        <span className="absolute inset-0 rounded-lg bg-[#FAF6EB]/0 group-hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] transition-colors" />
      )}

      {/* Content (above the pill) */}
      <span
        className={`relative shrink-0 ${
          active ? "text-[#B86B4A]" : "text-[#A89F92] group-hover:text-[#766E63] dark:text-[#A89F92]"
        } transition-colors`}
      >
        {dot ? (
          <span
            className="block w-2 h-2 rounded-full"
            style={{ backgroundColor: dot }}
          />
        ) : (
          icon
        )}
      </span>
      <span className="relative flex-1 text-left truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`relative text-[11px] font-mono font-medium tabular-nums ${
            active ? "text-[#3F362C] dark:text-[#E8D9B8]" : countClass
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}


// ====== LIST VIEW ======

function ListView({
  title,
  subtitle,
  icon,
  accent,
  emails,
  onOpen,
  now,
  emptyMessage,
  focusedEmailId,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: "terracotta" | "sky" | "ink" | "muted";
  emails: Classified[];
  onOpen: (e: Classified) => void;
  now: Date;
  emptyMessage: string;
  focusedEmailId?: string | null;
}) {
  const accentText = accent === "terracotta" ? "text-[#B86B4A]" : accent === "ink" ? "text-[#3D6A95]" : accent === "sky" ? "text-[#5E8FBF]" : "text-[#766E63] dark:text-[#A89F92]";
  const accentBg = accent === "terracotta" ? "bg-[#F5E8E0]" : accent === "muted" ? "bg-[#F0E9D6]" : "bg-[#D0E1F0]";

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-6 sm:py-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <div className={`w-7 h-7 rounded-md ${accentBg} flex items-center justify-center ${accentText}`}>
          {icon}
        </div>
        <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
        <span className="text-[16px] text-[#A89F92] font-mono">{emails.length}</span>
      </div>
      <p className="text-[13px] text-[#766E63] dark:text-[#A89F92] mb-6 ml-10">{subtitle}</p>

      {emails.length === 0 ? (
        <FeedbackEmptyState
          icon={Inbox}
          tone="sage"
          title={emptyMessage}
          body="Oushi is watching the inbox. I'll surface anything new in this view as it comes."
        />
      ) : (
        <Card>
          <div className="divide-y divide-[#E6DCC4]/60">
            {emails.map((e) => (
              <EmailRow
                key={e.id}
                email={e}
                now={now}
                onOpen={onOpen}
                focused={focusedEmailId === e.id}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ====== BOARD VIEW ======

function BoardView({
  topic,
  emails,
  onOpen,
  onDelete,
  onRename,
  onRematch,
  rematching,
  now,
  focusedEmailId,
}: {
  topic: Topic;
  emails: Classified[];
  onOpen: (e: Classified) => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
  onRematch: () => void;
  rematching: boolean;
  now: Date;
  focusedEmailId?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(topic.name);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-6 sm:py-8 max-w-4xl">
      <div className="flex items-start justify-between mb-2 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-5 h-5 text-[#5E8FBF]" />
            {editing ? (
              <form
                onSubmit={(e) => { e.preventDefault(); onRename(editName); setEditing(false); }}
                className="flex-1"
              >
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => { setEditing(false); setEditName(topic.name); }}
                  maxLength={40}
                  className="w-full text-[24px] font-semibold tracking-tight bg-transparent border-b border-[#5E8FBF]/40 outline-none text-[#2A2520] dark:text-[#FBF4DF]"
                />
              </form>
            ) : (
              <h1 className="text-[24px] font-semibold tracking-tight truncate">{topic.name}</h1>
            )}
            <span className="text-[16px] text-[#A89F92] font-mono shrink-0">{emails.length}</span>
          </div>
          {topic.description && !editing && (
            <p className="text-[13px] text-[#766E63] dark:text-[#A89F92] ml-7">{topic.description}</p>
          )}
        </div>
        <div className="relative shrink-0 flex items-center gap-1">
          <button
            onClick={onRematch}
            disabled={rematching}
            title="Re-sort emails into boards"
            className="text-[11px] font-medium text-[#A89F92] hover:text-[#3D6A95] inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${rematching ? "animate-spin" : ""}`} />
            {rematching ? "Re-sorting" : "Re-sort"}
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-[#A89F92] hover:text-[#2A2520] dark:text-[#FBF4DF] p-1.5 rounded transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-32 rounded-md border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] shadow-lg overflow-hidden z-20">
              <button
                onClick={() => { setEditing(true); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-[#2A2520] dark:text-[#FBF4DF] hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] text-left"
              >
                <Pencil className="w-3 h-3" />Rename
              </button>
              <button
                onClick={() => { onDelete(); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-[#B86B4A] hover:bg-[#F5E8E0]/50 text-left"
              >
                <Trash2 className="w-3 h-3" />Delete board
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        {emails.length === 0 ? (
          <Card>
            <div className="px-5 py-12 text-center">
              <p className="text-[14px] text-[#2A2520] dark:text-[#FBF4DF] mb-1">No matches yet.</p>
              <p className="text-[12px] text-[#766E63] dark:text-[#A89F92]">Oushi will route emails here as they arrive.</p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-[#E6DCC4]/60">
              {emails.map((e) => (
                <EmailRow
                  key={e.id}
                  email={e}
                  now={now}
                  onOpen={onOpen}
                  focused={focusedEmailId === e.id}
                />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ====== EMAIL ROW ======

function EmailRow({
  email,
  now,
  onOpen,
  focused = false,
}: {
  email: Classified;
  now: Date;
  onOpen: (e: Classified) => void;
  /** Highlighted because the keyboard cursor (J/K) is on this row */
  focused?: boolean;
}) {
  const ageText = ageString(email.received_at, now);
  const score = scoreShade(email.score);
  const [voted, setVoted] = useState<"up" | "down" | null>(null);

  const sendFeedback = async (signal: "upvote" | "downvote") => {
    if (voted) return;
    setVoted(signal === "upvote" ? "up" : "down");
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: email.id, signal }),
      });
    } catch {
      // Non-fatal — keep the optimistic state
    }
  };

  return (
    <div
      id={`email-row-${email.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(email)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(email);
        }
      }}
      className={`group relative flex w-full items-start gap-3 text-left px-4 py-3 transition-colors cursor-pointer ${
        focused
          ? "bg-[#D0E1F0]/40 ring-1 ring-[#5E8FBF]/40 ring-inset"
          : "hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520]/60"
      }`}
    >
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${score.bg} ${score.text} text-[11px] font-semibold mt-0.5 ring-1 ${score.ring}`}>
        {email.score}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className={`truncate text-[13px] ${email.is_unread ? "font-semibold text-[#2A2520] dark:text-[#FBF4DF]" : "font-medium text-[#766E63] dark:text-[#A89F92]"}`}>
            {email.from_name || email.from_email}
          </span>
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-[#A89F92] font-mono tabular-nums">
            {email.has_attachments && (
              <span title="Has attachments" className="text-[#5E8FBF]">📎</span>
            )}
            {ageText}
          </span>
        </div>
        <p className={`truncate text-[13px] ${email.is_unread ? "text-[#2A2520] dark:text-[#FBF4DF]" : "text-[#766E63] dark:text-[#A89F92]"} leading-snug`}>
          {email.subject}
        </p>
        {email.highlight && (
          <p className="mt-1 text-[12px] text-[#3D6A95] line-clamp-1 leading-snug flex items-start gap-1">
            <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-[#5E8FBF]" />
            <span className="truncate">{email.highlight}</span>
          </p>
        )}
        {(email.matched_interests || []).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {(email.matched_interests || []).slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] text-[#5E8FBF] bg-[#D0E1F0]/40 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Inline feedback — appears on hover. Lets the user correct Oushi's
          ranking with one tap, which immediately updates score + sender rep. */}
      <div
        className={`absolute right-3 top-3 flex items-center gap-1 transition-opacity ${
          voted ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {voted === null && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                sendFeedback("upvote");
              }}
              className="p-1 rounded-md text-[#A89F92] hover:text-[#6B8E68] hover:bg-[#E8EFE5]/60 transition-colors"
              title="More like this"
              aria-label="More like this"
            >
              <ThumbsUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                sendFeedback("downvote");
              }}
              className="p-1 rounded-md text-[#A89F92] hover:text-[#B86B4A] hover:bg-[#F5E8E0]/60 transition-colors"
              title="Less like this"
              aria-label="Less like this"
            >
              <ThumbsDown className="w-3 h-3" />
            </button>
          </>
        )}
        {voted === "up" && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E8EFE5] text-[#6B8E68] text-[10.5px] font-medium">
            <Check className="w-2.5 h-2.5" strokeWidth={3} />
            Boosted
          </span>
        )}
        {voted === "down" && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F5E8E0] text-[#B86B4A] text-[10.5px] font-medium">
            <Check className="w-2.5 h-2.5" strokeWidth={3} />
            Muted
          </span>
        )}
      </div>
    </div>
  );
}

// ====== CARD WRAPPER ======

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

// ====== ADD TOPIC MODAL ======

function AddTopicModal({
  onClose,
  onSubmit,
  value,
  setValue,
  adding,
  suggested,
  onUseSuggestion,
}: {
  onClose: () => void;
  onSubmit: (name: string) => void;
  value: string;
  setValue: (v: string) => void;
  adding: boolean;
  suggested: Array<{ name: string; description: string; color: string }>;
  onUseSuggestion: (s: { name: string; description: string; color: string }) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[#2A2520]/40 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#FFFCF3] dark:bg-[#25201A] rounded-lg shadow-2xl border border-[#E6DCC4] dark:border-[#3A3127] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E6DCC4]">
          <h2 className="text-[14px] font-semibold text-[#2A2520] dark:text-[#FBF4DF]">New board</h2>
          <button onClick={onClose} className="text-[#A89F92] hover:text-[#2A2520] dark:text-[#FBF4DF]"><X className="w-4 h-4" /></button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(value); }}
          className="px-5 py-4"
        >
          <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#A89F92] block mb-1.5">
            Name
          </label>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Engineering, Family, Conferences…"
            maxLength={40}
            className="w-full rounded-md border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FAF6EB]/30 dark:bg-[#2A2520]/30 px-3 py-2 text-[14px] text-[#2A2520] dark:text-[#FBF4DF] focus:outline-none focus:border-[#5E8FBF] focus:ring-2 focus:ring-[#5E8FBF]/15"
          />
          <p className="mt-1.5 text-[11px] text-[#A89F92]">
            Oushi will sort matching emails into this board automatically.
          </p>

          {suggested.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#E6DCC4]">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#A89F92] mb-2">
                Or pick a suggestion
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggested.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => onUseSuggestion(s)}
                    disabled={adding}
                    title={s.description}
                    className="inline-flex items-center gap-1 rounded-full border border-[#5E8FBF]/30 bg-[#D0E1F0]/30 px-2.5 py-1 text-[12px] text-[#3D6A95] hover:bg-[#D0E1F0]/60 transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="text-[13px] text-[#766E63] dark:text-[#A89F92] hover:text-[#2A2520] dark:text-[#FBF4DF] px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value.trim() || adding}
              className="rounded-md bg-[#5E8FBF] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#4A7AAB] disabled:opacity-40 transition-colors"
            >
              {adding ? "Adding…" : "Add board"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ====== EMAIL PANEL (side panel desktop, modal mobile) ======

/**
 * Renders the email's ai-suggested next action as an actual button.
 * The model marks each email with a `suggested_action` of a known type;
 * we map that type to a real handler.
 */
function SuggestedActionButton({
  action,
  onOpenDraft,
  onSaveToCal,
  onDismiss,
  gmailUrl,
}: {
  action: {
    label: string;
    type: "reply" | "calendar" | "save" | "open" | "ignore";
    detail: string | null;
  };
  onOpenDraft: () => void;
  onSaveToCal: () => void;
  onDismiss: () => void;
  gmailUrl: string | null;
}) {
  const handle = () => {
    switch (action.type) {
      case "reply":
        onOpenDraft();
        break;
      case "calendar":
        onSaveToCal();
        break;
      case "open":
        if (gmailUrl) window.open(gmailUrl, "_blank", "noopener,noreferrer");
        break;
      case "ignore":
        onDismiss();
        break;
      case "save":
      default:
        // No-op for now — save isn't implemented as a separate action yet
        break;
    }
  };

  // Pick icon based on type
  const Icon =
    action.type === "reply" ? Sparkles :
    action.type === "calendar" ? Calendar :
    action.type === "ignore" ? Archive :
    action.type === "open" ? ExternalLink :
    Sparkles;

  return (
    <button
      onClick={handle}
      className="w-full mb-5 group flex items-center gap-3 rounded-xl border border-[#5E8FBF]/30 bg-[#FFFCF3] dark:bg-[#25201A] hover:bg-[#D0E1F0]/20 hover:border-[#5E8FBF]/60 px-3.5 py-2.5 text-left transition-all"
    >
      <div className="w-8 h-8 rounded-lg bg-[#D0E1F0] flex items-center justify-center shrink-0 group-hover:bg-[#5E8FBF] group-hover:text-white transition-colors">
        <Icon className="w-3.5 h-3.5 text-[#3D6A95] group-hover:text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#2A2520] dark:text-[#FBF4DF]">{action.label}</p>
        {action.detail && (
          <p className="text-[11.5px] text-[#766E63] dark:text-[#A89F92] truncate">{action.detail}</p>
        )}
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-[#A89F92] group-hover:text-[#3D6A95] transition-colors shrink-0" />
    </button>
  );
}

/**
 * Inline score chip with a tone label — "87 · Critical", "62 · Useful", etc.
 * Replaces the orphaned floating score badge in the email modal header.
 */
function ScorePill({ score }: { score: number }) {
  const shade = scoreShade(score);
  const label =
    score >= 75 ? "Critical" : score >= 40 ? "Useful" : score >= 20 ? "Low" : "Noise";
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${shade.bg} ${shade.text} text-[10.5px] font-semibold ring-1 ${shade.ring}`}
      title={`Oushi score · ${score} of 100`}
    >
      <span className="font-mono tabular-nums">{score}</span>
      <span className="text-[9px] font-medium uppercase tracking-wider opacity-70">
        {label}
      </span>
    </span>
  );
}

function FeedbackButtons({
  emailId,
  onFeedback,
}: {
  emailId: string;
  onFeedback: (id: string, signal: "upvote" | "downvote") => void;
}) {
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  const toast = useToast();

  // Reset when email changes (new modal opens)
  useEffect(() => {
    setVoted(null);
  }, [emailId]);

  const handle = (signal: "upvote" | "downvote") => {
    if (voted) return;
    setVoted(signal === "upvote" ? "up" : "down");
    onFeedback(emailId, signal);
    toast.success(
      signal === "upvote" ? "Boosted" : "Marked less relevant",
      {
        detail:
          signal === "upvote"
            ? "Oushi will surface more like this."
            : "Oushi will quietly hide similar emails.",
      }
    );
  };

  return (
    <div className="mt-3 pt-3 border-t border-[#E6DCC4] dark:border-[#3A3127] flexitems-center gap-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mr-1">
        Train Oushi
      </p>
      <button
        onClick={() => handle("upvote")}
        disabled={voted !== null}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium border transition-all ${
          voted === "up"
            ? "border-[#6B8E68]/40 bg-[#E8EFE5] text-[#4F6B4D] cursor-default"
            : voted === "down"
              ? "border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] text-[#D6CDB8] cursor-not-allowed"
              : "border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] text-[#766E63] dark:text-[#A89F92] hover:border-[#6B8E68] hover:text-[#6B8E68] hover:bg-[#E8EFE5]/40"
        }`}
      >
        {voted === "up" ? (
          <Check className="w-3 h-3" strokeWidth={3} />
        ) : (
          <ThumbsUp className="w-3 h-3" />
        )}
        {voted === "up" ? "Boosted" : "More like this"}
      </button>
      <button
        onClick={() => handle("downvote")}
        disabled={voted !== null}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium border transition-all ${
          voted === "down"
            ? "border-[#B86B4A]/40 bg-[#F5E8E0] text-[#B86B4A] cursor-default"
            : voted === "up"
              ? "border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] text-[#D6CDB8] cursor-not-allowed"
              : "border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] text-[#766E63] dark:text-[#A89F92] hover:border-[#B86B4A] hover:text-[#B86B4A] hover:bg-[#F5E8E0]/40"
        }`}
      >
        {voted === "down" ? (
          <Check className="w-3 h-3" strokeWidth={3} />
        ) : (
          <ThumbsDown className="w-3 h-3" />
        )}
        {voted === "down" ? "Muted similar" : "Not relevant"}
      </button>
    </div>
  );
}

/**
 * Small clickable label chip in the email modal — shows the current Oushi
 * label for this email + lets the user manually correct it. "Manual" badge
 * appears when the user has overridden the heuristic. Selection POSTs to
 * /api/labels/override which immediately re-labels the message in Gmail.
 */
function LabelChip({ email }: { email: Classified }) {
  const toast = useToast();
  // undefined = "auto" (no override row), null = "don't label" override,
  // string = explicit label override
  const [override, setOverride] = useState<OushiLabelKey | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // "Apply to all from sender?" prompt — appears after a user picks a
  // non-auto label, lets them turn the one-off correction into a
  // persistent sender rule with a single click.
  const [senderPromptFor, setSenderPromptFor] = useState<
    OushiLabelKey | "none" | null
  >(null);
  const [savingRule, setSavingRule] = useState(false);

  // Compute the effective label: override wins, else heuristic
  const effective: OushiLabelKey | null =
    override === undefined ? computeLabelForEmail(email) : override;
  const effectiveDef = effective ? getLabelByKey(effective) : null;
  const isManual = override !== undefined;

  // Derive sender pattern for the "apply to all" prompt
  const senderEmail = (email.from_email || "").toLowerCase();
  const senderDomain = senderEmail.includes("@")
    ? senderEmail.slice(senderEmail.indexOf("@") + 1)
    : "";
  // For automated-looking senders (noreply, info, etc.) defaulting to a
  // domain-wide rule is usually what the user actually wants. For
  // human-looking senders, default to email-exact.
  const looksAutomated = /^(noreply|no-reply|info|hello|team|notifications?|alerts?|support|donotreply)@/.test(
    senderEmail
  );
  const defaultPatternType: "email" | "domain" = looksAutomated ? "domain" : "email";

  // Fetch any persisted override for this email when the modal opens
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/labels/override?emailId=${encodeURIComponent(email.id)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        // data.override can be string | null | undefined
        setOverride(data.override);
      } catch {
        // Best-effort — leave at undefined (auto)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email.id]);

  const choose = async (
    value: OushiLabelKey | "none" | "auto",
    reason?: string
  ) => {
    setOpen(false);
    setSaving(true);
    try {
      const res = await fetch("/api/labels/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId: email.id,
          labelKey: value,
          reason: reason || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Couldn't update label");
        return;
      }
      // Update local state to reflect what the server stored
      if (value === "auto") setOverride(undefined);
      else if (value === "none") setOverride(null);
      else setOverride(value);

      // User-friendly confirmation
      if (value === "auto") {
        toast.success("Using Oushi's choice");
      } else if (value === "none") {
        toast.success("Won't label this email");
      } else {
        const def = getLabelByKey(value as OushiLabelKey);
        toast.success(`Labeled "${def?.shortLabel || value}"`);
      }

      // After a non-auto pick that REALLY corrected something (the heuristic
      // was wrong), offer to turn it into a permanent sender rule. Skip
      // for "auto" (the user just reverted, no rule to make) and skip if
      // there's no usable sender email.
      if (value !== "auto" && senderEmail) {
        setSenderPromptFor(value);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  const applySenderRule = async (patternType: "email" | "domain") => {
    if (!senderPromptFor || !senderEmail) return;
    setSavingRule(true);
    const pattern = patternType === "email" ? senderEmail : senderDomain;
    if (!pattern) {
      setSavingRule(false);
      setSenderPromptFor(null);
      return;
    }
    try {
      const res = await fetch("/api/labels/sender-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderPattern: pattern,
          patternType,
          labelKey: senderPromptFor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Couldn't save rule");
        return;
      }
      const def =
        senderPromptFor === "none"
          ? null
          : getLabelByKey(senderPromptFor as OushiLabelKey);
      const label = def?.shortLabel || (senderPromptFor === "none" ? "no label" : "the label");
      const scope = patternType === "domain" ? `@${pattern}` : pattern;
      toast.success(`Always ${label} from ${scope}`, {
        detail: data.affected
          ? `Applied to ${data.affected} email${data.affected === 1 ? "" : "s"}.`
          : undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setSavingRule(false);
      setSenderPromptFor(null);
    }
  };

  return (
    <div className="relative inline-block">
      {/* Helper hint when nothing has been overridden yet — surfaces the
          "wrong label? click here" affordance prominently for testers
          who don't realize the chip is interactive. */}
      {!isManual && !open && !senderPromptFor && (
        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#B86B4A] animate-pulse opacity-0 group-hover:opacity-100 pointer-events-none" />
      )}
      <button
        onClick={() => !saving && setOpen((v) => !v)}
        disabled={saving}
        className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        title="Wrong label? Click to fix."
        style={
          effectiveDef
            ? {
                backgroundColor: effectiveDef.color.backgroundColor,
                color: effectiveDef.color.textColor,
              }
            : { backgroundColor: "#E6DCC4", color: "#766E63" }
        }
      >
        <Tag className="w-3 h-3" />
        <span>{effectiveDef ? effectiveDef.shortLabel : "No label"}</span>
        {isManual && (
          <span
            className="text-[9px] font-mono uppercase tracking-wider opacity-80 ml-0.5 px-1 rounded"
            style={{
              backgroundColor: "rgba(0,0,0,0.18)",
            }}
            title="You manually set this label"
          >
            Manual
          </span>
        )}
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <>
          {/* Click-outside catcher */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg border border-[#E6DCC4] dark:border-[#3A3127] bg-white shadow-lg py-1.5 overflow-hidden">
            <p className="px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.14em] text-[#A89F92]">
              Set label
            </p>
            {OUSHI_LABELS.map((l) => (
              <button
                key={l.key}
                onClick={() => choose(l.key)}
                className={`w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] transition-colors flex items-center gap-2 ${
                  effective === l.key ? "bg-[#FAF6EB]" : ""
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: l.color.backgroundColor }}
                />
                <span className="flex-1 truncate text-[#2A2520] dark:text-[#FBF4DF]">{l.shortLabel}</span>
                {effective === l.key && <Check className="w-3 h-3 text-[#6B8E68]" />}
              </button>
            ))}
            <div className="my-1 border-t border-[#E6DCC4]" />
            <button
              onClick={() => choose("none")}
              className={`w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] transition-colors flex items-center gap-2 ${
                override === null ? "bg-[#FAF6EB]" : ""
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm border border-[#E6DCC4] dark:border-[#3A3127] shrink-0" />
              <span className="flex-1 text-[#766E63] dark:text-[#A89F92]">Don&apos;t label</span>
              {override === null && <Check className="w-3 h-3 text-[#6B8E68]" />}
            </button>
            {isManual && (
              <>
                <div className="my-1 border-t border-[#E6DCC4]" />
                <button
                  onClick={() => choose("auto")}
                  className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] transition-colors flex items-center gap-2 text-[#5E8FBF]"
                >
                  <Sparkles className="w-3 h-3" />
                  <span className="flex-1">Use Oushi&apos;s choice</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* "Apply to all from sender?" prompt — appears after a correction.
          Two paths: domain-wide (catches automated senders) or exact
          email (catches a specific person). Defaults to the sensible
          choice based on whether the sender looks automated. */}
      {senderPromptFor && !open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 w-[300px] rounded-xl border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] p-3"
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.6) inset, 0 12px 32px -10px rgba(106,76,38,0.20)",
          }}
        >
          <p
            className="text-[12.5px] text-[#2A2520] dark:text-[#FBF4DF] leading-snug mb-2"
            style={{
              fontFamily: "var(--font-source-serif), Georgia, serif",
            }}
          >
            Always apply to {looksAutomated ? "this sender's domain" : "this sender"}?
          </p>
          <p className="text-[10.5px] text-[#A89F92] font-mono mb-3">
            {defaultPatternType === "domain"
              ? `*@${senderDomain}`
              : senderEmail}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              disabled={savingRule}
              onClick={() => applySenderRule(defaultPatternType)}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#B86B4A] to-[#A65B3F] px-2.5 py-1 text-[11.5px] font-medium text-white hover:from-[#A65B3F] hover:to-[#9C523A] disabled:opacity-50 transition-all"
              style={{
                boxShadow:
                  "0 2px 6px -2px rgba(184,107,74,0.30)",
              }}
            >
              {savingRule ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Yes, always
            </button>
            {/* Toggle to the OTHER pattern type — gives the user an out
                from the default without making the UI complex */}
            {defaultPatternType === "domain" ? (
              <button
                disabled={savingRule}
                onClick={() => applySenderRule("email")}
                className="text-[11px] text-[#766E63] dark:text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] dark:hover:text-[#FBF4DF] px-2 py-1 transition-colors"
              >
                Just this address
              </button>
            ) : (
              <button
                disabled={savingRule}
                onClick={() => applySenderRule("domain")}
                className="text-[11px] text-[#766E63] dark:text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] dark:hover:text-[#FBF4DF] px-2 py-1 transition-colors"
              >
                Whole @{senderDomain}
              </button>
            )}
            <button
              disabled={savingRule}
              onClick={() => setSenderPromptFor(null)}
              className="text-[11px] text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] dark:hover:text-[#FBF4DF] px-2 py-1 ml-auto transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmailPanel({
  email,
  onClose,
  onFeedback,
  onDismiss,
  now,
}: {
  email: Classified | null;
  onClose: () => void;
  onFeedback: (id: string, signal: "upvote" | "downvote") => void;
  onDismiss: (id: string) => void;
  now: Date;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [notReplyable, setNotReplyable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [savingCal, setSavingCal] = useState(false);
  const [calResult, setCalResult] = useState<{ ok: boolean; htmlLink?: string; message: string } | null>(null);

  useEffect(() => {
    setDraft(null); setDraftError(null); setNotReplyable(false); setCopied(false);
    setSending(false); setSent(false); setSendError(null); setNeedsReauth(false);
    setSavingCal(false); setCalResult(null);
  }, [email?.id]);

  useEffect(() => {
    if (!email) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [email, onClose]);

  // Mark-read in both Oushi AND Gmail when an unread email is opened.
  // Fire-and-forget — the read state propagates within a few hundred ms.
  useEffect(() => {
    if (!email || email.is_read) return;
    fetch(`/api/email/${email.id}/mark-read`, { method: "POST" }).catch(() => {
      // Non-fatal — next sync will reconcile
    });
  }, [email]);

  if (!email) return null;

  const date = new Date(email.received_at);
  const dateLine = date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const gmailUrl = email.gmail_thread_id ? `https://mail.google.com/mail/u/0/#inbox/${email.gmail_thread_id}` : null;
  const body = email.body_preview?.trim() || email.snippet || "";

  const requestDraft = async () => {
    if (draftLoading) return;
    setDraftLoading(true); setDraftError(null); setNotReplyable(false);
    try {
      const res = await fetch(`/api/email/${email.id}/draft-reply`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setDraftError(data.error || "Couldn't draft a reply.");
      else if (data.replyable === false) setNotReplyable(true);
      else setDraft(data.draft || "");
    } catch (e) { setDraftError(e instanceof Error ? e.message : "Network error"); }
    finally { setDraftLoading(false); }
  };

  const copyDraft = () => {
    if (!draft) return;
    navigator.clipboard?.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sendDraft = async () => {
    if (!draft || sending) return;
    setSending(true); setSendError(null); setNeedsReauth(false);
    try {
      const res = await fetch(`/api/email/${email.id}/send-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || "Send failed");
        setNeedsReauth(!!data.needsReauth);
        toast.error("Couldn't send reply", { detail: data.error || `HTTP ${res.status}` });
      } else {
        setSent(true);
        fxComplete();
        const af = data.autoFulfilled || 0;
        toast.success("Reply sent", {
          detail:
            af > 0
              ? `Auto-closed ${af} promise${af === 1 ? "" : "s"} in this thread.`
              : `To ${email.from_name || email.from_email}`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setSendError(msg);
      toast.error("Couldn't send reply", { detail: msg });
    }
    finally { setSending(false); }
  };

  const saveToCal = async () => {
    if (savingCal) return;
    setSavingCal(true); setCalResult(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(`/api/email/${email.id}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      });
      const data = await res.json();
      if (!res.ok) setCalResult({ ok: false, message: data.error || "Couldn't save event" });
      else setCalResult({ ok: true, htmlLink: data.htmlLink, message: `Added "${data.event?.title || "event"}" to calendar.` });
    } catch (e) { setCalResult({ ok: false, message: e instanceof Error ? e.message : "Network error" }); }
    finally { setSavingCal(false); }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-[#2A2520]/30 backdrop-blur-sm"
      />
      <motion.div
        key="panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="modal-panel-bg fixed top-0 right-0 z-50 h-screen w-full sm:w-[580px] border-l border-[#E6DCC4] dark:border-[#3A3127] flex flex-col text-[#2A2520] dark:text-[#FBF4DF]"
        style={{
          boxShadow:
            "-24px 0 60px -20px rgba(106,76,38,0.18), -8px 0 20px -8px rgba(106,76,38,0.10)",
        }}
      >
        {/* Header — softer, gradient divider below */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 shrink-0 relative">
          <button
            onClick={onClose}
            className="text-[#766E63] dark:text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF] inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 rounded-md hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520]/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </button>
          <p className="text-[10.5px] text-[#A89F92] font-mono uppercase tracking-[0.16em]">
            {dateLine}
          </p>
          {gmailUrl && (
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#A89F92] hover:text-[#B86B4A] inline-flex items-center gap-1 transition-colors"
            >
              Gmail <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <div className="absolute bottom-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-[#E6DCC4] to-transparent" />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-7 py-6">
            {/* Sender + score */}
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 ring-1 ring-white/60"
                style={{
                  background:
                    "linear-gradient(135deg, #F2DDD0 0%, #E8DDC9 100%)",
                }}
              >
                <span className="text-[14px] font-semibold text-[#7A5A36]">
                  {(email.from_name || email.from_email || "?")[0]?.toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[14.5px] font-semibold text-[#2A2520] dark:text-[#FBF4DF] truncate">
                    {email.from_name || email.from_email}
                  </p>
                  <ScorePill score={email.score} />
                </div>
                <p
                  className="text-[11.5px] text-[#766E63] dark:text-[#A89F92] truncate font-mono"
                  title={email.from_email}
                >
                  {email.from_email}
                </p>
              </div>
            </div>

            {/* Serif subject — manuscript-feel */}
            <h1
              className="text-[26px] tracking-[-0.012em] text-[#2A2520] dark:text-[#FBF4DF] mb-3 leading-[1.18]"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              {email.subject}
            </h1>

            {/* Oushi label — manually correctable */}
            <div className="mb-5">
              <LabelChip email={email} />
            </div>

            {/* Oushi summary — only if there's a highlight. Warmer terracotta tint */}
            {email.highlight && (
              <div
                className="mb-5 rounded-2xl border border-[#B86B4A]/20 px-4 py-3.5"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(245,232,224,0.45) 0%, rgba(251,244,223,0.30) 100%)",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.5) inset, 0 2px 12px -6px rgba(106,76,38,0.10)",
                }}
              >
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#B86B4A] mb-2 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Oushi
                </p>
                <p
                  className="text-[15px] text-[#3F362C] dark:text-[#E8D9B8] leading-[1.55] italic"
                  style={{
                    fontFamily: "var(--font-source-serif), Georgia, serif",
                  }}
                >
                  {email.highlight}
                </p>
              </div>
            )}

            {/* Suggested action — turns the AI's "Try X" hint into a real button */}
            {email.suggested_action && email.suggested_action.label && (
              <SuggestedActionButton
                action={email.suggested_action}
                onOpenDraft={requestDraft}
                onSaveToCal={saveToCal}
                onDismiss={() => { onDismiss(email.id); onClose(); }}
                gmailUrl={gmailUrl}
              />
            )}

            {/* Attachments — extracted text. For transactional emails this is
                usually the actually-useful content, so it goes ABOVE the noisy
                body. */}
            {email.attachments_text && (
              <div className="mb-6 rounded-xl border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FAF6EB]/40 dark:bg-[#2A2520]/40 p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#5E8FBF] mb-2 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> From the attachment
                </p>
                <pre className="text-[12.5px] leading-[1.6] text-[#2A2520] dark:text-[#FBF4DF] whitespace-pre-wrap break-words font-sans">
                  {email.attachments_text}
                </pre>
              </div>
            )}

            {/* Body — Source Serif for readable email content */}
            <ReadableBody body={body} />

            {/* Calendar */}
            <div className="mt-6">
              {!calResult && (
                <button
                  onClick={saveToCal}
                  disabled={savingCal}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#E6DCC4] dark:border-[#3A3127] bg-transparent px-3 py-2 text-[12px] text-[#766E63] dark:text-[#A89F92] hover:text-[#3D6A95] hover:border-[#5E8FBF]/40 hover:bg-[#FAF6EB] dark:hover:bg-[#2A2520] transition-colors disabled:opacity-50"
                >
                  {savingCal ? <><RefreshCw className="w-3 h-3 animate-spin" />Saving…</> : <><Calendar className="w-3 h-3" />Add to calendar</>}
                </button>
              )}
              {calResult && (
                <div className={`rounded-md border px-3 py-2 flex items-center gap-2 text-[12px] ${calResult.ok ? "border-[#6B8E68]/30 bg-[#E8EFE5]/40 text-[#6B8E68]" : "border-[#B86B4A]/30 bg-[#F5E8E0]/40 text-[#B86B4A]"}`}>
                  {calResult.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  <span className="flex-1">{calResult.message}</span>
                  {calResult.ok && calResult.htmlLink && (
                    <a href={calResult.htmlLink} target="_blank" rel="noopener noreferrer" className="underline">View</a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer: draft reply / actions — warmer, terracotta primary */}
        <div
          className="p-4 shrink-0 max-h-[55%] overflow-y-auto relative"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,252,243,0.4) 0%, rgba(245,232,224,0.25) 100%)",
          }}
        >
          {/* Top gradient divider */}
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[#E6DCC4] to-transparent" />
          {!draft && !notReplyable && !draftLoading && !draftError && (
            <button
              onClick={requestDraft}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#B86B4A] to-[#A65B3F] px-3 py-3 text-[13px] font-medium text-white hover:from-[#A65B3F] hover:to-[#9C523A] transition-all shadow-[0_4px_16px_-4px_rgba(184,107,74,0.30)]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Draft a reply with Oushi
            </button>
          )}

          {draftLoading && (
            <div className="rounded-md bg-[#D0E1F0]/30 px-3 py-2.5 flex items-center gap-2.5">
              <ThinkingDots large />
              <p className="text-[12px] text-[#766E63] dark:text-[#A89F92]">Oushi is drafting…</p>
            </div>
          )}

          {draftError && (
            <div className="rounded-md border border-[#B86B4A]/30 bg-[#F5E8E0]/40 px-3 py-2 text-[12px] text-[#B86B4A] flex items-center justify-between">
              <span>{draftError}</span>
              <button onClick={requestDraft} className="font-medium underline">Try again</button>
            </div>
          )}

          {notReplyable && (
            <div className="rounded-md border border-[#E6DCC4] dark:border-[#3A3127] px-3 py-2 text-[12px] text-[#766E63] dark:text-[#A89F92]">
              This isn&apos;t really replyable — automated notification.
            </div>
          )}

          {draft !== null && !notReplyable && !sent && (
            <div className="rounded-md border border-[#5E8FBF]/30 bg-[#FFFCF3] dark:bg-[#25201A] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[#5E8FBF]/15 bg-[#D0E1F0]/20 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#3D6A95]">Suggested reply</p>
                <button onClick={requestDraft} disabled={sending} className="text-[10px] text-[#766E63] dark:text-[#A89F92] hover:text-[#3D6A95] disabled:opacity-40 uppercase tracking-wider">
                  Regenerate
                </button>
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                disabled={sending}
                className="w-full bg-transparent px-3 py-2 text-[13px] leading-[1.5] text-[#2A2520] dark:text-[#FBF4DF] outline-none resize-y disabled:opacity-60"
              />
              {sendError && (
                <div className="px-3 py-1.5 border-t border-[#B86B4A]/30 bg-[#F5E8E0]/40 text-[11px] text-[#B86B4A] flex items-center justify-between">
                  <span>{sendError}</span>
                  {needsReauth && (
                    <a href="/api/gmail/connect" className="font-medium underline">Reconnect</a>
                  )}
                </div>
              )}
              <div className="px-3 py-2 border-t border-[#5E8FBF]/15 flex items-center justify-end gap-2 bg-[#FAF6EB]/30 dark:bg-[#2A2520]/30">
                <button onClick={copyDraft} disabled={sending} className="text-[11px] text-[#766E63] dark:text-[#A89F92] hover:text-[#3D6A95] disabled:opacity-40">
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <button
                  onClick={sendDraft}
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#B86B4A] to-[#A65B3F] px-3 py-1.5 text-[11px] font-medium text-white hover:from-[#A65B3F] hover:to-[#9C523A] disabled:opacity-40 transition-all shadow-[0_2px_8px_-2px_rgba(184,107,74,0.30)]"
                >
                  {sending ? <><ThinkingDots />Sending</> : <><Send className="w-3 h-3" />Send</>}
                </button>
              </div>
            </div>
          )}

          {sent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-md border border-[#6B8E68]/30 bg-[#E8EFE5]/40 px-3 py-2 flex items-center gap-2"
            >
              <Check className="w-3.5 h-3.5 text-[#6B8E68]" />
              <p className="flex-1 text-[12px] text-[#6B8E68] font-medium">Reply sent.</p>
              <button onClick={onClose} className="text-[11px] font-medium text-[#6B8E68] hover:underline">Done</button>
            </motion.div>
          )}

          {/* Snooze + dismiss row */}
          <div className="mt-4 pt-3 border-t border-[#E6DCC4] dark:border-[#3A3127] flexitems-center justify-between gap-2">
            <SnoozePopover
              onSnooze={async (preset, customUntil) => {
                try {
                  const res = await fetch(`/api/email/${email.id}/snooze`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ preset, custom_until: customUntil }),
                  });
                  if (!res.ok) {
                    toast.error("Couldn't snooze this email");
                    return null;
                  }
                  const data = await res.json();
                  toast.success("Snoozed", {
                    detail: data.reason,
                    onUndo: async () => {
                      await fetch(`/api/email/${email.id}/snooze`, { method: "DELETE" });
                    },
                  });
                  // Visually treat as dismissed so it leaves the list
                  onDismiss(email.id);
                  onClose();
                  return data.reason;
                } catch {
                  toast.error("Couldn't snooze this email");
                  return null;
                }
              }}
            />
            <button
              onClick={() => { onDismiss(email.id); onClose(); }}
              className="text-[11px] uppercase tracking-[0.14em] font-medium text-[#3D6A95] hover:text-[#5E8FBF] transition-colors"
            >
              Mark done →
            </button>
          </div>

          {/* Feedback — visual confirmation on click */}
          <FeedbackButtons emailId={email.id} onFeedback={onFeedback} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ThinkingDots({ large = false }: { large?: boolean }) {
  const size = large ? "w-1.5 h-1.5" : "w-1 h-1";
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={`${size} rounded-full ${large ? "bg-[#5E8FBF]" : "bg-current"}`}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
