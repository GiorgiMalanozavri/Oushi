"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { ChecklistCard } from "./types";

export function ChecklistCardView({ card }: { card: ChecklistCard }) {
  // Local check state — these are advisory todos pulled from emails,
  // not persisted yet. Letting the user tick them off still feels good.
  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(card.items.map((it, i) => (it.completed ? i : -1)).filter((i) => i >= 0))
  );

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const doneCount = checked.size;

  return (
    <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#E6DCC4] bg-gradient-to-r from-[#FAF6EB] to-[#FFFCF3]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#5E8FBF]">Checklist</p>
            {card.title && (
              <p className="text-[14px] font-semibold text-[#2A2520] mt-0.5">{card.title}</p>
            )}
          </div>
          <p className="text-[11px] text-[#A89F92] font-mono tabular-nums">
            {doneCount}/{card.items.length}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-[#E6DCC4]/50">
        {card.items.map((it, i) => {
          const isChecked = checked.has(i);
          return (
            <li key={i}>
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#FAF6EB] transition-colors group"
              >
                <span
                  className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${
                    isChecked
                      ? "bg-[#5E8FBF] border-[#5E8FBF]"
                      : "bg-white border-[#D6CDB8] group-hover:border-[#5E8FBF]"
                  }`}
                >
                  {isChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[13px] leading-snug ${
                      isChecked ? "line-through text-[#A89F92]" : "text-[#2A2520]"
                    }`}
                  >
                    {it.text}
                  </p>
                  {it.detail && (
                    <p
                      className={`text-[12px] mt-0.5 leading-relaxed ${
                        isChecked ? "text-[#A89F92]/70" : "text-[#766E63]"
                      }`}
                    >
                      {it.detail}
                    </p>
                  )}
                  {it.source && (
                    <p className="text-[10.5px] text-[#A89F92] mt-1 font-mono">{it.source}</p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
