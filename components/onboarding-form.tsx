"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Check, X, Sparkles } from "lucide-react";
import { OushiMark } from "@/components/oushi-mark";

interface Category {
  label: string;
  description: string;
  email: {
    from_name: string;
    from_email: string;
    subject: string;
    snippet: string;
  };
}

interface CategoryWithPref extends Category {
  preference: "yes" | "no" | "meh" | null;
}

export function OnboardingForm() {
  const [phase, setPhase] = useState<"connect" | "loading" | "review" | "ranking">("connect");
  const [categories, setCategories] = useState<CategoryWithPref[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | "down" | null>(null);
  const router = useRouter();

  const hasGmail = typeof window !== "undefined" && !window.location.search.includes("noGmail");

  const startLoading = async () => {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/onboarding/samples", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.includes("No Gmail tokens")) {
          setPhase("connect");
          return;
        }
        setError(data.error || "Something went wrong");
        setPhase("connect");
        return;
      }
      setCategories(data.categories.map((c: Category) => ({ ...c, preference: null })));
      setPhase("review");
    } catch {
      setError("Failed to load emails");
      setPhase("connect");
    }
  };

  useEffect(() => {
    if (hasGmail && phase === "connect") startLoading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const respond = async (pref: "yes" | "no" | "meh") => {
    if (animating) return;
    setSlideDirection(pref === "yes" ? "right" : pref === "no" ? "left" : "down");
    setAnimating(true);
    setCategories((prev) =>
      prev.map((c, i) => (i === currentIndex ? { ...c, preference: pref } : c))
    );
    setTimeout(() => {
      if (currentIndex < categories.length - 1) {
        setCurrentIndex((i) => i + 1);
        setSlideDirection(null);
        setAnimating(false);
      } else {
        finishOnboarding([
          ...categories.slice(0, currentIndex).map((c) => c),
          { ...categories[currentIndex], preference: pref },
        ]);
      }
    }, 280);
  };

  const finishOnboarding = async (final: CategoryWithPref[]) => {
    setPhase("ranking");
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: final.map((c) => ({
            label: c.label,
            description: c.description,
            preference: c.preference || "meh",
            example_from: c.email.from_name,
          })),
        }),
      });
      router.push("/dashboard?firstSync=true");
    } catch {
      setError("Failed to save preferences");
      setPhase("review");
    }
  };

  // ===== Connect phase =====
  if (phase === "connect") {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#D0E1F0] flex items-center justify-center mb-6">
            <Mail className="w-5 h-5 text-[#3D6A95]" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF] mb-3">
            Step 1 of 2
          </p>
          <h1 className="text-[28px] sm:text-[36px] font-semibold tracking-tight leading-[1.1]">
            Connect your Gmail
          </h1>
          <p className="mt-3 text-[15px] text-[#766E63] leading-relaxed max-w-sm mx-auto">
            Oushi reads your inbox to learn what matters. Your emails stay private and you can disconnect anytime.
          </p>
          {error && (
            <p className="mt-4 text-[13px] text-[#B86B4A] bg-[#F5E8E0]/40 border border-[#B86B4A]/20 rounded-md px-3 py-2 inline-block">
              {error}
            </p>
          )}
          <a
            href="/api/gmail/connect"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#5E8FBF] px-6 py-3 text-[14px] font-medium text-white shadow-sm transition-all hover:bg-[#4A7AAB] hover:shadow-md"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Connect Gmail
          </a>
        </motion.div>
      </Shell>
    );
  }

  // ===== Loading phase =====
  if (phase === "loading") {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="relative w-12 h-12 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-[#5E8FBF]/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#5E8FBF] animate-spin" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF] mb-3">
            Reading your inbox
          </p>
          <h2 className="text-[24px] font-semibold tracking-tight text-[#2A2520]">
            Finding the types of email you get.
          </h2>
          <p className="mt-2 text-[14px] text-[#766E63] max-w-sm mx-auto">
            This takes a few seconds. We're categorizing your recent emails so you can tell us what matters.
          </p>
        </motion.div>
      </Shell>
    );
  }

  // ===== Ranking phase =====
  if (phase === "ranking") {
    const liked = categories.filter((c) => c.preference === "yes").length;
    const disliked = categories.filter((c) => c.preference === "no").length;
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#D0E1F0] flex items-center justify-center mb-6">
            <Sparkles className="w-5 h-5 text-[#3D6A95]" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF] mb-3">
            Almost done
          </p>
          <h2 className="text-[24px] font-semibold tracking-tight text-[#2A2520]">
            Ranking your inbox.
          </h2>
          <p className="mt-2 text-[14px] text-[#766E63] max-w-sm mx-auto">
            Prioritizing {liked} {liked === 1 ? "category" : "categories"} you care about, hiding {disliked} you don&apos;t.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 text-[#A89F92]">
            <div className="w-2 h-2 rounded-full bg-[#5E8FBF] animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-[0.15em]">Working in the background</span>
          </div>
        </motion.div>
      </Shell>
    );
  }

  // ===== Review phase — swipe through categories =====
  const current = categories[currentIndex];
  if (!current) return null;
  const progress = ((currentIndex + 1) / categories.length) * 100;

  return (
    <Shell wide>
      {/* Progress + step */}
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF]">
            Step 2 of 2 · {currentIndex + 1}/{categories.length}
          </p>
          <p className="text-[11px] text-[#A89F92] font-mono">
            {categories.filter((c) => c.preference).length} answered
          </p>
        </div>
        <div className="h-1 rounded-full bg-[#E6DCC4] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[#5E8FBF]"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 16 }}
            animate={{
              opacity: animating ? 0 : 1,
              x: animating && slideDirection === "right" ? 80 : animating && slideDirection === "left" ? -80 : 0,
              y: animating && slideDirection === "down" ? 30 : 0,
              rotate: animating && slideDirection === "right" ? 5 : animating && slideDirection === "left" ? -5 : 0,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="mt-8"
          >
            {/* Category label */}
            <div className="mb-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#A89F92] mb-1.5">
                Category
              </p>
              <h2 className="text-[24px] font-semibold tracking-tight text-[#2A2520]">
                {current.label}
              </h2>
              <p className="mt-1 text-[13px] text-[#766E63]">{current.description}</p>
            </div>

            {/* Example email card */}
            <div className="rounded-lg border border-[#E6DCC4] bg-[#FFFCF3] p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-[#D0E1F0] flex items-center justify-center shrink-0">
                  <span className="text-[12px] font-semibold text-[#3D6A95]">
                    {(current.email.from_name || current.email.from_email || "?")[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[#2A2520] truncate">
                    {current.email.from_name || current.email.from_email}
                  </p>
                  <p className="text-[11px] text-[#A89F92] font-mono truncate">
                    {current.email.from_email}
                  </p>
                </div>
              </div>
              <p className="text-[14px] font-medium text-[#2A2520] mb-1">
                {current.email.subject}
              </p>
              <p className="text-[13px] text-[#766E63] line-clamp-2 leading-snug">
                {current.email.snippet}
              </p>
            </div>

            {/* Question */}
            <p className="mt-6 text-center text-[14px] text-[#766E63]">
              Do you want emails like this surfaced?
            </p>

            {/* Buttons */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                onClick={() => respond("no")}
                disabled={animating}
                className="group flex flex-col items-center gap-1 rounded-lg border border-[#E6DCC4] bg-[#FFFCF3] py-3.5 transition-all hover:border-[#B86B4A]/40 hover:bg-[#F5E8E0]/40 active:scale-[0.97] disabled:opacity-50"
              >
                <X className="w-4 h-4 text-[#B86B4A]" />
                <span className="text-[12px] font-medium text-[#2A2520]">Hide</span>
              </button>
              <button
                onClick={() => respond("meh")}
                disabled={animating}
                className="group flex flex-col items-center gap-1 rounded-lg border border-[#E6DCC4] bg-[#FFFCF3] py-3.5 transition-all hover:border-[#A89F92]/40 hover:bg-[#F0E9D6]/40 active:scale-[0.97] disabled:opacity-50"
              >
                <span className="text-[14px] leading-none text-[#A89F92]">—</span>
                <span className="text-[12px] font-medium text-[#2A2520]">Sometimes</span>
              </button>
              <button
                onClick={() => respond("yes")}
                disabled={animating}
                className="group flex flex-col items-center gap-1 rounded-lg border border-[#E6DCC4] bg-[#FFFCF3] py-3.5 transition-all hover:border-[#5E8FBF]/40 hover:bg-[#D0E1F0]/30 active:scale-[0.97] disabled:opacity-50"
              >
                <Check className="w-4 h-4 text-[#5E8FBF]" />
                <span className="text-[12px] font-medium text-[#2A2520]">Show me</span>
              </button>
            </div>

            {/* Keyboard hint */}
            <p className="mt-3 text-center text-[10px] font-mono uppercase tracking-[0.15em] text-[#A89F92]">
              Pick what feels right — you can always adjust later
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="mt-8 flex items-center justify-center gap-1.5">
          {categories.map((cat, i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full transition-all duration-300"
              style={{
                backgroundColor:
                  cat.preference === "yes"
                    ? "#5E8FBF"
                    : cat.preference === "no"
                      ? "#B86B4A"
                      : cat.preference === "meh"
                        ? "#A89F92"
                        : i === currentIndex
                          ? "#3D6A95"
                          : "#E6DCC4",
                transform: i === currentIndex ? "scale(1.4)" : "scale(1)",
              }}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF6EB] text-[#2A2520] relative overflow-hidden">
      {/* Soft ambient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-[#D0E1F0]/25 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-[#F0E9D6]/40 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <OushiMark size={28} />
          <span className="text-[16px] font-semibold tracking-tight">Oushi</span>
        </div>
      </header>

      {/* Centered content */}
      <main className={`relative z-10 flex-1 flex items-center justify-center px-6 pb-16 ${wide ? "" : ""}`}>
        <div className="w-full max-w-md flex justify-center">{children}</div>
      </main>
    </div>
  );
}
