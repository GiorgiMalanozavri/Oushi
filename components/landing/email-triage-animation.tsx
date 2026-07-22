"use client";

import { useEffect, useRef, useState } from "react";

const emails = [
  { from: "Prof. Chen", subject: "Thesis review, final comments", score: 94, category: "critical" },
  { from: "GitHub", subject: "New issue on your repo", score: 72, category: "useful" },
  { from: "LinkedIn", subject: "15 new job matches", score: 45, category: "low_priority" },
  { from: "Stripe", subject: "Your receipt for $12.00", score: 12, category: "noise" },
  { from: "Alex (team)", subject: "Can you review this PR?", score: 88, category: "critical" },
  { from: "Newsletter", subject: "This week in AI", score: 61, category: "useful" },
  { from: "Promo", subject: "50% off, ends tonight!", score: 5, category: "noise" },
];

const categoryColors = {
  critical: { bg: "#F5E4DE", text: "#B85C3E", border: "#E8D5CC" },
  useful: { bg: "#E4F0E9", text: "#3E7C5F", border: "#D0E4D8" },
  low_priority: { bg: "#F0EEE6", text: "#8B8680", border: "#E8E6DC" },
  noise: { bg: "#F0EEE6", text: "#9B9690", border: "#E8E6DC" },
};

export function EmailTriageAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"inbox" | "scoring" | "sorted">("inbox");
  const [scoringIndex, setScoringIndex] = useState(-1);
  const hasTriggered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTriggered.current) {
          hasTriggered.current = true;
          startAnimation();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const startAnimation = () => {
    setPhase("inbox");

    setTimeout(() => {
      setPhase("scoring");
      emails.forEach((_, i) => {
        setTimeout(() => setScoringIndex(i), i * 250);
      });
    }, 800);

    setTimeout(() => {
      setPhase("sorted");
    }, 800 + emails.length * 250 + 600);
  };

  const sorted = [...emails].sort((a, b) => b.score - a.score);
  const displayEmails = phase === "sorted" ? sorted : emails;

  return (
    <div ref={ref} className="mx-auto max-w-md">
      {/* Phase label */}
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-xs text-text-muted">
          {phase === "inbox" && "Unsorted inbox"}
          {phase === "scoring" && "Scoring..."}
          {phase === "sorted" && "Ranked by relevance"}
        </span>
        {phase === "sorted" && (
          <button
            onClick={() => {
              setPhase("inbox");
              setScoringIndex(-1);
              setTimeout(() => {
                hasTriggered.current = false;
                hasTriggered.current = true;
                startAnimation();
              }, 300);
            }}
            className="font-mono text-xs text-text-muted transition-colors hover:text-claude-orange"
          >
            Replay
          </button>
        )}
      </div>

      {/* Email list */}
      <div className="space-y-2">
        {displayEmails.map((email, i) => {
          const originalIndex = emails.indexOf(email);
          const isScored = phase === "scoring" && scoringIndex >= originalIndex;
          const isSorted = phase === "sorted";
          const colors = categoryColors[email.category as keyof typeof categoryColors];

          return (
            <div
              key={`${email.subject}-${phase}`}
              style={{
                opacity: phase === "inbox" ? (i < emails.length ? 1 : 0) : 1,
                transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                transitionDelay: isSorted ? `${i * 60}ms` : "0ms",
              }}
              className="flex items-center gap-3 rounded-lg border bg-white px-3.5 py-2.5"
            >
              {/* Score badge */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium transition-all duration-500"
                style={{
                  backgroundColor: isScored || isSorted ? colors.bg : "#F0EEE6",
                  color: isScored || isSorted ? colors.text : "#9B9690",
                  transform: isScored && !isSorted ? "scale(1.15)" : "scale(1)",
                }}
              >
                {isScored || isSorted ? email.score : "—"}
              </div>

              {/* Email content */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-text-primary">
                  {email.from}
                </p>
                <p className="truncate text-[12px] text-text-muted">
                  {email.subject}
                </p>
              </div>

              {/* Category dot */}
              <div
                className="h-2 w-2 shrink-0 rounded-full transition-all duration-500"
                style={{
                  backgroundColor: isScored || isSorted ? colors.text : "transparent",
                  transform: isScored || isSorted ? "scale(1)" : "scale(0)",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {phase === "sorted" && (
        <div
          className="mt-4 flex gap-4"
          style={{
            opacity: phase === "sorted" ? 1 : 0,
            transition: "opacity 0.5s ease 0.3s",
          }}
        >
          {[
            { label: "Critical", color: "#B85C3E" },
            { label: "Useful", color: "#3E7C5F" },
            { label: "Skip", color: "#8B8680" },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-[11px] text-text-muted">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
