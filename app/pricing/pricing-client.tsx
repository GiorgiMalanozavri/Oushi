"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  Shield,
  Check,
  Infinity as InfinityIcon,
  ChevronLeft,
  MessageCircle,
  Layers,
  Filter,
  Mail,
  Mic,
  Tag,
  Send,
  Brain,
} from "lucide-react";
import { OushiMark } from "@/components/oushi-mark";
import { UpgradeModal } from "@/components/upgrade-modal";

/**
 * Public pricing page. Two columns — Free and Pro — with the same
 * feature list collapsed into rows so the eye can compare across.
 *
 * "Get Pro" opens UpgradeModal which POSTs to /api/upgrade-request;
 * during beta there's no Stripe checkout. "Start free" goes to /login.
 */
export function PricingClient() {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAF6EB] text-[#2A2520] relative overflow-hidden">
        {/* Ambient blobs — same as landing for continuity */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[10%] -right-[15%] w-[55vw] h-[55vw] rounded-full bg-[#D0E1F0]/25 blur-[140px]" />
          <div className="absolute top-[80%] -left-[10%] w-[40vw] h-[40vw] rounded-full bg-[#F0E9D6]/40 blur-[140px]" />
        </div>

        {/* Nav (matches landing) */}
        <header className="sticky top-4 z-30 px-4 sm:px-6">
          <nav className="max-w-3xl mx-auto rounded-full border border-[#E6DCC4] bg-[#FFFCF3]/90 backdrop-blur-md shadow-[0_8px_28px_-12px_rgba(94,143,191,0.18)] pl-4 pr-2 py-2 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 px-1">
              <OushiMark size={24} />
              <span className="text-[15px] font-semibold tracking-tight">Oushi</span>
            </Link>
            <div className="hidden sm:flex items-center gap-7">
              <Link
                href="/#how"
                className="text-[13px] font-medium text-[#766E63] hover:text-[#2A2520] transition-colors"
              >
                How it works
              </Link>
              <Link
                href="/#next"
                className="text-[13px] font-medium text-[#766E63] hover:text-[#2A2520] transition-colors"
              >
                What&apos;s next
              </Link>
              <Link
                href="/pricing"
                className="text-[13px] font-medium text-[#2A2520] transition-colors"
              >
                Pricing
              </Link>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E6DCC4] bg-[#FFFCF3] px-4 py-1.5 text-[13px] font-medium text-[#2A2520] hover:border-[#5E8FBF]/40 hover:text-[#3D6A95] transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#5E8FBF]" />
              <span>Sign in</span>
            </Link>
          </nav>
        </header>

        <main className="relative z-10">
          {/* ============= HERO ============= */}
          <section className="px-6 pt-20 sm:pt-28 pb-10 sm:pb-14 text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-2xl mx-auto"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#5E8FBF] mb-4">
                Pricing
              </p>
              <h1 className="text-[44px] sm:text-[60px] font-semibold tracking-[-0.02em] leading-[1.05]">
                Free for now.<br />
                <span className="text-[#5E8FBF]">Honest later.</span>
              </h1>
              <p className="mt-6 text-[16px] sm:text-[17px] leading-[1.55] text-[#766E63] max-w-xl mx-auto">
                Oushi is free during beta — connect your Gmail and use the whole
                product. When we&apos;re ready to charge, Pro will be{" "}
                <strong className="text-[#2A2520]">$15/mo</strong> and the free
                tier will keep most of what matters.
              </p>
            </motion.div>
          </section>

          {/* ============= PLAN COMPARISON ============= */}
          <section className="px-6 pb-20 sm:pb-28">
            <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-5 sm:gap-6">
              <PlanCard
                tier="free"
                onPro={() => setUpgradeOpen(true)}
              />
              <PlanCard
                tier="pro"
                onPro={() => setUpgradeOpen(true)}
              />
            </div>

            {/* Reassurance */}
            <p className="mt-10 max-w-xl mx-auto text-center text-[13px] text-[#766E63] leading-[1.6]">
              No card to start. No dark patterns when we turn on billing —
              we&apos;ll email you well before anything changes, and the free
              tier above will still cover the things people actually use every
              day.
            </p>
          </section>

          {/* ============= FEATURE MATRIX ============= */}
          <section className="px-6 py-20 sm:py-24 bg-[#F0E9D6]/30 border-y border-[#E6DCC4]/60">
            <div className="max-w-2xl mx-auto text-center mb-12 sm:mb-14">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#5E8FBF] mb-4">
                What&apos;s in each
              </p>
              <h2 className="text-[32px] sm:text-[44px] font-semibold tracking-[-0.02em] leading-[1.1]">
                Side by side.
              </h2>
            </div>

            <div className="max-w-3xl mx-auto rounded-2xl border border-[#E6DCC4] bg-[#FFFCF3] overflow-hidden">
              <FeatureRow
                icon={<MessageCircle className="w-3.5 h-3.5" />}
                label="Ask Oushi"
                hint="Plain-English Q&A across your inbox"
                free="20 / day"
                pro="unlimited"
              />
              <FeatureRow
                icon={<Send className="w-3.5 h-3.5" />}
                label="Auto-drafted replies"
                hint="Pre-written reply waiting when you open the email"
                free={false}
                pro
                proLabel="Pro flagship"
              />
              <FeatureRow
                icon={<Layers className="w-3.5 h-3.5" />}
                label="Topic boards"
                hint="Group emails by topic (e.g., a project, a person)"
                free="up to 3"
                pro="unlimited"
              />
              <FeatureRow
                icon={<Filter className="w-3.5 h-3.5" />}
                label="Sender rules"
                hint="Always mute / always star / always label"
                free="up to 10"
                pro="unlimited"
              />
              <FeatureRow
                icon={<Mic className="w-3.5 h-3.5" />}
                label="Voice training"
                hint="Re-learn your tone from recent sent mail"
                free="1× / week"
                pro="unlimited"
              />
              <FeatureRow
                icon={<Mail className="w-3.5 h-3.5" />}
                label="Morning briefing email"
                hint="Three things that matter, in plain prose"
                free
                pro
              />
              <FeatureRow
                icon={<Tag className="w-3.5 h-3.5" />}
                label="Smart labels in Gmail"
                hint="Auto-categorized so Gmail looks clean too"
                free
                pro
              />
              <FeatureRow
                icon={<Brain className="w-3.5 h-3.5" />}
                label="Memory across threads"
                hint="Remembers your editor, your trips, your deadlines"
                free
                pro
              />
              <FeatureRow
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="Priority founder support"
                hint="Direct line to Giorgi while we're small"
                free={false}
                pro
                last
              />
            </div>
          </section>

          {/* ============= FAQ ============= */}
          <section className="px-6 py-20 sm:py-28">
            <div className="max-w-2xl mx-auto">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#5E8FBF] mb-4 text-center">
                FAQ
              </p>
              <h2 className="text-[32px] sm:text-[44px] font-semibold tracking-[-0.02em] leading-[1.1] text-center mb-12">
                Stuff we&apos;d ask too.
              </h2>

              <div className="space-y-4">
                <FaqRow q="When does Pro actually start charging?">
                  When we&apos;re happy with reliability and a real Stripe flow
                  is wired up. Until then, &ldquo;Pro&rdquo; is flipped on
                  manually — usually within a few hours of you requesting it —
                  and it&apos;s free during the beta.
                </FaqRow>
                <FaqRow q="What if I'm on Pro and you start charging?">
                  Beta users who&apos;ve been on Pro will get the first 3
                  months free once billing turns on, and we&apos;ll email you
                  before anything is charged. Cancel anytime, no questions.
                </FaqRow>
                <FaqRow q="Why $15? Fyxer and Superhuman are $30.">
                  Because Oushi shouldn&apos;t feel like a luxury good. The
                  goal is &ldquo;cheaper than dinner.&rdquo; If we can keep
                  costs down we&apos;ll keep it there.
                </FaqRow>
                <FaqRow q="What happens to my data if I cancel?">
                  Your data stays with you. Cancel Pro and you drop back to the
                  free tier — your boards, memories, and rules don&apos;t
                  vanish, they just respect the free-tier limits going forward.
                  Delete your account anytime to wipe everything.
                </FaqRow>
                <FaqRow q="Do you offer a team or company plan?">
                  Not yet. We&apos;re focused on individuals first. If
                  you&apos;re curious about a team plan,{" "}
                  <a
                    href="mailto:hello@oushi.app"
                    className="text-[#3D6A95] underline underline-offset-2"
                  >
                    email us
                  </a>{" "}
                  — we want to hear what you&apos;d need.
                </FaqRow>
              </div>
            </div>
          </section>

          {/* ============= FINAL CTA ============= */}
          <section className="px-6 pb-32 sm:pb-40 text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="max-w-2xl mx-auto"
            >
              <h2 className="text-[36px] sm:text-[52px] font-semibold tracking-[-0.02em] leading-[1.08]">
                Try it free.<br />
                <span className="text-[#5E8FBF]">Decide later.</span>
              </h2>
              <p className="mt-6 text-[15px] text-[#766E63] max-w-md mx-auto">
                30 seconds to connect your Gmail. No card. Disconnect anytime.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2.5 whitespace-nowrap rounded-lg bg-[#5E8FBF] px-6 py-3 text-[15px] font-medium text-white shadow-sm hover:bg-[#4A7AAB] hover:shadow-md transition-all"
                >
                  <span>Start free</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <button
                  onClick={() => setUpgradeOpen(true)}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-[#E6DCC4] bg-[#FFFCF3] px-6 py-3 text-[15px] font-medium text-[#2A2520] hover:border-[#5E8FBF]/40 hover:text-[#3D6A95] transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#5E8FBF]" />
                  <span>Request Pro</span>
                </button>
              </div>
              <p className="mt-7 text-[12px] text-[#A89F92] flex items-center justify-center gap-1.5">
                <Shield className="w-3 h-3" />
                Disconnect anytime · read-only access
              </p>
            </motion.div>
          </section>
        </main>

        <footer className="relative z-10 border-t border-[#E6DCC4]/60 py-8">
          <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#A89F92]">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1 hover:text-[#3D6A95] transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
                Back to home
              </Link>
            </div>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="hover:text-[#3D6A95]">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-[#3D6A95]">
                Terms
              </Link>
              <a href="mailto:hello@oushi.app" className="hover:text-[#3D6A95]">
                Contact
              </a>
            </div>
          </div>
        </footer>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        source="pricing-page"
        headline="Ready for Pro?"
        subhead="We'll flip your account to Pro manually within a few hours — no card needed during beta."
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Plan card
// ───────────────────────────────────────────────────────────────────────

const FREE_HIGHLIGHTS: string[] = [
  "20 Ask Oushi messages per day",
  "3 topic boards",
  "10 sender rules",
  "Morning briefing email",
  "Smart labels + snooze",
  "Manual drafts in your voice",
  "Cross-thread memory",
];

const PRO_HIGHLIGHTS: string[] = [
  "Unlimited Ask Oushi",
  "Unlimited topic boards",
  "Unlimited sender rules",
  "Auto-drafted replies (the killer feature)",
  "Unlimited voice retrains",
  "Priority founder support",
  "Everything in Free",
];

function PlanCard({
  tier,
  onPro,
}: {
  tier: "free" | "pro";
  onPro: () => void;
}) {
  const isPro = tier === "pro";
  const items = isPro ? PRO_HIGHLIGHTS : FREE_HIGHLIGHTS;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`relative rounded-3xl border p-7 sm:p-9 ${
        isPro
          ? "border-[#5E8FBF]/30 bg-gradient-to-b from-[#D0E1F0]/30 to-[#FFFCF3] shadow-[0_24px_60px_-20px_rgba(94,143,191,0.28)]"
          : "border-[#E6DCC4] bg-[#FFFCF3]"
      }`}
    >
      {isPro && (
        <div className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-[#3D6A95] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-white shadow-sm">
          <Sparkles className="w-2.5 h-2.5" />
          For everything
        </div>
      )}

      <div className="flex items-baseline justify-between">
        <h3
          className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.01em] text-[#2A2520]"
          style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
        >
          {isPro ? "Pro" : "Free"}
        </h3>
        <div className="text-right">
          <div className="flex items-baseline gap-1 justify-end">
            <span
              className="text-[34px] sm:text-[38px] font-semibold tracking-tight text-[#2A2520]"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              {isPro ? "$15" : "$0"}
            </span>
            <span className="text-[12px] text-[#A89F92]">
              {isPro ? "/ month" : "forever"}
            </span>
          </div>
          {isPro && (
            <p className="text-[11px] text-[#A89F92] mt-0.5">
              Free while in beta
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-[13.5px] text-[#766E63] leading-relaxed">
        {isPro
          ? "For people who live in their inbox and want it to live for them."
          : "Everything you need to stop forgetting. Honestly, it's a lot."}
      </p>

      <div className="my-6 h-px bg-[#E6DCC4]/70" />

      <ul className="space-y-2.5">
        {items.map((item) => {
          const isUnlimited = item.toLowerCase().includes("unlimited");
          return (
            <li
              key={item}
              className="flex items-start gap-2.5 text-[13.5px] leading-[1.5]"
            >
              <span
                className={`mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  isPro ? "bg-[#5E8FBF]/15" : "bg-[#E6DCC4]/60"
                }`}
              >
                {isUnlimited ? (
                  <InfinityIcon
                    className={`h-2.5 w-2.5 ${
                      isPro ? "text-[#3D6A95]" : "text-[#766E63]"
                    }`}
                    strokeWidth={2.5}
                  />
                ) : (
                  <Check
                    className={`h-2.5 w-2.5 ${
                      isPro ? "text-[#3D6A95]" : "text-[#766E63]"
                    }`}
                    strokeWidth={3}
                  />
                )}
              </span>
              <span className="text-[#2A2520]">{item}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-8">
        {isPro ? (
          <button
            onClick={onPro}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#5E8FBF] px-5 py-3 text-[14px] font-medium text-white shadow-sm hover:bg-[#4A7AAB] hover:shadow-md transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Request Pro access</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : (
          <Link
            href="/login"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#E6DCC4] bg-[#FFFCF3] px-5 py-3 text-[14px] font-medium text-[#2A2520] hover:border-[#5E8FBF]/40 hover:text-[#3D6A95] transition-all"
          >
            <span>Start free</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Feature matrix row
// ───────────────────────────────────────────────────────────────────────

function FeatureRow({
  icon,
  label,
  hint,
  free,
  pro,
  proLabel,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  free: string | boolean;
  pro: string | boolean;
  proLabel?: string;
  last?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_120px_120px] items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 ${
        last ? "" : "border-b border-[#E6DCC4]/60"
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#D0E1F0]/50 text-[#3D6A95]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-[#2A2520] leading-tight">
            {label}
          </p>
          <p className="text-[11.5px] text-[#A89F92] leading-snug mt-0.5">
            {hint}
          </p>
        </div>
      </div>
      <Cell value={free} />
      <Cell value={pro} highlight={!!proLabel} label={proLabel} />
    </div>
  );
}

function Cell({
  value,
  highlight,
  label,
}: {
  value: string | boolean;
  highlight?: boolean;
  label?: string;
}) {
  if (value === true) {
    return (
      <div className="flex flex-col items-end sm:items-center">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#E8EFE5]">
          <Check className="h-3 w-3 text-[#6B8E68]" strokeWidth={3} />
        </span>
        {label && (
          <span className="mt-1 text-[9.5px] font-mono uppercase tracking-[0.14em] text-[#3D6A95] hidden sm:inline">
            {label}
          </span>
        )}
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex items-center justify-end sm:justify-center">
        <span className="inline-block h-px w-3 bg-[#D6CFC0]" />
      </div>
    );
  }
  // String value
  const isUnlimited = value.toLowerCase().includes("unlimited");
  return (
    <div className="flex flex-col items-end sm:items-center">
      <span
        className={`text-[12.5px] font-mono ${
          highlight || isUnlimited ? "text-[#3D6A95]" : "text-[#766E63]"
        } ${isUnlimited ? "font-semibold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// FAQ row
// ───────────────────────────────────────────────────────────────────────

function FaqRow({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-[#E6DCC4] bg-[#FFFCF3] open:bg-[#FFFCF3] open:shadow-[0_4px_16px_-8px_rgba(106,76,38,0.12)] transition-shadow">
      <summary className="cursor-pointer list-none px-5 py-4 flex items-start justify-between gap-3">
        <span className="text-[14px] sm:text-[15px] font-medium text-[#2A2520] leading-snug">
          {q}
        </span>
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FAF6EB] border border-[#E6DCC4] text-[#766E63] group-open:bg-[#5E8FBF] group-open:text-white group-open:border-[#5E8FBF] transition-colors">
          <span className="text-[11px] leading-none group-open:hidden">+</span>
          <span className="text-[11px] leading-none hidden group-open:inline">
            −
          </span>
        </span>
      </summary>
      <div className="px-5 pb-5 pt-1 text-[13.5px] leading-[1.65] text-[#766E63]">
        {children}
      </div>
    </details>
  );
}
