"use client";

import { motion } from "framer-motion";
import { AlertCircle, RefreshCw, type LucideIcon } from "lucide-react";

/**
 * Shared feedback primitives — used across the app so loading / error /
 * empty states feel like the same product, not a patchwork.
 *
 * Visual language:
 *   - Loading = sky-blue Oushi dots, paced via .oushi-loading-dot CSS
 *   - Error   = terracotta (#B86B4A) bg-tinted box with optional retry
 *   - Empty   = centered icon tile (sky tint) + headline + body, optionally CTA
 */

// ─────────────────────────────────────────────────────────────────────────
// LOADING
// ─────────────────────────────────────────────────────────────────────────

/**
 * The brand's 3-dot loader. Use anywhere a small async thing is happening.
 */
export function LoadingDots({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim = size === "sm" ? "w-1 h-1" : size === "lg" ? "w-2 h-2" : "w-1.5 h-1.5";
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${dim} rounded-full bg-[#5E8FBF] oushi-loading-dot`}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

/**
 * A single skeleton row. Used in lists where the structure is known but
 * the data isn't yet. Pulses softly.
 */
export function SkeletonRow({
  height = 56,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-[#FAF6EB] dark:bg-[#2A2520] animate-pulse ${className}`}
      style={{ height }}
    />
  );
}

/**
 * A more elaborate skeleton for list-like content. Shows N rows with an
 * icon tile + two stacked text bars.
 */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[#E6DCC4]/60 dark:border-[#3A3127]/60 bg-[#FFFCF3] dark:bg-[#25201A] px-4 py-3.5 flex items-start gap-3"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="w-9 h-9 rounded-xl bg-[#FAF6EB] dark:bg-[#2A2520] animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="h-3 bg-[#FAF6EB] dark:bg-[#2A2520] rounded animate-pulse" style={{ width: `${65 + i * 8}%` }} />
            <div className="h-2.5 bg-[#FAF6EB]/70 rounded animate-pulse" style={{ width: `${40 + i * 5}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Inline status used while something is happening (chat thinking, sync, etc).
 * Light, breathable, calm.
 */
export function InlineStatus({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2 text-[12.5px] text-[#766E63] dark:text-[#A89F92] ${className}`}>
      <LoadingDots size="md" />
      <span>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ERROR
// ─────────────────────────────────────────────────────────────────────────

export function ErrorPanel({
  title,
  detail,
  onRetry,
  retryLabel = "Try again",
  className = "",
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[#B86B4A]/30 bg-[#F5E8E0]/40 px-4 py-3 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-[#B86B4A] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[#B86B4A]">{title}</p>
          {detail && (
            <p className="text-[12px] text-[#B86B4A]/80 mt-0.5 break-words">{detail}</p>
          )}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium text-[#B86B4A] hover:bg-[#B86B4A]/10 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  tone = "sky",
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  tone?: "sky" | "sage" | "sand";
}) {
  const tints = {
    sky: { bg: "#D0E1F0", fg: "#3D6A95" },
    sage: { bg: "#E8EFE5", fg: "#6B8E68" },
    sand: { bg: "#F0E9D6", fg: "#766E63" },
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-dashed border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3]/40 dark:bg-[#25201A]/40 px-6 py-10 text-center"
    >
      <div
        className="inline-flex w-12 h-12 rounded-2xl items-center justify-center mb-3"
        style={{ backgroundColor: tints.bg }}
      >
        <Icon className="w-5 h-5" style={{ color: tints.fg }} />
      </div>
      <p className="text-[14.5px] font-semibold text-[#2A2520] dark:text-[#FBF4DF] mb-1">{title}</p>
      {body && (
        <p className="text-[12.5px] text-[#766E63] dark:text-[#A89F92] max-w-sm mx-auto leading-relaxed">
          {body}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#5E8FBF] hover:bg-[#3D6A95] text-white text-[12.5px] font-medium shadow-sm transition-all"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
