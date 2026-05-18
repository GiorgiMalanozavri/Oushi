"use client";

import { useState } from "react";
import {
  Reply,
  MailOpen,
  ArchiveX,
  Calendar,
  VolumeX,
  ArrowRight,
  Check,
  Loader2,
} from "lucide-react";
import type { CardAction, CardActionType } from "./types";

const ICONS: Record<CardActionType, typeof Reply> = {
  draft_reply: Reply,
  open_email: MailOpen,
  dismiss: ArchiveX,
  add_calendar: Calendar,
  mute_sender: VolumeX,
  ask_followup: ArrowRight,
};

export interface CardActionContext {
  /** Open an email in the dashboard modal */
  openEmail?: (emailId: string, options?: { draft?: boolean }) => void;
  /** Re-fire the chat with a new prompt */
  ask?: (prompt: string) => void;
  /** Dismiss an email (calls /api/email/dismiss) */
  dismiss?: (emailId: string) => Promise<void>;
  /** Mute a sender (calls /api/mute) */
  muteSender?: (emailId: string) => Promise<void>;
}

export function CardActionRow({
  actions,
  ctx,
}: {
  actions: CardAction[];
  ctx: CardActionContext;
}) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {actions.slice(0, 3).map((a, i) => (
        <CardActionButton key={i} action={a} ctx={ctx} />
      ))}
    </div>
  );
}

function CardActionButton({
  action,
  ctx,
}: {
  action: CardAction;
  ctx: CardActionContext;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const Icon = ICONS[action.type] || ArrowRight;

  const handle = async () => {
    if (state !== "idle") return;
    try {
      switch (action.type) {
        case "open_email":
          if (action.email_id) ctx.openEmail?.(action.email_id);
          setState("done");
          break;
        case "draft_reply":
          if (action.email_id) ctx.openEmail?.(action.email_id, { draft: true });
          setState("done");
          break;
        case "ask_followup":
          if (action.prompt) ctx.ask?.(action.prompt);
          setState("done");
          break;
        case "dismiss":
          if (action.email_id && ctx.dismiss) {
            setState("loading");
            await ctx.dismiss(action.email_id);
            setState("done");
          }
          break;
        case "mute_sender":
          if (action.email_id && ctx.muteSender) {
            setState("loading");
            await ctx.muteSender(action.email_id);
            setState("done");
          }
          break;
        default:
          break;
      }
    } catch {
      setState("idle");
    }
  };

  const isDone = state === "done";
  const isLoading = state === "loading";

  return (
    <button
      onClick={handle}
      disabled={isLoading || isDone}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium border transition-all ${
        isDone
          ? "border-[#6B8E68]/40 bg-[#E8EFE5] text-[#4F6B4D] cursor-default"
          : isLoading
          ? "border-[#E6DCC4] bg-white/60 text-[#A89F92] cursor-wait"
          : "border-[#E6DCC4] bg-white text-[#2A2520] hover:border-[#5E8FBF] hover:bg-[#D0E1F0]/30 hover:text-[#3D6A95]"
      }`}
    >
      {isLoading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isDone ? (
        <Check className="w-3 h-3" strokeWidth={3} />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      {isDone ? "Done" : action.label}
    </button>
  );
}
