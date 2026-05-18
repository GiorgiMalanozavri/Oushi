import {
  Plane,
  BedDouble,
  Calendar,
  Users,
  AlertCircle,
  Package,
  Mail,
  DollarSign,
  Circle,
  type LucideIcon,
} from "lucide-react";
import type { TimelineCard, TimelineIcon } from "./types";

const ICON_MAP: Record<TimelineIcon, LucideIcon> = {
  plane: Plane,
  hotel: BedDouble,
  calendar: Calendar,
  meeting: Users,
  deadline: AlertCircle,
  package: Package,
  mail: Mail,
  dollar: DollarSign,
  dot: Circle,
};

const ICON_TINT: Record<TimelineIcon, { bg: string; fg: string }> = {
  plane: { bg: "#D0E1F0", fg: "#3D6A95" },
  hotel: { bg: "#E8EFE5", fg: "#6B8E68" },
  calendar: { bg: "#F0E9D6", fg: "#766E63" },
  meeting: { bg: "#D0E1F0", fg: "#3D6A95" },
  deadline: { bg: "#F5E8E0", fg: "#B86B4A" },
  package: { bg: "#F0E9D6", fg: "#766E63" },
  mail: { bg: "#D0E1F0", fg: "#3D6A95" },
  dollar: { bg: "#E8EFE5", fg: "#6B8E68" },
  dot: { bg: "#F0E9D6", fg: "#766E63" },
};

export function TimelineCardView({ card }: { card: TimelineCard }) {
  return (
    <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] overflow-hidden shadow-sm">
      {card.title && (
        <div className="px-4 py-3 border-b border-[#E6DCC4] bg-gradient-to-r from-[#FAF6EB] to-[#FFFCF3]">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#5E8FBF]">Timeline</p>
          <p className="text-[14px] font-semibold text-[#2A2520] mt-0.5">{card.title}</p>
        </div>
      )}
      <div className="px-4 py-4">
        <ol className="relative">
          {/* Vertical connecting line */}
          <span
            className="absolute left-[14px] top-3 bottom-3 w-px bg-[#E6DCC4]"
            aria-hidden
          />
          {card.events.map((ev, i) => {
            const iconKey: TimelineIcon = ev.icon || "dot";
            const Icon = ICON_MAP[iconKey];
            const tint = ICON_TINT[iconKey];
            return (
              <li key={i} className="relative pl-10 pb-4 last:pb-0">
                <span
                  className="absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-[#FFFCF3]"
                  style={{ backgroundColor: tint.bg }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: tint.fg }} />
                </span>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[12.5px] font-medium text-[#2A2520]">{ev.title}</p>
                  <p className="text-[11px] text-[#A89F92] shrink-0 font-mono tabular-nums">
                    {ev.date}
                    {ev.time ? ` · ${ev.time}` : ""}
                  </p>
                </div>
                {ev.subtitle && (
                  <p className="text-[12px] text-[#766E63] mt-0.5">{ev.subtitle}</p>
                )}
                {ev.detail && (
                  <p className="text-[11.5px] text-[#A89F92] mt-1 leading-relaxed">{ev.detail}</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
