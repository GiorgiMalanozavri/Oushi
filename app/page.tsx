"use client";

import Link from "next/link";
import { motion, type Variants, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { OushiMark } from "@/components/oushi-mark";
import {
  ArrowRight,
  Sparkles,
  Shield,
  Send,
  BrainCircuit,
  Sunrise,
  Mail,
  Calendar,
  Clock,
  MessageCircle,
} from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export default function LandingPage() {
  return (
    <div className="oushi-marketing bg-[#FAF6EB] text-[#2A2520] relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[10%] -right-[15%] w-[55vw] h-[55vw] rounded-full bg-[#D0E1F0]/25 blur-[140px]" />
        <div className="absolute top-[80%] -left-[10%] w-[40vw] h-[40vw] rounded-full bg-[#F0E9D6]/40 blur-[140px]" />
      </div>

      {/* Floating pill nav */}
      <header className="sticky top-4 z-30 px-4 sm:px-6">
        <nav className="max-w-3xl mx-auto rounded-full border border-[#E6DCC4] bg-[#FFFCF3]/90 backdrop-blur-md shadow-[0_8px_28px_-12px_rgba(94,143,191,0.18)] pl-4 pr-2 py-2 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 px-1">
            <OushiMark size={24} />
            <span className="text-[15px] font-semibold tracking-tight">Oushi</span>
          </Link>
          <div className="hidden sm:flex items-center gap-7">
            <a href="#how" className="text-[13px] font-medium text-[#766E63] hover:text-[#2A2520] transition-colors">
              How it works
            </a>
            <Link href="/pricing" className="text-[13px] font-medium text-[#766E63] hover:text-[#2A2520] transition-colors">
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
        <section className="px-6 pt-24 sm:pt-32 pb-16 sm:pb-24 text-center">
          <motion.div initial="hidden" animate="show" variants={stagger} className="max-w-3xl mx-auto">
            <motion.p
              variants={fadeUp}
              className="font-mono text-[12px] text-[#A89F92] mb-8"
            >
              <span className="text-[#3D6A95]">ou·shi</span> <span className="text-[#A89F92]">/ˈoʊʃi/</span> <em className="text-[#766E63]">verb.</em> the moment you remember you forgot.
            </motion.p>

            <motion.h1
              variants={fadeUp}
              className="text-[44px] sm:text-[64px] lg:text-[78px] font-semibold tracking-[-0.02em] leading-[1.04]"
            >
              An AI that<br />
              actually <span className="text-[#5E8FBF]">knows you</span>
              <span className="text-[#A89F92]">.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-7 text-[17px] sm:text-[19px] leading-[1.55] text-[#766E63] max-w-xl mx-auto"
            >
              Oushi reads your email, your meetings, your messages, your docs — and answers anything you ask about your own life. Catches the oh-shit moments before you have them.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2.5 whitespace-nowrap rounded-lg bg-[#5E8FBF] px-6 py-3 text-[15px] font-medium text-white shadow-sm hover:bg-[#4A7AAB] hover:shadow-md transition-all"
              >
                <span>Get Oushi free</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-medium text-[#766E63] hover:text-[#2A2520] transition-colors py-3"
              >
                <span>See what it does</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </motion.div>

          </motion.div>

          {/* Hero product mock */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-16 sm:mt-20 max-w-3xl mx-auto"
          >
            <HeroPreview />
          </motion.div>
        </section>

        {/* ============= HOW IT WORKS (Granola-style cards) ============= */}
        <section id="how" className="px-6 py-20 sm:py-28">
          <div className="max-w-2xl mx-auto text-center mb-14 sm:mb-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#5E8FBF] mb-4">
              What it does
            </p>
            <h2 className="text-[40px] sm:text-[56px] font-semibold tracking-[-0.02em] leading-[1.08]">
              Like ChatGPT, but it<br className="hidden sm:block" /> actually <span className="text-[#5E8FBF]">knows you</span>.
            </h2>
          </div>

          <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-5 sm:gap-6">
            <HowCard
              icon={<MessageCircle className="w-3 h-3" />}
              verb="answers"
              before="Ask in plain English. Oushi"
              after="from every surface at once."
            >
              <VoiceCardDemo />
            </HowCard>

            <HowCard
              icon={<BrainCircuit className="w-3 h-3" />}
              verb="remembers"
              before="Every promise, every name, every deadline. Oushi"
              after="so you don't have to."
            >
              <MemoryCardDemo />
            </HowCard>

            <HowCard
              icon={<Clock className="w-3 h-3" />}
              verb="catches"
              before="The thing you almost forgot? Oushi"
              after="it before you have an oh-shit."
            >
              <FollowupCardDemo />
            </HowCard>
          </div>
        </section>

        {/* ============= VALUE GRID ============= */}
        <section className="px-6 py-20 sm:py-28 text-center">
          <div className="max-w-xl mx-auto mb-12">
            <h2 className="text-[34px] sm:text-[44px] font-semibold tracking-[-0.02em] leading-[1.1]">
              An AI you can<br />
              <span className="text-[#5E8FBF]">actually talk to</span>.
            </h2>
            <p className="mt-4 text-[15px] text-[#766E63] leading-[1.55] max-w-md mx-auto">
              Not a feature checklist. A real assistant that knows what&apos;s in your inbox, your calendar, your meetings, and your docs.
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ValueCard icon={<MessageCircle />} title="Just ask" desc="&ldquo;What did Sarah say about Q3?&rdquo; Oushi pulls the answer from every surface at once." />
            <ValueCard icon={<BrainCircuit />} title="Memory that compounds" desc="Names, deadlines, promises, what people said. The longer you use Oushi, the more it knows." />
            <ValueCard icon={<Sunrise />} title="Morning briefing" desc="The 2-3 things you need to know today. Synthesized from every tool you use." />
            <ValueCard icon={<Send />} title="Drafts in your voice" desc="Replies to email, Slack, anywhere — written as you, not as ChatGPT." />
            <ValueCard icon={<Calendar />} title="Catches the oh-shit" desc="Promises about to slip. Birthdays you forgot. Deadlines you didn't see coming." />
            <ValueCard icon={<Shield />} title="Yours alone" desc="Read-only access. Nothing sold, nothing used to train public models. Disconnect anytime." />
          </div>
        </section>

        {/* ============= FINAL CTA ============= */}
        <section id="get-started" className="px-6 py-32 sm:py-40 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl mx-auto"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#5E8FBF] mb-4">
              Free during beta
            </p>
            <h2 className="text-[40px] sm:text-[60px] font-semibold tracking-[-0.02em] leading-[1.05]">
              No more &ldquo;oh shit,<br />
              <span className="text-[#5E8FBF]">I forgot.&rdquo;</span>
            </h2>
            <p className="mt-6 text-[16px] text-[#766E63]">
              Connect Gmail in 30 seconds. Oushi reads the rest as you go.
              No card, no commitment.
            </p>
            <Link
              href="/login"
              className="mt-10 inline-flex items-center gap-2.5 whitespace-nowrap rounded-lg bg-[#5E8FBF] px-7 py-3.5 text-[15px] font-medium text-white shadow-sm hover:bg-[#4A7AAB] hover:shadow-lg hover:scale-[1.02] transition-all"
            >
              <span>Get Oushi free</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="mt-6 text-[12px] text-[#A89F92] flex items-center justify-center gap-1.5">
              <Shield className="w-3 h-3" />
              Disconnect anytime · read-only access
            </p>
          </motion.div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[#E6DCC4]/60 py-10">
        <div className="max-w-5xl mx-auto px-6">
          {/* Founder line — addresses "who built this?" investor question */}
          <div className="mb-6 pb-6 border-b border-[#E6DCC4]/60">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#A89F92] mb-2">
              Built by
            </p>
            <p
              className="text-[16px] text-[#2A2520]"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              Giorgi Malania — solo founder, shipping in public.
            </p>
            <p className="text-[12.5px] text-[#766E63] mt-1.5 leading-relaxed max-w-[560px]">
              Building Oushi because email shouldn&apos;t be where commitments go
              to die. Reach me directly at{" "}
              <a
                href="mailto:giorgi@oushi.app"
                className="text-[#B86B4A] underline-offset-2 hover:underline"
              >
                giorgi@oushi.app
              </a>
              .
            </p>
          </div>

          {/* A quiet line on what Oushi does (and doesn't do) with the
              inbox it reads. Plain language, not the bullet-list /
              "we never X, never Y" cadence that reads as AI boilerplate. */}
          <div className="mb-6 pb-6 border-b border-[#E6DCC4]/60 flex items-start gap-2.5">
            <Shield className="w-3.5 h-3.5 text-[#6B8E68] mt-0.5 shrink-0" />
            <p className="text-[12.5px] text-[#766E63] leading-relaxed max-w-[560px]">
              Oushi reads your inbox so it can do its job. That&apos;s the only
              reason we have access. Nothing is sold, nothing trains a public
              model, nothing leaves the systems that serve you. You can
              disconnect from your Google account in two clicks and we&apos;re
              gone.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#A89F92]">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-[#5E8FBF]/30 flex items-center justify-center">
                <span className="text-[#3D6A95] text-[9px] font-semibold leading-none">
                  O
                </span>
              </div>
              <span>© Oushi {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-5">
              <a href="/privacy" className="hover:text-[#3D6A95]">
                Privacy
              </a>
              <a href="/terms" className="hover:text-[#3D6A95]">
                Terms
              </a>
              <a href="mailto:hello@oushi.app" className="hover:text-[#3D6A95]">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============= HIGHLIGHT PILL =============

function Highlight({ verb, icon }: { verb: string; icon: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 align-baseline rounded-md bg-[#D0E1F0] px-1.5 py-0.5 text-[#3D6A95] font-semibold">
      <span className="text-[#5E8FBF]">{icon}</span>
      <span>{verb}</span>
    </span>
  );
}

// ============= HOW-IT-WORKS CARD =============

function HowCard({
  before,
  verb,
  after,
  icon,
  children,
}: {
  before: string;
  verb: string;
  after: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-3xl border border-[#E6DCC4] bg-[#FFFCF3] p-6 sm:p-8"
    >
      <h3 className="text-[24px] sm:text-[32px] font-semibold tracking-[-0.01em] leading-[1.2] text-[#2A2520]">
        {before}{" "}
        <Highlight verb={verb} icon={icon} />{" "}
        {after}
      </h3>
      <div className="mt-7 rounded-xl border border-[#E6DCC4]/80 bg-[#FAF6EB]/40 overflow-hidden">
        <div className="px-3 py-2 border-b border-[#E6DCC4]/60 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#E0B5B5]" />
          <span className="w-2 h-2 rounded-full bg-[#E0D5B5]" />
          <span className="w-2 h-2 rounded-full bg-[#B5D5C5]" />
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </motion.div>
  );
}

// ============= VALUE CARD =============

function ValueCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-[#E6DCC4]/80 bg-[#FFFCF3] p-5 text-left hover:border-[#5E8FBF]/30 hover:shadow-sm transition-all"
    >
      <div className="w-9 h-9 rounded-lg bg-[#D0E1F0] flex items-center justify-center text-[#3D6A95] mb-3 [&>svg]:w-4 [&>svg]:h-4">
        {icon}
      </div>
      <h4 className="text-[14px] font-semibold tracking-tight text-[#2A2520]">{title}</h4>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-[#766E63]">{desc}</p>
    </motion.div>
  );
}

// ============= HERO PREVIEW =============
//
// Hero mockup. Shows the core product moment: a user asks Oushi a
// single question, and Oushi answers by synthesizing across the
// Google surfaces it reads — Gmail, Calendar, Meet transcripts,
// Drive docs. This is the artifact that has to make someone go
// "wait what" in 3 seconds; the entire pitch fits in this one
// screenshot.

const HERO_USER_QUESTION = "What's the status of the Acme deal?";
const HERO_ANSWER_TYPED =
  "Three things you should know:\n\n• You sent the contract May 14. Still unsigned.\n• Sarah pushed back on NET-30 in Tuesday's email.\n• In Wednesday's Meet call their CEO mentioned NET-60 — that's likely the real ask.\n\nWant me to draft a counter at NET-45?";

const HERO_SOURCE_CHIPS: Array<{ label: string; tone: "mail" | "calendar" | "meet" | "drive" }> = [
  { label: "gmail · May 14", tone: "mail" },
  { label: "gmail · Tuesday", tone: "mail" },
  { label: "meet · Wed call", tone: "meet" },
  { label: "drive · contract.pdf", tone: "drive" },
];

function HeroPreview() {
  return (
    <div className="rounded-2xl border border-[#E6DCC4] bg-[#FFFCF3] shadow-[0_32px_80px_-32px_rgba(94,143,191,0.4)] overflow-hidden text-left">
      {/* Window chrome — same traffic-light pattern the old mock used,
          so the visual continuity stays. */}
      <div className="px-4 py-2.5 border-b border-[#E6DCC4]/80 bg-[#FAF6EB]/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E0B5B5]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#E0D5B5]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#B5D5C5]" />
        </div>
        <div className="flex items-center gap-1.5">
          <OushiMark size={14} />
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A89F92]">Ask Oushi</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6B8E68] animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#A89F92]">Live</span>
        </div>
      </div>

      <div className="p-5 sm:p-7 space-y-4">
        {/* User message — right-aligned, blue bubble, mirrors the
            real Ask Oushi chat surface. */}
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#5E8FBF] text-white px-3.5 py-2 text-[13.5px] leading-[1.5] shadow-sm">
            {HERO_USER_QUESTION}
          </div>
        </div>

        {/* Oushi message — left-aligned, cream bubble + sources */}
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#D0E1F0] flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-[#3D6A95]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#5E8FBF] mb-1">
              Oushi · pulled from 4 sources
            </p>
            <div className="rounded-2xl rounded-tl-sm bg-[#FAF6EB] border border-[#E6DCC4] px-3.5 py-2.5 max-w-full">
              <HeroAnswerTyper text={HERO_ANSWER_TYPED} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {HERO_SOURCE_CHIPS.map((s) => (
                <SourceChip key={s.label} label={s.label} tone={s.tone} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-source pill rendered under Oushi's answer. The tone maps to a
 * brand color per Google surface — mail terra, calendar amber, meet
 * ink, drive sage — so at a glance the user sees Oushi pulled from
 * multiple places. This is the entire pitch in a row of chips.
 */
function SourceChip({
  label,
  tone,
}: {
  label: string;
  tone: "mail" | "calendar" | "meet" | "drive";
}) {
  const styles =
    tone === "mail"
      ? "bg-[#F5E8E0]/60 border-[#B86B4A]/30 text-[#A65B3F]"
      : tone === "calendar"
        ? "bg-[#FAF1DC]/60 border-[#C99A50]/30 text-[#8E6A2A]"
        : tone === "meet"
          ? "bg-[#D0E1F0]/40 border-[#5E8FBF]/30 text-[#3D6A95]"
          : "bg-[#E8EFE5]/60 border-[#6B8E68]/30 text-[#4F6B4D]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-mono ${styles}`}
    >
      <span className="w-1 h-1 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

/**
 * Types Oushi's answer in over ~2.2s once the hero scrolls into
 * view. Bullets are preserved via a simple newline split — the
 * effect is the "AI thinking and answering" feeling without
 * relying on framer-motion's per-character primitives.
 */
function HeroAnswerTyper({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const interval = setInterval(() => {
      i += 2; // 2 chars per tick — faster than the old briefing typer
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 14);
    return () => clearInterval(interval);
  }, [inView, text]);

  // Render with newlines preserved — bullet lines need to wrap.
  return (
    <div ref={ref}>
      <p className="text-[13px] leading-[1.6] text-[#2A2520] whitespace-pre-wrap">
        {displayed}
        {displayed.length < text.length && (
          <span className="inline-block w-[1.5px] h-[12px] bg-[#5E8FBF] align-middle ml-0.5 animate-pulse" />
        )}
      </p>
    </div>
  );
}

// ============= FOLLOWUP CARD DEMO =============

function FollowupCardDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} className="space-y-2">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#FFFCF3] border border-[#E6DCC4]/80"
      >
        <div className="w-7 h-7 rounded-md border border-[#3D6A95]/30 bg-[#3D6A95]/10 flex items-center justify-center text-[10px] font-semibold text-[#3D6A95] shrink-0">
          5d
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[#2A2520] truncate leading-tight">Sarah Park</p>
          <p className="text-[11px] text-[#766E63] truncate leading-tight mt-0.5">You wrote her about the contract</p>
        </div>
        <motion.span
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="text-[10px] text-[#3D6A95] bg-[#D0E1F0] px-2 py-0.5 rounded-full font-medium shrink-0"
        >
          nudge?
        </motion.span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#FFFCF3] border border-[#E6DCC4]/80"
      >
        <div className="w-7 h-7 rounded-md border border-[#3D6A95]/30 bg-[#3D6A95]/10 flex items-center justify-center text-[10px] font-semibold text-[#3D6A95] shrink-0">
          8d
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[#2A2520] truncate leading-tight">Marcus Chen</p>
          <p className="text-[11px] text-[#766E63] truncate leading-tight mt-0.5">Re: investor intro</p>
        </div>
        <motion.span
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="text-[10px] text-[#3D6A95] bg-[#D0E1F0] px-2 py-0.5 rounded-full font-medium shrink-0"
        >
          nudge?
        </motion.span>
      </motion.div>
    </div>
  );
}

// ============= VOICE CARD DEMO =============

function VoiceCardDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [displayed, setDisplayed] = useState("");
  const draft = "got it — Thursday works. anything specific for legal?";

  useEffect(() => {
    if (!inView) return;
    const start = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayed(draft.slice(0, i));
        if (i >= draft.length) clearInterval(interval);
      }, 25);
    }, 400);
    return () => clearTimeout(start);
  }, [inView]);

  return (
    <div ref={ref}>
      <div className="mb-2 text-[11px] text-[#A89F92] font-mono uppercase tracking-[0.12em]">
        Drafting in your voice…
      </div>
      <div className="rounded-md bg-[#FFFCF3] border border-[#E6DCC4]/80 px-3 py-2.5 min-h-[64px]">
        <p className="text-[13px] leading-[1.55] text-[#2A2520]">
          {displayed}
          {displayed.length < draft.length && (
            <span className="inline-block w-[2px] h-[13px] bg-[#5E8FBF] align-middle ml-0.5 animate-pulse" />
          )}
        </p>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={displayed.length >= draft.length ? { opacity: 1 } : {}}
        transition={{ duration: 0.3 }}
        className="mt-2 flex justify-end"
      >
        <button className="inline-flex items-center gap-1 rounded-md bg-[#5E8FBF] px-3 py-1 text-[11px] font-medium text-white">
          <Send className="w-3 h-3" />
          Send
        </button>
      </motion.div>
    </div>
  );
}

// ============= MEMORY CARD DEMO =============

const MEMS = [
  { kind: "Person", subject: "Maya Chen", content: "Editor at The Verge. Drafts due Thursday." },
  { kind: "Deadline", subject: "Berlin headshot", content: "Friday — before they can publish." },
  { kind: "Trip", subject: "NYC June 4–8", content: "Staying with sister, dinner with Sarah Sat." },
];

function MemoryCardDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div ref={ref} className="space-y-2">
      {MEMS.map((m, i) => (
        <motion.div
          key={m.subject}
          initial={{ opacity: 0, x: -12 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: i * 0.15, duration: 0.5 }}
          className="flex items-start gap-3 rounded-md bg-[#FFFCF3] border border-[#E6DCC4]/80 px-3 py-2.5"
        >
          <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#5E8FBF] mt-0.5 w-[60px] shrink-0">
            {m.kind}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[#2A2520] truncate leading-tight">{m.subject}</p>
            <p className="text-[11px] text-[#766E63] leading-snug mt-0.5">{m.content}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ============= BRIEFING CARD DEMO =============

const SHORT_BRIEF = "Maya's waiting on the Q3 draft Thursday. Berlin conference accepted your talk — need headshot by Friday. Sarah confirmed dinner Saturday.";

function BriefingCardDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(SHORT_BRIEF.slice(0, i));
      if (i >= SHORT_BRIEF.length) clearInterval(interval);
    }, 18);
    return () => clearInterval(interval);
  }, [inView]);

  return (
    <div ref={ref}>
      <div className="flex items-center gap-1.5 mb-3 text-[10px] font-mono uppercase tracking-[0.12em] text-[#A89F92]">
        <Mail className="w-2.5 h-2.5" />
        <span>Inbox · 8:00 AM</span>
      </div>
      <p className="text-[13px] font-semibold text-[#2A2520] mb-2">Your Tuesday briefing</p>
      <p className="text-[12px] leading-[1.55] text-[#2A2520] min-h-[60px]">
        {displayed}
        {displayed.length < SHORT_BRIEF.length && (
          <span className="inline-block w-[1.5px] h-[12px] bg-[#5E8FBF] align-middle ml-0.5 animate-pulse" />
        )}
      </p>
    </div>
  );
}

