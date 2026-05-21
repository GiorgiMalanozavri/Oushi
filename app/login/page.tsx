"use client";

import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { OushiMark } from "@/components/oushi-mark";
import { AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(decodeURIComponent(err));
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appUrl.replace(/\/$/, "")}/api/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) {
      console.error("[login] OAuth init failed:", error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col text-[#2A2520] dark:text-[#FBF4DF] overflow-hidden relative login-bg">
      {/* Soft ambient blooms — warmer than the old cool blues */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-[#F2DDD0]/40 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-[#FBF4DF]/60 blur-[120px]" />
      </div>

      {/* Top header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <OushiMark size={26} />
          <span
            className="text-[19px] tracking-[-0.012em] text-[#2A2520] font-medium"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            Oushi
          </span>
        </div>
      </header>

      {/* Centered content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-[#A89F92] mb-3"
          >
            Welcome back
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-[44px] sm:text-[54px] tracking-[-0.018em] leading-[1.02] text-[#2A2520]"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            Sign in to Oushi.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-[17px] text-[#766E63] leading-[1.55] max-w-sm font-serif italic"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            An inbox that reads what you read, replies in your voice, and won&apos;t
            let you forget.
          </motion.p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 flex items-start gap-2.5 rounded-xl border border-[#B86B4A]/25 bg-[#F5E8E0]/40 px-4 py-3 text-[13px] text-[#B86B4A]"
              style={{
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.5) inset, 0 2px 8px -4px rgba(184,107,74,0.10)",
              }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Sign-in failed</p>
                <p className="mt-0.5 text-[12px] opacity-80 break-words">{error}</p>
              </div>
            </motion.div>
          )}

          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={handleLogin}
            disabled={loading}
            whileHover={!loading ? { y: -1 } : {}}
            whileTap={!loading ? { scale: 0.99 } : {}}
            className="mt-9 group flex w-full items-center justify-center gap-3 rounded-2xl border border-[#E6DCC4] bg-[#FFFCF3] px-4 py-4 text-[15px] font-medium text-[#2A2520] transition-all hover:border-[#B86B4A]/30 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 28px -10px rgba(106,76,38,0.14), 0 1px 3px rgba(106,76,38,0.04)",
            }}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-[#B86B4A]/30 border-t-[#B86B4A] animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </>
            )}
          </motion.button>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-6 flex items-start gap-2 text-[12px] text-[#A89F92]"
          >
            <div className="w-1 h-1 rounded-full bg-[#A89F92] mt-1.5 shrink-0" />
            <p className="leading-relaxed">
              By continuing, you agree to Oushi reading your Gmail to provide its
              features. We don&apos;t share your email content with anyone, and you
              can delete everything at any time.
            </p>
          </motion.div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-5 max-w-5xl mx-auto w-full flex items-center justify-between text-[11px] text-[#A89F92]">
        <span>© Oushi {new Date().getFullYear()}</span>
        <div className="flex items-center gap-4">
          <a href="/privacy" className="hover:text-[#B86B4A] transition-colors">
            Privacy
          </a>
          <a href="/terms" className="hover:text-[#B86B4A] transition-colors">
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}
