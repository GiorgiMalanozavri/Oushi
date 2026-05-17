"use client";

import { useState } from "react";
import { MuteModal } from "./mute-modal";

interface Email {
  id: string;
  from_name: string;
  from_email: string;
  subject: string;
  snippet: string;
  score: number;
  category: string;
  reasoning: string;
  requires_action: boolean;
  received_at: string;
  is_read: boolean;
}

interface EmailCardProps {
  email: Email;
  onFeedback: (emailId: string, signal: string) => void;
  onMute: (muteType: string, value: string) => void;
}

export function EmailCard({ email, onFeedback, onMute }: EmailCardProps) {
  const [state, setState] = useState<"idle" | "upvoted" | "downvoted" | "muted">("idle");
  const [showMuteModal, setShowMuteModal] = useState(false);

  const timeAgo = getTimeAgo(new Date(email.received_at));

  const scoreColor =
    email.score >= 75
      ? "text-warning bg-warning-bg"
      : email.score >= 40
        ? "text-success bg-success-bg"
        : "text-skip bg-skip-bg";

  if (state === "downvoted" || state === "muted") {
    return (
      <div className="flex items-center justify-between rounded-xl border border-warm-border bg-white/50 px-5 py-3 transition-all duration-300">
        <p className="text-[13px] text-text-muted">
          {state === "downvoted"
            ? `"${email.subject}" — noted, less like this`
            : `Muted — you won't see this again`}
        </p>
        <button
          onClick={() => setState("idle")}
          className="text-[12px] text-text-muted underline transition-colors hover:text-text-secondary"
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className={`rounded-xl border bg-white transition-all duration-300 ${
          state === "upvoted"
            ? "border-success/30 shadow-[0_0_0_1px_rgba(62,124,95,0.1)]"
            : "border-warm-border hover:border-text-muted/30"
        }`}
      >
        <div className="flex items-start gap-4 p-4">
          {/* Score */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-semibold ${scoreColor}`}
          >
            {email.score}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[14px] font-medium text-text-primary">
                {email.from_name || email.from_email}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-text-muted">
                {timeAgo}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[14px] text-text-primary">
              {email.subject}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[13px] text-text-muted">
              {email.snippet}
            </p>
            {email.reasoning && (
              <p className="mt-1.5 text-[12px] text-text-muted italic">
                {email.reasoning}
              </p>
            )}
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between border-t border-warm-border/60 px-4 py-2">
          <div className="flex items-center gap-3">
            {email.requires_action && (
              <span className="text-[11px] font-medium text-warning">
                Action needed
              </span>
            )}
            {state === "upvoted" && (
              <span className="text-[11px] font-medium text-success">
                More like this — score boosted
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (state !== "upvoted") {
                  onFeedback(email.id, "upvote");
                  setState("upvoted");
                }
              }}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-all ${
                state === "upvoted"
                  ? "bg-success-bg text-success"
                  : "text-text-muted hover:bg-success-bg hover:text-success"
              }`}
            >
              <ThumbUpIcon />
              <span>More</span>
            </button>
            <button
              onClick={() => {
                onFeedback(email.id, "downvote");
                setState("downvoted");
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-muted transition-all hover:bg-warning-bg hover:text-warning"
            >
              <ThumbDownIcon />
              <span>Less</span>
            </button>
            <button
              onClick={() => setShowMuteModal(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-muted transition-all hover:bg-skip-bg hover:text-text-secondary"
            >
              <MuteIcon />
              <span>Mute</span>
            </button>
          </div>
        </div>
      </div>

      {showMuteModal && (
        <MuteModal
          email={email}
          onMute={(type, value) => {
            onMute(type, value);
            setState("muted");
            setShowMuteModal(false);
          }}
          onClose={() => setShowMuteModal(false)}
        />
      )}
    </>
  );
}

function ThumbUpIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 0 1 2.25 12c0-2.848.992-5.464 2.649-7.521C5.287 3.997 5.886 3.75 6.504 3.75h4.369a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.5a2.25 2.25 0 0 0 2.25 2.25.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
