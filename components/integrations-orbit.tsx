"use client";

/**
 * Integrations orbit — landing-page visual showing the tools Oushi
 * connects with. Two concentric rings rotate in opposite directions
 * around the Oushi mark in the center. Each logo counter-rotates so
 * its artwork stays upright as the ring spins.
 *
 * Hover the orbit → animations pause (CSS-level, no JS state) so
 * curious visitors can hold still and read a specific logo. Hover a
 * specific chip → it lifts and the logo pops from monochrome ink to
 * the brand's real color.
 *
 * Implementation notes:
 *   - Pure CSS keyframes (oushi-orbit-cw / oushi-orbit-ccw in globals.css)
 *     instead of framer-motion because pause-on-hover is one CSS rule.
 *   - Layout uses absolute positioning + transform with calc()-based
 *     angles. Each chip sits on a ring at a calculated (x,y).
 *   - The whole thing scales with the container via clamp() so mobile
 *     gets a smaller orbit without a separate layout.
 */

import { OushiMark } from "@/components/oushi-mark";

interface Brand {
  name: string;
  color: string;
  // Inline SVG node — uses currentColor for the fill so the chip can
  // swap ink → brand color on hover with one CSS rule.
  icon: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────
// Brand marks — simplified single-color SVGs, recognizable at small sizes.
// ─────────────────────────────────────────────────────────────────────

const GmailIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
  </svg>
);

const GoogleCalIcon = (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="currentColor" />
    <text
      x="12"
      y="17"
      fontSize="9"
      fontWeight="700"
      fontFamily="system-ui, -apple-system, sans-serif"
      textAnchor="middle"
      fill="#FFFCF3"
    >
      31
    </text>
  </svg>
);

const AppleCalIcon = (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <rect x="3" y="4" width="18" height="18" rx="3" ry="3" fill="currentColor" />
    <rect x="3" y="4" width="18" height="5" rx="3" ry="3" fill="currentColor" opacity="0.7" />
    <text
      x="12"
      y="19"
      fontSize="8"
      fontWeight="700"
      fontFamily="system-ui, -apple-system, sans-serif"
      textAnchor="middle"
      fill="#FFFCF3"
    >
      17
    </text>
  </svg>
);

const OutlookIcon = (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <rect x="2" y="5" width="11" height="14" rx="1" fill="currentColor" />
    <text
      x="7.5"
      y="15"
      fontSize="8"
      fontWeight="800"
      fontFamily="system-ui, -apple-system, sans-serif"
      textAnchor="middle"
      fill="#FFFCF3"
    >
      O
    </text>
    <rect x="13" y="7" width="9" height="10" rx="0.5" fill="currentColor" opacity="0.6" />
    <path
      d="M13 7l4.5 4 4.5-4"
      stroke="#FFFCF3"
      strokeWidth="1"
      fill="none"
      strokeLinejoin="round"
    />
  </svg>
);

const SlackIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
  </svg>
);

const NotionIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933z" />
  </svg>
);

const LinearIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M.403 13.795c-.135-.535-.215-1.088-.235-1.654L8.46 20.595a11.99 11.99 0 0 1-1.652-.237zM.954 16.001c.36.811.812 1.572 1.34 2.27L5.73 21.706a11.94 11.94 0 0 1-2.27-1.34zM2.762 18.92c.601.535 1.263.998 1.973 1.376L3.385 18.946zM.018 11.366L12.634 23.982c.36-.014.717-.05 1.068-.105L.123 10.298c-.055.351-.091.708-.105 1.068zM.39 8.747L15.253 23.609a11.973 11.973 0 0 0 1.546-.453L.843 7.2A11.97 11.97 0 0 0 .39 8.748zM1.523 5.857l16.62 16.62a12.054 12.054 0 0 0 1.302-.71L2.232 4.555a12.05 12.05 0 0 0-.71 1.302zM3.358 3.36l17.282 17.282a12.064 12.064 0 0 0 2.642-2.642L6 .718a12.064 12.064 0 0 0-2.642 2.642zM6.99.952A11.985 11.985 0 0 1 12 0c6.627 0 12 5.373 12 12 0 1.787-.39 3.483-1.091 5.008z" />
  </svg>
);

const AsanaIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <circle cx="12" cy="6.5" r="4" />
    <circle cx="6.5" cy="17" r="4" />
    <circle cx="17.5" cy="17" r="4" />
  </svg>
);

const TodoistIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <rect x="2" y="2" width="20" height="20" rx="4" />
    <path
      d="M7 8h10M7 12h7M7 16h4"
      stroke="#FFFCF3"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const ClickUpIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M2 18.4l3.7-2.8c2 2.6 4.1 3.8 6.4 3.8s4.4-1.2 6.3-3.8L22 18.4c-2.7 3.6-6.1 5.5-9.9 5.5s-7.3-1.9-10.1-5.5zm10-12.7L5.4 11.4 3 8.5l9-7.8 9 7.8-2.4 3z" />
  </svg>
);

const GitHubIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
  </svg>
);

const ZapierIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M14.5 9.5L21 12.5l-6.5 3 3 6.5L11 18.5l-6.5 3.5 3-6.5L1 12.5l6.5-3-3-6.5L11 6.5l6.5-3.5z" />
  </svg>
);

const HubSpotIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M18.16 7.94V5.16a2 2 0 1 0-1.5 0V7.9a6 6 0 0 0-2.84.97L6 1.65 4.55 3.1l7.27 7.18a6 6 0 0 0 .92 8.43l2.43-2.43a3 3 0 1 1 1.7-1.7l2.43 2.43a6 6 0 0 0-1.14-9.06zM15.7 19a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
  </svg>
);

const AirtableIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M11.99 1.5L2 5.5l9.99 4 9.99-4-9.99-4zM2 7.5v9l9 4v-9l-9-4zm20 0l-9 4v9l9-4v-9z" />
  </svg>
);

const CalComIcon = (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" />
    <text
      x="12"
      y="16"
      fontSize="9"
      fontWeight="800"
      fontFamily="system-ui, -apple-system, sans-serif"
      textAnchor="middle"
      fill="#FFFCF3"
      letterSpacing="-0.5"
    >
      cal
    </text>
  </svg>
);

const TeamsIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M3 6h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm4 1v2H5V7zm0 3h2v6H7zm-2 0h2v6H5zm10-5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm6 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────
// Ring contents
// ─────────────────────────────────────────────────────────────────────

const INNER: Brand[] = [
  { name: "Gmail", color: "#EA4335", icon: GmailIcon },
  { name: "Google Calendar", color: "#1A73E8", icon: GoogleCalIcon },
  { name: "Apple Calendar", color: "#FF3B30", icon: AppleCalIcon },
  { name: "Outlook", color: "#0078D4", icon: OutlookIcon },
  { name: "Slack", color: "#611F69", icon: SlackIcon },
  { name: "Notion", color: "#000000", icon: NotionIcon },
];

const OUTER: Brand[] = [
  { name: "Linear", color: "#5E6AD2", icon: LinearIcon },
  { name: "Asana", color: "#F06A6A", icon: AsanaIcon },
  { name: "Todoist", color: "#E44232", icon: TodoistIcon },
  { name: "ClickUp", color: "#7B68EE", icon: ClickUpIcon },
  { name: "GitHub", color: "#181717", icon: GitHubIcon },
  { name: "Zapier", color: "#FF4F00", icon: ZapierIcon },
  { name: "HubSpot", color: "#FF7A59", icon: HubSpotIcon },
  { name: "Airtable", color: "#FCB400", icon: AirtableIcon },
  { name: "Cal.com", color: "#000000", icon: CalComIcon },
  { name: "Microsoft Teams", color: "#5059C9", icon: TeamsIcon },
];

// ─────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────

export function IntegrationsOrbit() {
  return (
    <div
      className="oushi-orbit-container relative mx-auto"
      // Container scales with viewport: 420px on mobile up to 640px on desktop.
      // The orbit math uses CSS variables so radii scale with the container.
      style={{
        width: "clamp(360px, 88vw, 640px)",
        aspectRatio: "1 / 1",
        // Two CSS vars the children use to compute their position. They're
        // expressed as % of the container, so resizing scales the orbit.
        ["--inner-radius" as string]: "27%",
        ["--outer-radius" as string]: "44%",
      }}
    >
      {/* Soft halo behind the center — gives the rings something visual to
          orbit, without being a hard ring. */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: "62%",
          height: "62%",
          background:
            "radial-gradient(circle at center, rgba(94,143,191,0.10) 0%, rgba(94,143,191,0.04) 40%, transparent 70%)",
        }}
      />

      {/* Outer ring — slower, counter-clockwise */}
      <OrbitRing items={OUTER} radiusVar="var(--outer-radius)" durationSec={110} direction="ccw" size={56} />

      {/* Inner ring — faster, clockwise */}
      <OrbitRing items={INNER} radiusVar="var(--inner-radius)" durationSec={70} direction="cw" size={64} />

      {/* Center — the Oushi mark, with a subtle breath */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <div
          className="flex items-center justify-center rounded-full bg-[#FFFCF3] oushi-breathe"
          style={{
            width: 76,
            height: 76,
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.7) inset, 0 12px 32px -8px rgba(94,143,191,0.30), 0 2px 6px rgba(106,76,38,0.08)",
            border: "1px solid #E6DCC4",
          }}
        >
          <OushiMark size={38} />
        </div>
        <p
          className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#5E8FBF] mt-1"
          style={{ letterSpacing: "0.22em" }}
        >
          Oushi
        </p>
      </div>
    </div>
  );
}

function OrbitRing({
  items,
  radiusVar,
  durationSec,
  direction,
  size,
}: {
  items: Brand[];
  radiusVar: string;
  durationSec: number;
  direction: "cw" | "ccw";
  size: number;
}) {
  return (
    <div
      className="oushi-orbit-ring absolute inset-0 pointer-events-none"
      style={{
        animationName:
          direction === "cw" ? "oushi-orbit-cw" : "oushi-orbit-ccw",
        animationDuration: `${durationSec}s`,
      }}
    >
      {items.map((brand, i) => {
        const angle = (i / items.length) * 360;
        return (
          <div
            key={brand.name}
            className="absolute left-1/2 top-1/2 pointer-events-auto"
            // Sit at the right point on the ring: rotate to angle, then
            // translate outward by the radius, then un-rotate the wrapper
            // so the chip itself sits axis-aligned at the slot.
            style={{
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(-1 * ${radiusVar})) rotate(${-angle}deg)`,
            }}
          >
            {/* Counter-rotate at the SAME duration as the ring so the chip
                visually stays upright. */}
            <div
              className="oushi-orbit-counter"
              style={{
                animationName:
                  direction === "cw" ? "oushi-orbit-ccw" : "oushi-orbit-cw",
                animationDuration: `${durationSec}s`,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
              }}
            >
              <BrandChip brand={brand} size={size} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BrandChip({ brand, size }: { brand: Brand; size: number }) {
  return (
    <div
      className="group relative flex items-center justify-center rounded-full bg-[#FFFCF3] border border-[#E6DCC4] cursor-default transition-all duration-300"
      style={{
        width: size,
        height: size,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.5) inset, 0 4px 14px -4px rgba(106,76,38,0.10), 0 1px 3px rgba(106,76,38,0.05)",
        color: "#5C5042",
      }}
      title={brand.name}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.color = brand.color;
        el.style.transform = "scale(1.12)";
        el.style.borderColor = brand.color + "40";
        el.style.boxShadow =
          "0 1px 0 rgba(255,255,255,0.6) inset, 0 12px 32px -8px " +
          brand.color +
          "55, 0 2px 6px rgba(106,76,38,0.08)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.color = "#5C5042";
        el.style.transform = "";
        el.style.borderColor = "#E6DCC4";
        el.style.boxShadow =
          "0 1px 0 rgba(255,255,255,0.5) inset, 0 4px 14px -4px rgba(106,76,38,0.10), 0 1px 3px rgba(106,76,38,0.05)";
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: size * 0.5, height: size * 0.5 }}
      >
        {brand.icon}
      </div>
      {/* Floating name tooltip — appears on hover via group-hover. */}
      <span
        className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2A2520] px-2 py-0.5 text-[10px] font-medium text-[#FAF6EB] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
        style={{ letterSpacing: "0.02em" }}
      >
        {brand.name}
      </span>
    </div>
  );
}
