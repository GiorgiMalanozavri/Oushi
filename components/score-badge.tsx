"use client";

import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  category: string;
}

export function ScoreBadge({ score, category }: ScoreBadgeProps) {
  const styles = {
    critical: "bg-warning-bg text-warning",
    useful: "bg-success-bg text-success",
    low_priority: "bg-skip-bg text-skip",
    noise: "bg-skip-bg text-skip",
  };

  const style = styles[category as keyof typeof styles] || styles.low_priority;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-medium",
        style
      )}
    >
      {score}
    </span>
  );
}
