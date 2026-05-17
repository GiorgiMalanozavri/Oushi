/**
 * Subtle ambient gradient blobs that sit behind everything.
 *
 * Same visual language as the landing page: a powder-blue blob and a sand blob,
 * both heavily blurred and at low opacity. Gives every page in the app the same
 * warm-cream-with-a-hint-of-blue atmosphere.
 *
 * Renders as a fixed-position element behind all content (z-0). Place once near
 * the top of a page's root element. Content should sit at z-10 or higher.
 */
export function AmbientBackground({ variant = "default" }: { variant?: "default" | "subtle" }) {
  // Subtle = even more faded, for content-heavy app pages where you want
  // texture but no distraction. Default = landing-page intensity.
  const intensity = variant === "subtle" ? "/15" : "/25";
  return (
    <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
      <div className={`absolute top-[5%] -right-[15%] w-[55vw] h-[55vw] rounded-full bg-[#D0E1F0]${intensity} blur-[140px]`} />
      <div className={`absolute top-[60%] -left-[15%] w-[45vw] h-[45vw] rounded-full bg-[#F0E9D6]${variant === "subtle" ? "/25" : "/40"} blur-[140px]`} />
    </div>
  );
}
