import type { SummaryCard } from "./types";

export function SummaryCardView({ card }: { card: SummaryCard }) {
  return (
    <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#E6DCC4] bg-gradient-to-r from-[#FAF6EB] to-[#FFFCF3]">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#5E8FBF]">Summary</p>
        {card.title && (
          <p className="text-[14px] font-semibold text-[#2A2520] mt-0.5">{card.title}</p>
        )}
      </div>
      <div className="px-4 py-3 space-y-4">
        {card.sections.map((section, i) => (
          <section key={i}>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#766E63] mb-2">
              {section.heading}
            </p>
            <ul className="space-y-1.5">
              {section.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-[#5E8FBF] shrink-0" />
                  <span className="text-[#2A2520]">
                    {item.text}
                    {item.from && (
                      <span className="text-[#A89F92] font-mono text-[11px]"> · {item.from}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
