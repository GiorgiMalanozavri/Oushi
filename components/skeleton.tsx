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

/**
 * Skeleton for a single email row in the dashboard list — mirrors the
 * shape of EmailRow (avatar, sender + meta line, subject, snippet).
 * Use this while /api/today is fetching.
 */
export function EmailRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5 border-b border-[#E6DCC4]/60">
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-10" />
        </div>
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-2.5 w-4/5" />
      </div>
    </div>
  );
}

/**
 * Full-page skeleton for the dashboard's first-paint loading state.
 * Mirrors the sidebar + main column layout so the user sees the app's
 * structure before the data arrives, not a centered spinner.
 */
export function DashboardSkeleton() {
  // Slight variance in row count so the placeholder doesn't look identical
  // on every reload. Five rows is a comfortable "feels full" count.
  return (
    <div className="h-screen bg-[#FAF6EB] text-[#2A2520] overflow-hidden flex">
      {/* Sidebar shell */}
      <aside className="hidden md:flex shrink-0 h-full w-[260px] flex-col border-r border-[#E6DCC4] bg-[#FFFCF3]">
        {/* Brand block */}
        <div className="px-4 py-4 flex items-center gap-2 border-b border-[#E6DCC4]">
          <Skeleton className="h-6 w-6 rounded-md" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        {/* Nav rows */}
        <div className="flex-1 px-3 py-3 space-y-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
              <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              <Skeleton className="h-3 w-24" />
              <div className="ml-auto">
                <Skeleton className="h-3 w-5" />
              </div>
            </div>
          ))}
          {/* Section divider */}
          <div className="pt-4 pb-1.5 px-2">
            <Skeleton className="h-2.5 w-16" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
        {/* Footer */}
        <div className="px-3 py-3 border-t border-[#E6DCC4] flex items-center gap-2.5">
          <Skeleton className="h-7 w-7 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-2 w-28" />
          </div>
        </div>
      </aside>

      {/* Main column */}
      <main className="flex-1 h-full overflow-hidden">
        {/* Header bar */}
        <div className="px-5 md:px-8 lg:px-12 pt-6 pb-4 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
        {/* Section tabs */}
        <div className="px-5 md:px-8 lg:px-12 pb-3 flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-md" />
          ))}
        </div>
        {/* Email list — card with rows inside */}
        <div className="px-5 md:px-8 lg:px-12 pt-2">
          <div className="rounded-2xl border border-[#E6DCC4] bg-[#FFFCF3] overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <EmailRowSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
