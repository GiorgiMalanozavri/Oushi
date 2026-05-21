"use client";

/**
 * Tiny theme provider — toggles the `.dark` class on <html>, persists the
 * choice in localStorage, and respects the OS `prefers-color-scheme` on
 * first load. Deliberately no Context — we mount it once in the root
 * layout and the visible toggle (in Settings → Appearance) reads/writes
 * via the helpers below.
 *
 * Why not next-themes? It's a fine package but we wanted zero deps + full
 * control over the storage key and the system-preference detection.
 */

import { useEffect } from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "oushi.theme";

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // ignore
  }
  return "system";
}

/** True when the system reports a dark color-scheme preference */
function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Effective theme = "system" resolved to "light" or "dark" */
export function resolveTheme(t: Theme): "light" | "dark" {
  if (t === "system") return systemPrefersDark() ? "dark" : "light";
  return t;
}

/** Apply the .dark class to <html> based on a resolved value */
function applyDocumentTheme(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function writeStoredTheme(t: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    // ignore
  }
  applyDocumentTheme(resolveTheme(t));
  // Custom in-tab broadcast so any open page can react without reloading.
  window.dispatchEvent(new CustomEvent("oushi:theme", { detail: { theme: t } }));
}

/**
 * Mount once in the root layout. Re-applies the stored theme on every
 * navigation and listens to system preference changes when the user has
 * picked "system".
 */
export function ThemeProvider() {
  useEffect(() => {
    const stored = readStoredTheme();
    applyDocumentTheme(resolveTheme(stored));

    // If user picks "system", re-apply when the OS preference flips
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readStoredTheme() === "system") {
        applyDocumentTheme(resolveTheme("system"));
      }
    };
    mql?.addEventListener?.("change", onChange);
    return () => mql?.removeEventListener?.("change", onChange);
  }, []);

  return null;
}
