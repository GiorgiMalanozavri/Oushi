"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Sunrise,
  Calendar,
  Coffee,
  Briefcase,
  ChevronDown,
  X,
  Loader2,
} from "lucide-react";

export type SnoozePreset =
  | "later_today"
  | "tomorrow_morning"
  | "next_week"
  | "this_weekend"
  | "next_free"
  | "after_meetings"
  | "custom";

interface Props {
  /** Called when the user picks a preset. Should return the resolved reason. */
  onSnooze: (
    preset: SnoozePreset,
    customUntil?: string
  ) => Promise<string | null>;
  /** Optional className for the trigger button. */
  className?: string;
  /** Label override */
  label?: string;
}

interface PresetOption {
  id: SnoozePreset;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
  subtitle: string;
  smart?: boolean; // marks calendar-aware presets
}

const PRESETS: PresetOption[] = [
  {
    id: "next_free",
    icon: Sunrise,
    label: "When my calendar clears",
    subtitle: "Next free 30+ min today",
    smart: true,
  },
  {
    id: "after_meetings",
    icon: Briefcase,
    label: "After my meetings",
    subtitle: "End of your last meeting today",
    smart: true,
  },
  {
    id: "later_today",
    icon: Coffee,
    label: "Later today",
    subtitle: "In 3 hours",
  },
  {
    id: "tomorrow_morning",
    icon: Sunrise,
    label: "Tomorrow morning",
    subtitle: "9:00 am",
  },
  {
    id: "this_weekend",
    icon: Calendar,
    label: "This weekend",
    subtitle: "Saturday 9:00 am",
  },
  {
    id: "next_week",
    icon: Calendar,
    label: "Next week",
    subtitle: "Monday 9:00 am",
  },
];

export function SnoozePopover({ onSnooze, className = "", label = "Snooze" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<SnoozePreset | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Default the custom date to tomorrow
  useEffect(() => {
    if (showCustom && !customDate) {
      const tmrw = new Date();
      tmrw.setDate(tmrw.getDate() + 1);
      setCustomDate(tmrw.toISOString().slice(0, 10));
    }
  }, [showCustom, customDate]);

  const pick = async (preset: SnoozePreset, customUntil?: string) => {
    setBusy(preset);
    try {
      await onSnooze(preset, customUntil);
      setOpen(false);
      setShowCustom(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#E6DCC4] bg-[#FFFCF3] hover:border-[#5E8FBF]/40 hover:text-[#3D6A95] text-[12px] font-medium text-[#766E63] transition-all"
      >
        <Clock className="w-3 h-3" />
        {label}
        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 right-0 w-[280px] rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] shadow-[0_12px_32px_-8px_rgba(42,37,32,0.18)] overflow-hidden z-50"
          >
            {!showCustom ? (
              <>
                <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#A89F92]">
                    Snooze until
                  </p>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-[#A89F92] hover:text-[#2A2520] p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <ul>
                  {PRESETS.map((p) => {
                    const Icon = p.icon;
                    const isBusy = busy === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => pick(p.id)}
                          disabled={busy !== null}
                          className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#FAF6EB] transition-colors text-left disabled:opacity-50"
                        >
                          <div
                            className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                              p.smart ? "bg-[#D0E1F0]" : "bg-[#F0E9D6]"
                            }`}
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 text-[#3D6A95] animate-spin" />
                            ) : (
                              <Icon
                                className="w-3.5 h-3.5"
                                style={{ color: p.smart ? "#3D6A95" : "#766E63" }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-medium text-[#2A2520] leading-tight">
                              {p.label}
                              {p.smart && (
                                <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#3D6A95]">
                                  smart
                                </span>
                              )}
                            </p>
                            <p className="text-[10.5px] text-[#A89F92] mt-0.5">{p.subtitle}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  <li className="border-t border-[#E6DCC4]/50">
                    <button
                      onClick={() => setShowCustom(true)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#FAF6EB] transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-md bg-[#F0E9D6] flex items-center justify-center shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-[#766E63]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[12.5px] font-medium text-[#2A2520] leading-tight">
                          Pick a time
                        </p>
                        <p className="text-[10.5px] text-[#A89F92] mt-0.5">Custom date + time</p>
                      </div>
                    </button>
                  </li>
                </ul>
              </>
            ) : (
              <div className="p-3.5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#A89F92]">
                    Custom snooze
                  </p>
                  <button
                    onClick={() => setShowCustom(false)}
                    className="text-[11px] text-[#766E63] hover:text-[#2A2520]"
                  >
                    Back
                  </button>
                </div>
                <label className="block text-[11px] text-[#766E63] mb-1">Date</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-[#E6DCC4] bg-[#FFFCF3] text-[13px] text-[#2A2520] focus:outline-none focus:border-[#5E8FBF] mb-3"
                />
                <label className="block text-[11px] text-[#766E63] mb-1">Time</label>
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-[#E6DCC4] bg-[#FFFCF3] text-[13px] text-[#2A2520] focus:outline-none focus:border-[#5E8FBF] mb-3"
                />
                <button
                  onClick={() => {
                    const iso = new Date(`${customDate}T${customTime}:00`).toISOString();
                    pick("custom", iso);
                  }}
                  disabled={!customDate || busy !== null}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#5E8FBF] hover:bg-[#3D6A95] text-white text-[12.5px] font-medium transition-colors disabled:opacity-50"
                >
                  {busy === "custom" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Clock className="w-3 h-3" />
                  )}
                  Snooze until then
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
