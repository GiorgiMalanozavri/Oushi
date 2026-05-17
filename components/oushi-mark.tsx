/**
 * Oushi brand mark — a sky-blue rounded square containing a white outlined "O".
 *
 * Used everywhere we used to inline a `<div className="bg-[#5E8FBF]...">` placeholder.
 * Renders inline SVG (no network round-trip, scales cleanly at any size).
 */

interface OushiMarkProps {
  size?: number;
  variant?: "default" | "mono" | "reverse";
  className?: string;
  title?: string;
}

export function OushiMark({
  size = 32,
  variant = "default",
  className = "",
  title = "Oushi",
}: OushiMarkProps) {
  // Colors per variant (matches the actual SVG asset files in /public/logo/)
  const { bg, ring } = (() => {
    switch (variant) {
      case "mono":
        return { bg: "#2A2520", ring: "#FAF6EB" };
      case "reverse":
        return { bg: "#FFFCF3", ring: "#5E8FBF" };
      default:
        return { bg: "#5E8FBF", ring: "#FFFCF3" };
    }
  })();

  // Stroke scales with size — keep visually consistent at any rendered px
  const stroke = (2.5 / 32) * size;
  const radius = (7.25 / 32) * size;
  const cornerRadius = (7 / 32) * size;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <rect width={32} height={32} rx={cornerRadius * (32 / size)} fill={bg} />
      <circle cx={16} cy={16} r={radius * (32 / size)} stroke={ring} strokeWidth={stroke * (32 / size)} />
    </svg>
  );
}

/**
 * Horizontal lockup: mark + "Oushi" wordmark.
 *
 * Renders the mark as inline SVG and the wordmark as real HTML text
 * so it inherits the page's loaded Geist font reliably (SVG <text> can
 * miss next/font CSS variables).
 */
interface OushiLockupProps {
  size?: number;
  variant?: "light" | "dark";
  className?: string;
}

export function OushiLockup({ size = 28, variant = "light", className = "" }: OushiLockupProps) {
  const wordColor = variant === "dark" ? "text-[#FAF6EB]" : "text-[#2A2520]";
  const fontSize = Math.round(size * 0.78);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <OushiMark size={size} />
      <span
        className={`font-semibold tracking-[-0.02em] ${wordColor}`}
        style={{ fontSize: `${fontSize}px`, lineHeight: 1 }}
      >
        Oushi
      </span>
    </span>
  );
}
