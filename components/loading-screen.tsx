import { OushiMark } from "@/components/oushi-mark";

/**
 * Brand-matched loading screen used by Next.js route loading.tsx files.
 *
 * Server component (no client JS needed) — animations are pure CSS so it
 * renders instantly during streaming SSR while server data is loading.
 */
export function LoadingScreen({
  title = "Loading…",
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6EB] text-[#2A2520] relative overflow-hidden">
      {/* Ambient gradient blobs — matches the rest of the app */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-[#D0E1F0]/30 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-[#F0E9D6]/40 blur-[120px]" />
      </div>

      <div className="relative flex flex-col items-center gap-6 px-6">
        {/* Logo with glow */}
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-[#5E8FBF]/30 blur-2xl oushi-glow" />
          <div className="relative oushi-breathe">
            <OushiMark size={56} />
          </div>
        </div>

        {/* Text */}
        <div className="text-center max-w-xs">
          <p className="text-[15px] font-medium text-[#2A2520] mb-1">{title}</p>
          {subtitle && (
            <p className="text-[12.5px] text-[#766E63] leading-relaxed">{subtitle}</p>
          )}
        </div>

        {/* Loading dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#5E8FBF] oushi-loading-dot"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
