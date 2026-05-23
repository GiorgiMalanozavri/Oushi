"use client";

/**
 * Segmented control for the Today view's mode (Narrative vs Classic).
 * Same persistence key used by the dashboard: localStorage["oushi.todayMode"].
 *
 * Lives in components/ (not inline in either page) because Settings and
 * the dashboard both touch it.
 */

export type TodayMode = "narrative" | "classic";

export const TODAY_MODE_STORAGE_KEY = "oushi.todayMode";

export function readStoredTodayMode(): TodayMode {
  if (typeof window === "undefined") return "narrative";
  try {
    const v = window.localStorage.getItem(TODAY_MODE_STORAGE_KEY);
    if (v === "classic" || v === "narrative") return v;
  } catch {
    // ignore
  }
  return "narrative";
}

export function writeStoredTodayMode(mode: TodayMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TODAY_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function TodayModeToggle({
  mode,
  onChange,
  size = "sm",
}: {
  mode: TodayMode;
  onChange: (m: TodayMode) => void;
  size?: "sm" | "md";
}) {
  const pad = size === "md" ? "px-3 py-1.5 text-[12px]" : "px-2.5 py-1 text-[11px]";
  return (
    <div
      className="inline-flex items-center rounded-full border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3]/90 dark:bg-[#25201A]/90 backdrop-blur-sm p-0.5 shadow-[0_2px_12px_-4px_rgba(106,76,38,0.10)]"
      role="tablist"
      aria-label="Today view mode"
    >
      <button
        onClick={() => onChange("narrative")}
        className={`${pad} font-medium rounded-full transition-all ${
          mode === "narrative"
            ? "bg-[#3F362C] text-[#FBF4DF] shadow-sm"
            : "text-[#766E63] dark:text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF]"
        }`}
        role="tab"
        aria-selected={mode === "narrative"}
        title="Narrative — Oushi writes you a brief"
      >
        Narrative
      </button>
      <button
        onClick={() => onChange("classic")}
        className={`${pad} font-medium rounded-full transition-all ${
          mode === "classic"
            ? "bg-[#3F362C] text-[#FBF4DF] shadow-sm"
            : "text-[#766E63] dark:text-[#A89F92] hover:text-[#3F362C] dark:hover:text-[#FBF4DF]"
        }`}
        role="tab"
        aria-selected={mode === "classic"}
        title="Classic — Card list"
      >
        Classic
      </button>
    </div>
  );
}
