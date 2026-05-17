"use client";

import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF6EB] text-[#2A2520] overflow-hidden relative">
      {/* Soft ambient gradient — subtle, not distracting */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-[#D0E1F0]/30 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-[#F0E9D6]/40 blur-[120px]" />
      </div>

      {/* Top header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#5E8FBF] flex items-center justify-center">
            <span className="text-white text-[13px] font-semibold leading-none">O</span>
          </div>
          <span className="text-[16px] font-semibold tracking-tight">Oushi</span>
        </div>
      </header>

      {/* Centered content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF] mb-3">
            Welcome back
          </p>
          <h1 className="text-[36px] sm:text-[44px] font-semibold tracking-tight leading-[1.05]">
            Sign in to Oushi.
          </h1>
          <p className="mt-3 text-[15px] text-[#766E63] leading-relaxed max-w-sm">
            The AI assistant that reads your inbox, surfaces what matters, and replies in your voice.
          </p>

          <motion.button
            onClick={handleLogin}
            disabled={loading}
            whileHover={!loading ? { scale: 1.01 } : {}}
            whileTap={!loading ? { scale: 0.99 } : {}}
            className="mt-8 group flex w-full items-center justify-center gap-3 rounded-lg border border-[#E6DCC4] bg-[#FFFCF3] px-4 py-3.5 text-[15px] font-medium text-[#2A2520] shadow-sm transition-all hover:border-[#5E8FBF]/30 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-[#5E8FBF]/30 border-t-[#5E8FBF] animate-spin" />
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

          <div className="mt-6 flex items-start gap-2 text-[12px] text-[#A89F92]">
            <div className="w-1 h-1 rounded-full bg-[#A89F92] mt-1.5 shrink-0" />
            <p>
              By continuing, you agree to Oushi reading your Gmail to provide its features.
              We don&apos;t share your email content with anyone, and you can delete everything at any time.
            </p>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-5 max-w-5xl mx-auto w-full flex items-center justify-between text-[11px] text-[#A89F92]">
        <span>© Oushi {new Date().getFullYear()}</span>
        <div className="flex items-center gap-4">
          <a href="/privacy" className="hover:text-[#3D6A95] transition-colors">Privacy</a>
          <a href="/terms" className="hover:text-[#3D6A95] transition-colors">Terms</a>
        </div>
      </footer>
    </div>
  );
}
