"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-black/[0.06] dark:bg-white/[0.06] ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/40 dark:via-white/[0.05] to-transparent" />
      <style jsx>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

export function ReminderCardSkeleton() {
  return (
    <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white/95 dark:bg-[#0F0F0F] p-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-2 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function TopicCardSkeleton() {
  return (
    <div className="rounded-2xl border border-black/8 dark:border-white/10 bg-white dark:bg-[#0F0F0F] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-black/5 dark:border-white/10">
        <Skeleton className="h-2 w-2 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2.5 w-44" />
        </div>
        <Skeleton className="h-5 w-8 rounded-md" />
      </div>
      <div className="p-3 space-y-2">
        <ReminderCardSkeleton />
        <ReminderCardSkeleton />
        <ReminderCardSkeleton />
      </div>
    </div>
  );
}
