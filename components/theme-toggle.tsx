"use client";

/**
 * Three-way segmented control for theme — Light / System / Dark.
 * Reads from + writes to the same localStorage key the ThemeProvider
 * watches, so toggling here applies instantly across the app.
 */

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import {
  type Theme,
  readStoredTheme,
  writeStoredTheme,
} from "@/components/theme-provider";

export function ThemeToggle({ size = "sm" }: { size?: "sm" | "md" }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  const pick = (t: Theme) => {
    setTheme(t);
    writeStoredTheme(t);
  };

  const pad =
    size === "md" ? "px-3 py-1.5 text-[12px]" : "px-2.5 py-1 text-[11px]";

  const Option = ({
    value,
    label,
    icon,
  }: {
    value: Theme;
    label: string;
    icon: React.ReactNode;
  }) => (
    <button
      onClick={() => pick(value)}
      className={`${pad} font-medium rounded-full transition-all inline-flex items-center gap-1.5 ${
        theme === value
          ? "bg-[#3F362C] text-[#FBF4DF] shadow-sm dark:bg-[#FBF4DF] dark:text-[#1B1813]"
          : "text-[#766E63] hover:text-[#3F362C] dark:text-[#A89F92] dark:hover:text-[#FBF4DF]"
      }`}
      role="tab"
      aria-selected={theme === value}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div
      className="inline-flex items-center rounded-full border border-[#E6DCC4] bg-[#FFFCF3]/90 backdrop-blur-sm p-0.5 shadow-[0_2px_12px_-4px_rgba(106,76,38,0.10)] dark:bg-[#25201A]/90 dark:border-[#3A3127]"
      role="tablist"
      aria-label="Theme"
    >
      <Option value="light" label="Light" icon={<Sun className="w-3 h-3" />} />
      <Option value="system" label="System" icon={<Monitor className="w-3 h-3" />} />
      <Option value="dark" label="Dark" icon={<Moon className="w-3 h-3" />} />
    </div>
  );
}
