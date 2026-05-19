"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { OushiMark } from "@/components/oushi-mark";
import { Mail, Sparkles, Calendar, Handshake, BellRing } from "lucide-react";

/**
 * Full-screen splash shown on a user's first dashboard load while the
 * initial Gmail sync + ranking pass is running. Replaces the previous
 * empty/half-loaded dashboard with a branded, narrated wait state.
 *
 * The status messages cycle on a timer that approximates the typical
 * sync duration (~60s). Even if the real sync is faster, the splash
 * stays mounted until the parent reloads.
 */

const STATUS_PHASES = [
  { icon: Mail, text: "Reading your last 30 days of email…" },
  { icon: Sparkles, text: "Learning what matters to you…" },
  { icon: Calendar, text: "Checking your calendar for context…" },
  { icon: Handshake, text: "Looking for promises you've made…" },
  { icon: BellRing, text: "Almost ready — setting up reminders…" },
];

const ROTATION_MS = 4500;

export function FirstSyncSplash() {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setPhaseIdx((i) => Math.min(i + 1, STATUS_PHASES.length - 1));
    }, ROTATION_MS);
    return () => clearInterval(t);
  }, []);

  const phase = STATUS_PHASES[phaseIdx];
  const Icon = phase.icon;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#FAF6EB] overflow-hidden">
      {/* Ambient gradient blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-[#D0E1F0]/30 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-[#F0E9D6]/40 blur-[120px]" />
      </div>

      <div className="relative flex flex-col items-center max-w-md text-center px-6">
        {/* Logo with breathing glow */}
        <div className="relative mb-7">
          <div className="absolute inset-0 rounded-2xl bg-[#5E8FBF]/30 blur-2xl oushi-glow" />
          <div className="relative oushi-breathe">
            <OushiMark size={64} />
          </div>
        </div>

        {/* Static title */}
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF] mb-3">
          Setting up Oushi
        </p>
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.01em] text-[#2A2520] leading-[1.15] mb-2">
          One moment while I read your inbox.
        </h1>
        <p className="text-[13.5px] text-[#766E63] leading-relaxed max-w-sm mb-10">
          Takes about a minute. After this, Oushi will keep working quietly in the background and only ping you when something matters.
        </p>

        {/* Rotating status line */}
        <div className="flex items-center gap-2.5 min-h-[24px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={phaseIdx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2.5"
            >
              <Icon className="w-3.5 h-3.5 text-[#5E8FBF]" />
              <span className="text-[13px] text-[#2A2520]">{phase.text}</span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress dots */}
        <div className="mt-6 flex items-center gap-1.5">
          {STATUS_PHASES.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all duration-500 ${
                i === phaseIdx
                  ? "w-6 bg-[#5E8FBF]"
                  : i < phaseIdx
                    ? "w-1 bg-[#5E8FBF]/40"
                    : "w-1 bg-[#E6DCC4]"
              }`}
            />
          ))}
        </div>

        {/* What's coming preview */}
        <div className="mt-12 grid grid-cols-3 gap-3 w-full max-w-sm">
          <PreviewTile icon={<Sparkles className="w-3.5 h-3.5" />} label="Briefing" />
          <PreviewTile icon={<Handshake className="w-3.5 h-3.5" />} label="Promises" />
          <PreviewTile icon={<BellRing className="w-3.5 h-3.5" />} label="Nudges" />
        </div>
      </div>
    </div>
  );
}

function PreviewTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-[#E6DCC4] bg-[#FFFCF3]/60 px-2 py-2 flex flex-col items-center gap-1">
      <span className="text-[#5E8FBF]">{icon}</span>
      <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#766E63]">
        {label}
      </span>
    </div>
  );
}
