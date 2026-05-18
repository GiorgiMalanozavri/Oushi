import type { ComparisonCard } from "./types";

export function ComparisonCardView({ card }: { card: ComparisonCard }) {
  // Collect all unique row labels in order of first appearance, so columns
  // with missing rows still line up.
  const labelOrder: string[] = [];
  const seen = new Set<string>();
  for (const col of card.columns) {
    for (const row of col.rows) {
      if (!seen.has(row.label)) {
        seen.add(row.label);
        labelOrder.push(row.label);
      }
    }
  }

  const rowMap = (colIdx: number, label: string) =>
    card.columns[colIdx]?.rows.find((r) => r.label === label);

  return (
    <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#E6DCC4] bg-gradient-to-r from-[#FAF6EB] to-[#FFFCF3]">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#5E8FBF]">Comparison</p>
        {card.title && (
          <p className="text-[14px] font-semibold text-[#2A2520] mt-0.5">{card.title}</p>
        )}
      </div>

      {/* Column headers */}
      <div
        className="grid border-b border-[#E6DCC4] bg-[#FAF6EB]/50"
        style={{ gridTemplateColumns: `120px repeat(${card.columns.length}, 1fr)` }}
      >
        <div />
        {card.columns.map((col, i) => (
          <div key={i} className="px-3 py-2.5 border-l border-[#E6DCC4]">
            <p className="text-[12.5px] font-semibold text-[#2A2520] truncate">{col.name}</p>
            {col.subtitle && (
              <p className="text-[10.5px] text-[#766E63] truncate mt-0.5">{col.subtitle}</p>
            )}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div>
        {labelOrder.map((label, ri) => (
          <div
            key={label}
            className={`grid ${ri < labelOrder.length - 1 ? "border-b border-[#E6DCC4]/50" : ""}`}
            style={{ gridTemplateColumns: `120px repeat(${card.columns.length}, 1fr)` }}
          >
            <div className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-[#A89F92]">
              {label}
            </div>
            {card.columns.map((_, ci) => {
              const cell = rowMap(ci, label);
              return (
                <div
                  key={ci}
                  className={`px-3 py-2.5 border-l border-[#E6DCC4]/50 text-[12.5px] ${
                    cell?.highlight ? "bg-[#D0E1F0]/30 font-semibold text-[#3D6A95]" : "text-[#2A2520]"
                  }`}
                >
                  {cell?.value ?? <span className="text-[#A89F92]">—</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
