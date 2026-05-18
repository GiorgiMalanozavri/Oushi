import type { PeopleCard } from "./types";
import { CardActionRow, type CardActionContext } from "./card-actions";

const STATUS_STYLE: Record<
  NonNullable<PeopleCard["people"][number]["status"]>,
  { bg: string; fg: string; label: string }
> = {
  waiting: { bg: "#F5E8E0", fg: "#B86B4A", label: "Waiting on you" },
  replied: { bg: "#E8EFE5", fg: "#6B8E68", label: "Replied" },
  stale: { bg: "#F0E9D6", fg: "#766E63", label: "Stale" },
  fresh: { bg: "#D0E1F0", fg: "#3D6A95", label: "Fresh" },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function avatarColor(seed: string) {
  // Deterministic pastel based on name — cheap and pretty
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const palette = [
    { bg: "#D0E1F0", fg: "#3D6A95" },
    { bg: "#E8EFE5", fg: "#6B8E68" },
    { bg: "#F0E9D6", fg: "#766E63" },
    { bg: "#F5E8E0", fg: "#B86B4A" },
    { bg: "#E6DCC4", fg: "#766E63" },
    { bg: "#FFE8D6", fg: "#A35420" },
  ];
  return palette[hash % palette.length];
}

export function PeopleCardView({
  card,
  actionCtx,
}: {
  card: PeopleCard;
  actionCtx: CardActionContext;
}) {
  return (
    <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#E6DCC4] bg-gradient-to-r from-[#FAF6EB] to-[#FFFCF3]">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#5E8FBF]">People</p>
        {card.title && (
          <p className="text-[14px] font-semibold text-[#2A2520] mt-0.5">{card.title}</p>
        )}
      </div>
      <ul className="divide-y divide-[#E6DCC4]/50">
        {card.people.map((p, i) => {
          const color = avatarColor(p.name || p.email || String(i));
          const status = p.status ? STATUS_STYLE[p.status] : null;
          return (
            <li key={i} className="px-4 py-3 flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[12px] shrink-0"
                style={{ backgroundColor: color.bg, color: color.fg }}
              >
                {initials(p.name) || "·"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-medium text-[#2A2520] truncate">{p.name}</p>
                  {p.last_contact && (
                    <p className="text-[10.5px] text-[#A89F92] font-mono shrink-0 tabular-nums">
                      {p.last_contact}
                    </p>
                  )}
                </div>
                {(p.role || p.email) && (
                  <p className="text-[11.5px] text-[#766E63] truncate">
                    {p.role}
                    {p.role && p.email ? " · " : ""}
                    {p.email}
                  </p>
                )}
                {p.note && (
                  <p className="text-[12px] text-[#2A2520]/80 mt-1 leading-relaxed">{p.note}</p>
                )}
                {status && (
                  <span
                    className="inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: status.bg, color: status.fg }}
                  >
                    {status.label}
                  </span>
                )}
                {p.actions && p.actions.length > 0 && (
                  <CardActionRow actions={p.actions} ctx={actionCtx} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
