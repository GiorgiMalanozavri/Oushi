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
  Check,
  BrainCircuit,
  Bell,
  Sunrise,
  Coffee,
  Sun,
  Moon,
  Mail,
  Calendar,
  Clock,
  Inbox,
  MessageCircle,
  Mic,
  Globe,
  Zap,
  FileText,
  Users,
  Watch,
  ShieldCheck,
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
    <div className="bg-[#FAF6EB] text-[#2A2520] relative overflow-hidden">
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
            <a href="#day" className="text-[13px] font-medium text-[#766E63] hover:text-[#2A2520] transition-colors">
              A day with it
            </a>
            <a href="#next" className="text-[13px] font-medium text-[#766E63] hover:text-[#2A2520] transition-colors">
              What&apos;s next
            </a>
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
              An inbox that won&apos;t<br />
              let you <span className="text-[#5E8FBF]">forget</span>
              <span className="text-[#A89F92]">.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-7 text-[17px] sm:text-[19px] leading-[1.55] text-[#766E63] max-w-xl mx-auto"
            >
              Reads your email. Remembers the names, the dates, the deadlines. Writes back like you would. So you stop saying &ldquo;oh shit, I forgot.&rdquo;
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

            {/* Trust copy — above the fold, more visible than the previous
                one-line strip. Investors + skeptics need this loud, not
                buried two clicks deep in the privacy policy. */}
            <motion.div
              variants={fadeUp}
              className="mt-7 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#FFFCF3]/80 backdrop-blur-sm border border-[#E6DCC4] text-[11.5px] text-[#766E63]"
              style={{
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.5) inset, 0 4px 16px -8px rgba(106,76,38,0.08)",
              }}
            >
              <Shield className="w-3 h-3 text-[#6B8E68]" />
              <span>
                <strong className="text-[#3F362C] font-semibold">
                  Your email stays yours.
                </strong>{" "}
                We never sell, share, or train on your data. Disconnect anytime.
              </span>
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
              Like Gmail, but it<br className="hidden sm:block" /> actually <span className="text-[#5E8FBF]">gets you</span>.
            </h2>
          </div>

          <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-5 sm:gap-6">
            <HowCard
              icon={<Clock className="w-3 h-3" />}
              verb="bumps"
              before="The email you keep meaning to reply to? Oushi"
              after="it back up."
            >
              <FollowupCardDemo />
            </HowCard>

            <HowCard
              icon={<Sparkles className="w-3 h-3" />}
              verb="writes"
              before="Reads your sent folder, then"
              after="back like you."
            >
              <VoiceCardDemo />
            </HowCard>

            <HowCard
              icon={<BrainCircuit className="w-3 h-3" />}
              verb="remembers"
              before="Your editor's name. Your flight time. Oushi"
              after="all of it."
            >
              <MemoryCardDemo />
            </HowCard>

            <HowCard
              icon={<Sunrise className="w-3 h-3" />}
              verb="wakes you"
              before="No more scanning fifty subject lines. Oushi"
              after="with the 3 things that matter."
            >
              <BriefingCardDemo />
            </HowCard>
          </div>
        </section>

        {/* ============= A DAY ============= */}
        <section id="day" className="px-6 py-24 sm:py-32 bg-[#F0E9D6]/30 border-y border-[#E6DCC4]/60">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#5E8FBF] mb-4">
              A typical day
            </p>
            <h2 className="text-[34px] sm:text-[48px] font-semibold tracking-[-0.02em] leading-[1.1]">
              You stop checking email.<br />
              <span className="text-[#5E8FBF]">Oushi tells you when.</span>
            </h2>
          </div>
          <DayTimeline />
        </section>

        {/* ============= WHAT'S NEXT ============= */}
        <section id="next" className="px-6 py-24 sm:py-32">
          <div className="max-w-2xl mx-auto text-center mb-14 sm:mb-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#5E8FBF] mb-4">
              Coming next
            </p>
            <h2 className="text-[34px] sm:text-[48px] font-semibold tracking-[-0.02em] leading-[1.1]">
              The roadmap, basically.
            </h2>
            <p className="mt-5 text-[15px] leading-[1.55] text-[#766E63] max-w-lg mx-auto">
              Where Oushi is headed. Some of this ships this year. The rest in the next 2-3.
            </p>
          </div>

          <div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            <NextCard
              eyebrow="This summer"
              icon={<FileText className="w-4 h-4" />}
              title="Reads attachments"
              desc="PDF flight confirmations. Image receipts. Contracts. Oushi reads inside them and remembers what matters."
            />
            <NextCard
              eyebrow="Late summer"
              icon={<Globe className="w-4 h-4" />}
              title="Across every inbox"
              desc="Outlook, iCloud, and eventually Slack DMs and iMessage. One layer between you and every channel."
            />
            <NextCard
              eyebrow="This fall"
              icon={<Watch className="w-4 h-4" />}
              title="iOS app + Apple Watch"
              desc="On your wrist. Glance the 3 things, swipe to dismiss, tap to hear. Built for the elevator."
            />
            <NextCard
              eyebrow="Late 2026"
              icon={<Mic className="w-4 h-4" />}
              title="Voice mode"
              desc="'Hey Oushi, what's important today?' Headphones reply with a 15-second summary. Or ask it anything about anyone."
            />
            <NextCard
              eyebrow="2027"
              icon={<Users className="w-4 h-4" />}
              title="Sends follow-ups for you"
              desc="Tell Oushi 'nudge them if no reply in 3 days.' It sends the follow-up in your voice. Stops the moment they reply."
            />
            <NextCard
              eyebrow="2027–28"
              icon={<Zap className="w-4 h-4" />}
              title="One sentence, many actions"
              desc="'Book the flight, add to calendar, expense to work, tell Maya I'll be in NYC that week.' Five things, one line."
            />
          </div>
        </section>

        {/* ============= VALUE GRID ============= */}
        <section className="px-6 py-20 sm:py-28 text-center">
          <div className="max-w-xl mx-auto mb-12">
            <h2 className="text-[34px] sm:text-[44px] font-semibold tracking-[-0.02em] leading-[1.1]">
              Built to feel like<br />
              <span className="text-[#5E8FBF]">a friend, not a tool</span>.
            </h2>
          </div>

          <div className="max-w-4xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ValueCard icon={<BrainCircuit />} title="Remembers everything" desc="Who your editor is, your trips, what you owe people." />
            <ValueCard icon={<Send />} title="Send from inside" desc="One tap sends a reply through your Gmail. No tab-switching." />
            <ValueCard icon={<Calendar />} title="Saves to calendar" desc="Flight bookings, meetings, deadlines — saved without you asking." />
            <ValueCard icon={<MessageCircle />} title="Ask anything" desc="'Did Sarah reply?' 'What's my flight number?' Plain English." />
            <ValueCard icon={<Mail />} title="Daily digest" desc="One email every morning. The 2-3 things that matter. Done." />
            <ValueCard icon={<Shield />} title="Yours alone" desc="Your inbox is yours. Nothing shared. Disconnect or delete anytime." />
          </div>
        </section>

        {/* ============= FINAL CTA ============= */}
        <section id="pricing" className="px-6 py-32 sm:py-40 text-center">
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
              Connect your Gmail in 30 seconds. No card. No commitment.
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

// ============= NEXT CARD (coming soon) =============

function NextCard({
  eyebrow,
  icon,
  title,
  desc,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55 }}
      className="rounded-2xl border border-[#E6DCC4] bg-[#FFFCF3] p-6 hover:border-[#5E8FBF]/30 transition-all"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-md bg-[#D0E1F0] flex items-center justify-center text-[#3D6A95] [&>svg]:w-3.5 [&>svg]:h-3.5">
          {icon}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#A89F92]">{eyebrow}</span>
      </div>
      <h3 className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-[#2A2520]">{title}</h3>
      <p className="mt-2 text-[14px] leading-[1.55] text-[#766E63]">{desc}</p>
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

const HERO_BRIEF = "Two things stand out today: Maya is waiting on the Q3 draft (3 days), and your United flight Thursday got upgraded to first class.";

function HeroPreview() {
  return (
    <div className="rounded-2xl border border-[#E6DCC4] bg-[#FFFCF3] shadow-[0_32px_80px_-32px_rgba(94,143,191,0.4)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#E6DCC4]/80 bg-[#FAF6EB]/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E0B5B5]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#E0D5B5]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#B5D5C5]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6B8E68] animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#A89F92]">Live</span>
        </div>
      </div>
      <div className="grid grid-cols-[170px_1fr] sm:grid-cols-[200px_1fr]">
        <div className="border-r border-[#E6DCC4]/80 bg-[#FFFCF3] p-3 hidden sm:block">
          <div className="flex items-center gap-1.5 mb-4 px-1">
            <OushiMark size={20} />
            <span className="text-[12px] font-semibold">Oushi</span>
          </div>
          <SidebarItem label="Today" active />
          <SidebarItem label="Urgent" count={2} tone="terra" />
          <SidebarItem label="Awaiting reply" count={3} tone="sky" />
          <SidebarItem label="Following up" count={1} tone="ink" />
          <div className="mt-3 px-1.5 py-1 text-[8px] font-mono uppercase tracking-[0.14em] text-[#A89F92]">Boards</div>
          <SidebarItem label="Engineering" count={12} />
          <SidebarItem label="Family" count={4} />
        </div>
        <div className="p-5 sm:p-7">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-1">
            Sunday morning
          </p>
          <h3 className="text-[20px] sm:text-[24px] font-semibold tracking-tight mb-4 leading-tight">
            Good morning, Giorgi.
          </h3>
          <BriefingTyper text={HERO_BRIEF} />
          <div className="mt-4 space-y-1.5">
            <RowMock score={92} sender="Maya Chen" subject="Re: Q3 draft revisions" age="3d" hot />
            <RowMock score={85} sender="United Airlines" subject="Your flight upgrade is confirmed" age="2h" />
            <RowMock score={71} sender="Berlin AI Conference" subject="CFP closes Friday" age="5h" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ label, count, active = false, tone = "default" }: { label: string; count?: number; active?: boolean; tone?: "default" | "terra" | "sky" | "ink" }) {
  const countColor = tone === "terra" ? "text-[#B86B4A]" : tone === "ink" ? "text-[#3D6A95]" : tone === "sky" ? "text-[#5E8FBF]" : "text-[#A89F92]";
  return (
    <div className={`flex items-center justify-between px-1.5 py-1 rounded text-[11px] mb-0.5 ${active ? "bg-[#D0E1F0]/40 text-[#2A2520] font-medium" : "text-[#766E63]"}`}>
      <span className="truncate">{label}</span>
      {count !== undefined && <span className={`text-[10px] font-mono ${countColor}`}>{count}</span>}
    </div>
  );
}

function BriefingTyper({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 14);
    return () => clearInterval(interval);
  }, [inView, text]);

  return (
    <div ref={ref} className="rounded-lg border border-[#5E8FBF]/20 bg-[#D0E1F0]/15 p-3.5 flex items-start gap-2.5">
      <div className="w-5 h-5 rounded-md bg-[#D0E1F0] flex items-center justify-center shrink-0">
        <Sparkles className="w-2.5 h-2.5 text-[#3D6A95]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#5E8FBF] mb-0.5">
          Oushi
        </p>
        <p className="text-[12px] leading-[1.5] text-[#2A2520]">
          {displayed}
          {displayed.length < text.length && (
            <span className="inline-block w-[1.5px] h-[11px] bg-[#5E8FBF] align-middle ml-0.5 animate-pulse" />
          )}
        </p>
      </div>
    </div>
  );
}

function RowMock({ score, sender, subject, age, hot }: {
  score: number; sender: string; subject: string; age: string; hot?: boolean;
}) {
  const shade = score >= 90 ? "bg-[#3D6A95] text-white" : score >= 70 ? "bg-[#5E8FBF] text-white" : "bg-[#D0E1F0] text-[#3D6A95]";
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#FAF6EB]/60 transition-colors">
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${shade} text-[10px] font-semibold`}>
        {score}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-semibold text-[#2A2520] truncate leading-tight">{sender}</span>
          <span className={`text-[10px] font-mono shrink-0 ${hot ? "text-[#B86B4A]" : "text-[#A89F92]"}`}>{age}</span>
        </div>
        <p className="text-[11px] text-[#766E63] truncate leading-tight mt-0.5">{subject}</p>
      </div>
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

// ============= DAY TIMELINE =============

const DAY = [
  { time: "8:00 AM", icon: <Sunrise className="w-3.5 h-3.5" />, title: "Morning brief lands in your inbox", body: "The 2-3 things that need you today, in plain prose. Not a list." },
  { time: "10:30 AM", icon: <Coffee className="w-3.5 h-3.5" />, title: "Drafts ready when you sit down", body: "Maya's reply is pre-written. Tweak one word, hit send." },
  { time: "1:00 PM", icon: <Sun className="w-3.5 h-3.5" />, title: "LinkedIn spam never reached you", body: "Muted weeks ago. Never appeared in your inbox today." },
  { time: "3:00 PM", icon: <Bell className="w-3.5 h-3.5" />, title: "Sarah is waiting (5 days)", body: "Oushi surfaces the nudge with a draft already in your voice." },
  { time: "6:00 PM", icon: <Calendar className="w-3.5 h-3.5" />, title: "Flight saved to your calendar", body: "United confirmation came in. Already on Thursday at 4:15 PM." },
  { time: "10:00 PM", icon: <Moon className="w-3.5 h-3.5" />, title: "Wind-down summary", body: "14 emails handled. 6 replies sent in your voice. Nothing else needs you." },
];

function DayTimeline() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="space-y-8 sm:space-y-10">
        {DAY.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: i * 0.04 }}
            className="flex gap-5"
          >
            <div className="shrink-0 w-[64px] sm:w-[80px] text-right pt-1">
              <p className="text-[11px] font-mono font-medium uppercase tracking-[0.14em] text-[#A89F92]">{m.time}</p>
            </div>
            <div className="relative shrink-0 flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-[#FFFCF3] border-2 border-[#5E8FBF]/40 flex items-center justify-center text-[#5E8FBF] shadow-sm z-10">
                {m.icon}
              </div>
              {i < DAY.length - 1 && <div className="flex-1 w-px bg-[#E6DCC4] mt-1" />}
            </div>
            <div className="flex-1 min-w-0 pt-1 pb-1">
              <h4 className="text-[15px] sm:text-[16px] font-semibold tracking-tight text-[#2A2520]">{m.title}</h4>
              <p className="mt-1 text-[13px] leading-[1.55] text-[#766E63]">{m.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="mt-14 text-center text-[14px] italic text-[#766E63] max-w-md mx-auto"
      >
        You never opened Gmail once.
      </motion.p>
    </div>
  );
}
