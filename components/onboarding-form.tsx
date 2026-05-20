"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Check,
  X,
  Sparkles,
  Handshake,
  BellRing,
  Calendar,
  ArrowLeft,
  ArrowRight,
  Star,
} from "lucide-react";
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

interface TopPerson {
  email: string;
  name: string;
  reputation: number;
  signal_count: number;
}

type Phase =
  | "intro"
  | "connect"
  | "loading"
  | "review"
  | "people"
  | "complete";

export function OnboardingForm() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [categories, setCategories] = useState<CategoryWithPref[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | "down" | null>(null);
  const [topPeople, setTopPeople] = useState<TopPerson[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [loadingPeople, setLoadingPeople] = useState(false);
  const router = useRouter();

  // If user already has Gmail tokens (e.g. they came back to this screen),
  // skip intro and start loading samples.
  useEffect(() => {
    const hasGmail =
      typeof window !== "undefined" && !window.location.search.includes("noGmail");
    if (hasGmail && window.location.search.includes("connected")) {
      setPhase("loading");
      startLoadingSamples();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLoadingSamples = async () => {
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
        // Categories done — load top people for the next step
        setSlideDirection(null);
        setAnimating(false);
        goToPeoplePhase();
      }
    }, 280);
  };

  const goBack = () => {
    if (animating || currentIndex === 0) return;
    setCurrentIndex((i) => i - 1);
    // Clear the previous answer so they can re-pick
    setCategories((prev) =>
      prev.map((c, i) => (i === currentIndex - 1 ? { ...c, preference: null } : c))
    );
  };

  const goToPeoplePhase = async () => {
    setPhase("people");
    setLoadingPeople(true);
    try {
      const res = await fetch("/api/onboarding/top-senders");
      const data = await res.json();
      setTopPeople(data.people || []);
    } catch {
      setTopPeople([]);
    } finally {
      setLoadingPeople(false);
    }
  };

  const togglePerson = (email: string) => {
    setSelectedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else if (next.size < 5) next.add(email);
      return next;
    });
  };

  const finishOnboarding = async () => {
    setPhase("complete");
    try {
      const importantPeople = topPeople
        .filter((p) => selectedPeople.has(p.email))
        .map((p) => ({ email: p.email, name: p.name }));

      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: categories.map((c) => ({
            label: c.label,
            description: c.description,
            preference: c.preference || "meh",
            example_from: c.email.from_name,
          })),
          important_people: importantPeople,
        }),
      });
      // Hold the "complete" screen for a brief beat so the user reads the
      // success state, then transition to dashboard with firstSync flag.
      setTimeout(() => {
        router.push("/dashboard?firstSync=true");
      }, 2000);
    } catch {
      setError("Failed to save preferences");
      setPhase("people");
    }
  };

  // ============================================================
  // PHASE 1: INTRO — value pitch before asking for permissions
  // ============================================================
  if (phase === "intro") {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md text-center"
        >
          <div className="mb-6">
            <div className="relative inline-block">
              <div className="absolute inset-0 rounded-2xl bg-[#5E8FBF]/20 blur-xl oushi-glow" />
              <div className="relative oushi-breathe">
                <OushiMark size={56} />
              </div>
            </div>
          </div>

          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF] mb-3">
            Welcome to Oushi
          </p>
          <h1 className="text-[30px] sm:text-[38px] font-semibold tracking-[-0.015em] text-[#2A2520] leading-[1.08]">
            The inbox that won&apos;t let you forget.
          </h1>
          <p className="mt-4 text-[15px] text-[#766E63] leading-relaxed max-w-sm mx-auto">
            Oushi watches your email and calendar, learns what matters to you, and pings you before you drop something.
          </p>

          {/* Preview cards — show what they're signing up for */}
          <div className="mt-8 space-y-2.5 text-left">
            <PreviewCard
              icon={<Handshake className="w-3.5 h-3.5" />}
              tint={{ bg: "#E8EFE5", fg: "#6B8E68" }}
              title="You told Sarah you'd send the doc"
              subtitle="2 days overdue · we'll keep nudging until you do"
            />
            <PreviewCard
              icon={<Calendar className="w-3.5 h-3.5" />}
              tint={{ bg: "#D0E1F0", fg: "#3D6A95" }}
              title="1:1 with Jake in 37 min"
              subtitle='Last from Jake: "send me the prototype"'
            />
            <PreviewCard
              icon={<BellRing className="w-3.5 h-3.5" />}
              tint={{ bg: "#F5E8E0", fg: "#B86B4A" }}
              title="Stripe contract is sitting unsigned"
              subtitle="3 days · we'll ping your phone before Friday"
            />
          </div>

          <button
            onClick={() => setPhase("connect")}
            className="mt-9 inline-flex items-center justify-center gap-2 rounded-lg bg-[#5E8FBF] px-6 py-3 text-[14px] font-medium text-white shadow-sm transition-all hover:bg-[#4A7AAB] hover:shadow-md"
          >
            Get started
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <p className="mt-3 text-[11.5px] text-[#A89F92]">
            Takes about 90 seconds.
          </p>
        </motion.div>
      </Shell>
    );
  }

  // ============================================================
  // PHASE 2: CONNECT GMAIL
  // ============================================================
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
            Step 1 of 3
          </p>
          <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-tight leading-[1.1]">
            Connect your Gmail
          </h1>
          <p className="mt-3 text-[14px] text-[#766E63] leading-relaxed max-w-sm mx-auto">
            Oushi reads your inbox to learn what matters. Your emails stay yours — we never share content with anyone, and you can disconnect anytime.
          </p>

          {/* Permissions — concrete, not scary */}
          <div className="mt-6 rounded-xl border border-[#E6DCC4] bg-[#FFFCF3]/60 px-4 py-3 text-left space-y-2">
            <PermissionLine label="Read your email" detail="To rank what matters" />
            <PermissionLine label="Send replies on your behalf" detail="Only when you approve a draft" />
            <PermissionLine label="See your calendar" detail="To nudge you before meetings" />
          </div>

          {error && (
            <p className="mt-4 text-[13px] text-[#B86B4A] bg-[#F5E8E0]/40 border border-[#B86B4A]/20 rounded-md px-3 py-2 inline-block">
              {error}
            </p>
          )}
          <a
            href="/api/gmail/connect"
            className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#5E8FBF] px-6 py-3 text-[14px] font-medium text-white shadow-sm transition-all hover:bg-[#4A7AAB] hover:shadow-md"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
            </svg>
            Connect Gmail
          </a>
          <p className="mt-3 text-[10.5px] text-[#A89F92]">
            Google&apos;s permission screen comes next.
          </p>
        </motion.div>
      </Shell>
    );
  }

  // ============================================================
  // PHASE 3: LOADING — reading inbox
  // ============================================================
  if (phase === "loading") {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-2xl bg-[#5E8FBF]/20 blur-xl oushi-glow" />
            <div className="relative oushi-breathe inline-block">
              <OushiMark size={48} />
            </div>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF] mb-3">
            Step 1 of 3 · Reading
          </p>
          <h2 className="text-[24px] font-semibold tracking-tight text-[#2A2520]">
            Getting to know your inbox.
          </h2>
          <p className="mt-2 text-[13px] text-[#766E63] max-w-sm mx-auto leading-relaxed">
            Categorizing your last 30 days. Takes about 15 seconds.
          </p>
          <div className="mt-8 flex items-center justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#5E8FBF] oushi-loading-dot"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </motion.div>
      </Shell>
    );
  }

  // ============================================================
  // PHASE 4: REVIEW — swipe through categories (with back button)
  // ============================================================
  if (phase === "review") {
    const current = categories[currentIndex];
    if (!current) return null;
    const progress = ((currentIndex + 1) / categories.length) * 100;

    return (
      <Shell wide>
        <div className="w-full max-w-md">
          {/* Progress + step + back */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF]">
              Step 2 of 3 · {currentIndex + 1}/{categories.length}
            </p>
            {currentIndex > 0 && (
              <button
                onClick={goBack}
                disabled={animating}
                className="inline-flex items-center gap-1 text-[11.5px] text-[#A89F92] hover:text-[#2A2520] transition-colors disabled:opacity-40"
              >
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>
            )}
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
                x:
                  animating && slideDirection === "right"
                    ? 80
                    : animating && slideDirection === "left"
                      ? -80
                      : 0,
                y: animating && slideDirection === "down" ? 30 : 0,
                rotate:
                  animating && slideDirection === "right"
                    ? 5
                    : animating && slideDirection === "left"
                      ? -5
                      : 0,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="mt-7"
            >
              {/* Category label */}
              <div className="mb-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#A89F92] mb-1.5">
                  Category
                </p>
                <h2 className="text-[22px] font-semibold tracking-tight text-[#2A2520]">
                  {current.label}
                </h2>
                <p className="mt-1 text-[13px] text-[#766E63]">{current.description}</p>
              </div>

              {/* Example email */}
              <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] p-4 shadow-sm">
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
                    <p className="text-[10.5px] text-[#A89F92] font-mono truncate">
                      {current.email.from_email}
                    </p>
                  </div>
                </div>
                <p className="text-[13.5px] font-medium text-[#2A2520] mb-1">
                  {current.email.subject}
                </p>
                <p className="text-[12.5px] text-[#766E63] line-clamp-2 leading-snug">
                  {current.email.snippet}
                </p>
              </div>

              <p className="mt-6 text-center text-[14px] text-[#766E63]">
                Do you want emails like this surfaced?
              </p>

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

              <p className="mt-3 text-center text-[10px] font-mono uppercase tracking-[0.15em] text-[#A89F92]">
                You can adjust any of this later
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-center gap-1.5">
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

  // ============================================================
  // PHASE 5: WHO MATTERS — pick top 1-5 people
  // ============================================================
  if (phase === "people") {
    return (
      <Shell wide>
        <div className="w-full max-w-md">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF] mb-2">
            Step 3 of 3
          </p>
          <h2 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-[#2A2520] leading-[1.15]">
            Who do you most want to hear from?
          </h2>
          <p className="mt-2 text-[13.5px] text-[#766E63] leading-relaxed">
            Pick up to 5 people. Their emails get priority and Oushi will never let one slip.
          </p>

          <div className="mt-7">
            {loadingPeople ? (
              <div className="rounded-xl border border-dashed border-[#E6DCC4] bg-[#FFFCF3]/40 px-4 py-10 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#5E8FBF] oushi-loading-dot"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <p className="text-[12.5px] text-[#766E63]">
                  Reading your contacts…
                </p>
              </div>
            ) : topPeople.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E6DCC4] bg-[#FFFCF3]/40 px-4 py-8 text-center">
                <p className="text-[13px] text-[#766E63]">
                  Oushi will learn who matters as you use the app. Skip for now.
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {topPeople.map((p) => {
                  const selected = selectedPeople.has(p.email);
                  return (
                    <li key={p.email}>
                      <button
                        onClick={() => togglePerson(p.email)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all ${
                          selected
                            ? "border-[#5E8FBF] bg-[#D0E1F0]/30 shadow-[0_0_0_3px_rgba(94,143,191,0.12)]"
                            : "border-[#E6DCC4] bg-[#FFFCF3] hover:border-[#5E8FBF]/40 hover:bg-[#FFFCF3]"
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-[13px] ${
                            selected ? "bg-[#5E8FBF] text-white" : "bg-[#D0E1F0] text-[#3D6A95]"
                          }`}
                        >
                          {initials(p.name)}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-[13.5px] font-medium text-[#2A2520] truncate">
                            {p.name}
                          </p>
                          <p className="text-[11px] text-[#A89F92] font-mono truncate">
                            {p.email}
                          </p>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                            selected
                              ? "bg-[#5E8FBF] text-white"
                              : "border border-[#D6CDB8] text-transparent"
                          }`}
                        >
                          <Star className="w-3 h-3" fill="currentColor" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-7 flex items-center justify-between">
            <p className="text-[11.5px] text-[#A89F92]">
              {selectedPeople.size === 0
                ? "You can skip this."
                : `${selectedPeople.size} of 5 selected`}
            </p>
            <button
              onClick={finishOnboarding}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5E8FBF] px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-[#4A7AAB] hover:shadow-md"
            >
              {selectedPeople.size === 0 ? "Skip" : "Continue"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ============================================================
  // PHASE 6: COMPLETE — success summary while we redirect
  // ============================================================
  if (phase === "complete") {
    const liked = categories.filter((c) => c.preference === "yes").length;
    const hidden = categories.filter((c) => c.preference === "no").length;
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="relative mb-6 inline-block">
            <div className="absolute inset-0 rounded-2xl bg-[#6B8E68]/20 blur-xl" />
            <div className="relative w-14 h-14 rounded-2xl bg-[#E8EFE5] flex items-center justify-center">
              <Check className="w-6 h-6 text-[#6B8E68]" strokeWidth={3} />
            </div>
          </div>

          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B8E68] mb-3">
            You&apos;re all set
          </p>
          <h2 className="text-[28px] font-semibold tracking-tight text-[#2A2520] leading-[1.15]">
            Oushi knows you a little already.
          </h2>

          <div className="mt-7 space-y-2 text-left max-w-sm mx-auto">
            <SummaryLine
              label={`${liked} categor${liked === 1 ? "y" : "ies"} you care about`}
              tint="sky"
            />
            <SummaryLine
              label={`${hidden} kind${hidden === 1 ? "" : "s"} of email I'll keep quiet`}
              tint="sand"
            />
            {selectedPeople.size > 0 && (
              <SummaryLine
                label={`${selectedPeople.size} important ${selectedPeople.size === 1 ? "person" : "people"} pinned`}
                tint="sage"
              />
            )}
          </div>

          <p className="mt-7 text-[12.5px] text-[#A89F92]">
            Taking you to your dashboard…
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#5E8FBF] oushi-loading-dot"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </motion.div>
      </Shell>
    );
  }

  return null;
}

// ==========================================================
// Small reusable pieces
// ==========================================================

function PreviewCard({
  icon,
  title,
  subtitle,
  tint,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tint: { bg: string; fg: string };
}) {
  return (
    <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] px-3 py-2.5 flex items-start gap-2.5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: tint.bg, color: tint.fg }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-[#2A2520] leading-snug">{title}</p>
        <p className="text-[11.5px] text-[#766E63] mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function PermissionLine({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <Check className="w-3 h-3 text-[#6B8E68] mt-1 shrink-0" strokeWidth={3} />
      <div>
        <span className="text-[#2A2520] font-medium">{label}</span>{" "}
        <span className="text-[#A89F92]">— {detail}</span>
      </div>
    </div>
  );
}

function SummaryLine({ label, tint }: { label: string; tint: "sky" | "sand" | "sage" }) {
  const colors =
    tint === "sky"
      ? { bg: "#D0E1F0", fg: "#3D6A95" }
      : tint === "sage"
        ? { bg: "#E8EFE5", fg: "#6B8E68" }
        : { bg: "#F0E9D6", fg: "#766E63" };
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
        style={{ backgroundColor: colors.bg }}
      >
        <Sparkles className="w-2.5 h-2.5" style={{ color: colors.fg }} />
      </div>
      <p className="text-[13px] text-[#2A2520]">{label}</p>
    </div>
  );
}

function initials(name: string): string {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("") || "?";
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF6EB] text-[#2A2520] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-[#D0E1F0]/25 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-[#F0E9D6]/40 blur-[120px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <OushiMark size={28} />
          <span className="text-[16px] font-semibold tracking-tight">Oushi</span>
        </div>
      </header>

      <main className={`relative z-10 flex-1 flex items-start justify-center px-6 pb-16 pt-4 sm:pt-8 ${wide ? "" : ""}`}>
        <div className="w-full max-w-md flex justify-center">{children}</div>
      </main>
    </div>
  );
}
