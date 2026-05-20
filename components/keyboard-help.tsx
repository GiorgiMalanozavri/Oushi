"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

interface ShortcutRow {
  keys: string[];
  description: string;
}

const SHORTCUTS: { section: string; rows: ShortcutRow[] }[] = [
  {
    section: "Navigation",
    rows: [
      { keys: ["⌘", "K"], description: "Open Ask Oushi / command palette" },
      { keys: ["J"], description: "Next email" },
      { keys: ["K"], description: "Previous email" },
      { keys: ["Enter"], description: "Open focused email" },
      { keys: ["G", "T"], description: "Go to Today" },
      { keys: ["G", "U"], description: "Go to Urgent" },
      { keys: ["G", "A"], description: "Go to Awaiting reply" },
      { keys: ["G", "F"], description: "Go to Follow ups" },
      { keys: ["G", "R"], description: "Go to Reference" },
    ],
  },
  {
    section: "Actions",
    rows: [
      { keys: ["E"], description: "Archive / dismiss" },
      { keys: ["R"], description: "Open + draft reply" },
      { keys: ["S"], description: "Snooze" },
      { keys: ["Esc"], description: "Close modal or panel" },
    ],
  },
  {
    section: "Help",
    rows: [{ keys: ["?"], description: "Show this help" }],
  },
];

export function KeyboardHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Esc closes the help overlay even though the global handler is paused
  // — we want the help dialog to always be dismissible.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="kbd-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-[#2A2520]/40 backdrop-blur-sm"
          />
          <motion.div
            key="kbd-panel"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-[min(560px,90vw)] max-h-[80vh] overflow-y-auto rounded-2xl bg-[#FFFCF3] border border-[#E6DCC4] shadow-2xl">
              <div className="px-6 py-4 border-b border-[#E6DCC4] flex items-center justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#2A2520]">
                    Keyboard shortcuts
                  </h2>
                  <p className="text-[11.5px] text-[#766E63] mt-0.5">
                    Move through Oushi without the mouse.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="text-[#A89F92] hover:text-[#2A2520] p-1 rounded transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-4 space-y-5">
                {SHORTCUTS.map((section) => (
                  <div key={section.section}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2">
                      {section.section}
                    </p>
                    <div className="space-y-1">
                      {section.rows.map((row) => (
                        <div
                          key={row.description}
                          className="flex items-center justify-between gap-3 py-1.5"
                        >
                          <span className="text-[12.5px] text-[#2A2520]">
                            {row.description}
                          </span>
                          <div className="flex items-center gap-1">
                            {row.keys.map((k, i) => (
                              <kbd
                                key={i}
                                className="text-[10.5px] font-mono text-[#3D6A95] bg-[#FAF6EB] rounded px-1.5 py-0.5 border border-[#E6DCC4] min-w-[20px] text-center"
                              >
                                {k}
                              </kbd>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-3 border-t border-[#E6DCC4] bg-[#FAF6EB]/40 text-[11px] text-[#A89F92]">
                Shortcuts are disabled while typing in an input field.
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
