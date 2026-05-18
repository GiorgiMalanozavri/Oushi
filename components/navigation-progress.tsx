"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Slim top progress bar — fires when the user clicks an internal link
 * and finishes when the new pathname renders.
 *
 * Inspired by NProgress / Vercel-style site navigation feel.
 */
function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"hidden" | "loading" | "finishing">("hidden");
  const finishTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  // Start the bar when any internal-link click is detected.
  useEffect(() => {
    const startLoading = () => {
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setState("loading");
    };

    const onClick = (e: MouseEvent) => {
      // Ignore modifier-clicks, middle-clicks, etc.
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = (e.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      if (target.target === "_blank") return;
      if (target.hasAttribute("download")) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Skip non-navigation links
      if (href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      // External link?
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        // Same path + only hash change? Skip.
        if (url.pathname === window.location.pathname && url.hash) return;
      } catch {
        // ignore parse errors
      }

      startLoading();
    };

    // Also catch form submissions that may navigate (e.g., GET forms).
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (form?.method?.toLowerCase() !== "get") return;
      // Only if action stays on the same origin
      try {
        const action = form.action || window.location.href;
        const url = new URL(action, window.location.href);
        if (url.origin !== window.location.origin) return;
      } catch {
        return;
      }
      startLoading();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  // Finish the bar when the pathname (or query) changes.
  useEffect(() => {
    if (state !== "loading") return;
    setState("finishing");
    finishTimer.current = window.setTimeout(() => {
      setState("hidden");
    }, 300);
    return () => {
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams?.toString()]);

  if (state === "hidden") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[2px] pointer-events-none">
      <div
        className={`h-full bg-gradient-to-r from-[#5E8FBF] via-[#5E8FBF] to-[#3D6A95] shadow-[0_0_8px_rgba(94,143,191,0.6)] ${
          state === "loading" ? "oushi-progress-loading" : "oushi-progress-finishing"
        }`}
      />
      <style>{`
        @keyframes oushi-progress-loading-kf {
          0% { width: 0%; }
          40% { width: 30%; }
          70% { width: 70%; }
          100% { width: 92%; }
        }
        @keyframes oushi-progress-finishing-kf {
          0% { width: 92%; opacity: 1; }
          60% { width: 100%; opacity: 1; }
          100% { width: 100%; opacity: 0; }
        }
        .oushi-progress-loading {
          animation: oushi-progress-loading-kf 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .oushi-progress-finishing {
          animation: oushi-progress-finishing-kf 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

export function NavigationProgress() {
  // useSearchParams requires Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
