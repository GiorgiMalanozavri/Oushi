/**
 * Client-safe Gmail-label primitives — constants, types, and the pure
 * classifier function. Lives apart from `lib/gmail-labels.ts` (which
 * imports googleapis and is server-only) so the dashboard modal can
 * render the current label without hitting the API.
 *
 * The classifier is split into two layers:
 *
 *   1. CONTENT classification (this email is fundamentally a meeting /
 *      receipt / marketing / fyi / real communication). Done by:
 *        a. `heuristicContentLabel` — regex + flags. Cheap and confident
 *           on clear cases (calendar invites, transactional receipts,
 *           noise-category newsletters, login alerts).
 *        b. Cached LLM verdict in `gmail_label_llm_key`. The
 *           lib/gmail-labels-llm module fills this in for emails where
 *           the heuristic returned null.
 *        c. Default to `communication` if both are unavailable.
 *
 *   2. STATE logic on top. "communication" content gets mapped to one
 *      of respond / awaiting / followup / fyi based on the email's
 *      read/replied/sent timestamps. Static content labels (meeting /
 *      receipt / marketing / fyi) pass through unchanged.
 */

import {
  isAutomatedEmail,
  isTrueTransactional,
  isLowValueNotification,
  type EmailRow,
} from "@/lib/outstanding";

export type OushiLabelKey =
  | "respond"
  | "awaiting"
  | "followup"
  | "meeting"
  | "receipt"
  | "fyi"
  | "marketing";

/**
 * The 5-option content label the LLM picks from. This is the "what kind
 * of email is this fundamentally?" question, separate from "what state
 * is the user-email relationship in?".
 */
export type ContentLabel =
  | "meeting"
  | "receipt"
  | "marketing"
  | "fyi"
  | "communication";

export const CONTENT_LABELS: ContentLabel[] = [
  "meeting",
  "receipt",
  "marketing",
  "fyi",
  "communication",
];

export interface OushiLabelDef {
  key: OushiLabelKey;
  name: string;
  color: { textColor: string; backgroundColor: string };
  description: string;
  shortLabel: string;
}

export const OUSHI_LABELS: OushiLabelDef[] = [
  {
    key: "respond",
    name: "Oushi/1 · Respond",
    shortLabel: "Respond",
    color: { textColor: "#ffffff", backgroundColor: "#cc3a21" },
    description: "Needs your reply",
  },
  {
    key: "awaiting",
    name: "Oushi/2 · Awaiting reply",
    shortLabel: "Awaiting reply",
    color: { textColor: "#ffffff", backgroundColor: "#eaa041" },
    description: "You opened, never replied",
  },
  {
    key: "followup",
    name: "Oushi/3 · Follow up",
    shortLabel: "Follow up",
    color: { textColor: "#ffffff", backgroundColor: "#3c78d8" },
    description: "You sent last; they went quiet",
  },
  {
    key: "meeting",
    name: "Oushi/4 · Meeting",
    shortLabel: "Meeting",
    color: { textColor: "#ffffff", backgroundColor: "#8e63ce" },
    description: "Calendar invites, meeting context",
  },
  {
    key: "receipt",
    name: "Oushi/5 · Receipt",
    shortLabel: "Receipt",
    color: { textColor: "#ffffff", backgroundColor: "#149e60" },
    description: "Confirmations, invoices, transactional",
  },
  {
    key: "fyi",
    name: "Oushi/6 · FYI",
    shortLabel: "FYI",
    color: { textColor: "#000000", backgroundColor: "#cccccc" },
    description: "Informational — no reply needed",
  },
  {
    key: "marketing",
    name: "Oushi/7 · Marketing",
    shortLabel: "Marketing",
    color: { textColor: "#000000", backgroundColor: "#fbc8d9" },
    description: "Newsletters, promos, ads",
  },
];

const LABEL_BY_KEY = new Map(OUSHI_LABELS.map((l) => [l.key, l]));

export function getLabelByKey(key: OushiLabelKey): OushiLabelDef | undefined {
  return LABEL_BY_KEY.get(key);
}

export const LABEL_PREFIX = "Oushi/";

// ─────────────────────────────────────────────────────────────────────────
// CONTENT CLASSIFICATION (regex + cached LLM)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Heuristic content classifier. Returns a content label if we're confident
 * from regex / category signals, null if it's ambiguous (in which case
 * the LLM layer should look at the email).
 */
export function heuristicContentLabel(email: EmailRow): ContentLabel | null {
  const subject = (email.subject || "").toLowerCase();
  const fromEmail = (email.from_email || "").toLowerCase();
  const snippet = (email.snippet || "").toLowerCase();
  const body = (email.body_preview || "").toLowerCase();

  // Noise category = newsletter / promo / automated. Login alerts and
  // verification codes ride along in here too — split them off as FYI.
  if (email.category === "noise") {
    if (isLowValueNotification(email)) return "fyi";
    return "marketing";
  }

  // Welcome / onboarding / "thanks for signing up" emails are FYI, NOT
  // receipts. Check before the receipt path so "Thanks for signing up to
  // Oushi" doesn't get blanket-marked as a receipt.
  if (
    /^welcome\s+to\b/i.test(subject) ||
    /thanks?\s+for\s+(signing\s*up|subscribing|joining|creating|registering)/i.test(subject) ||
    /your\s+account\s+(is\s+ready|has\s+been\s+created|is\s+set\s+up)/i.test(subject) ||
    /\bverify\s+your\s+email\b/i.test(subject) ||
    /\bconfirm\s+your\s+email\b/i.test(subject) ||
    /\bget\s+started\s+with\b/i.test(subject) ||
    /\byou'?re\s+(in|all\s+set)\b/i.test(subject)
  ) {
    return "fyi";
  }

  // Receipt — money + confirmation number, OR strong subject pattern.
  // The pattern list is intentionally permissive on travel/booking since
  // those are some of the most-mis-classified emails (flight confirmations,
  // hotel bookings, ride receipts, etc.).
  if (isTrueTransactional(email)) return "receipt";
  if (
    // "Your <thing>" — covers receipts, orders, bookings, AND travel
    /^your\s+(receipt|order|invoice|booking|reservation|subscription|statement|flight|trip|itinerary|ticket|tickets|delivery|shipment|refund)\b/i.test(subject) ||
    // Generic confirmations of money / travel
    /receipt\s+from/i.test(subject) ||
    /payment\s+(received|confirmation|successful|failed|declined)/i.test(subject) ||
    /\b(order|booking|reservation|flight|hotel|ride|trip|travel)\s+confirmation\b/i.test(subject) ||
    /\bconfirmation\s+(of|for|number|#)/i.test(subject) ||
    // Travel-specific
    /\b(boarding\s+pass|e-?ticket|check[- ]?in)\b/i.test(subject) ||
    /\b(flight|trip)\s+(to|from)\b/i.test(subject) ||
    /\bpnr\b/i.test(subject) ||
    /\bdeparture\s+(reminder|update)\b/i.test(subject) ||
    // "Thanks for your order/purchase/booking" (NOT signing up — that's above)
    /thanks?\s+for\s+(your\s+order|your\s+purchase|your\s+booking|your\s+reservation|booking\s+with)/i.test(subject) ||
    // Body-level signal: "confirmation number" / "booking reference" + actual money
    (/(confirmation\s+(number|code|#)|booking\s+reference|pnr|reservation\s+code)/i.test(subject + " " + snippet + " " + body) &&
      /(\$\d|\busd\b|€\d|£\d|\b\d+\.\d{2}\b)/i.test(snippet + " " + body))
  ) {
    return "receipt";
  }

  // Meeting — calendar invite / scheduling. Calendar notification sender
  // is a perfect signal; subject patterns are pretty reliable.
  if (
    /\b(meeting|calendar|invite|invitation|scheduled|rsvp|google\s+meet|zoom)\b/i.test(subject) ||
    /^invitation:/i.test(subject) ||
    fromEmail === "calendar-notification@google.com"
  ) {
    return "meeting";
  }

  // Low-value notifications (login alerts, verification codes, etc.)
  // regardless of category — these have very strong content signals.
  if (isLowValueNotification(email)) return "fyi";

  // Anything else is ambiguous. The LLM layer will look.
  return null;
}

/**
 * Pick the cached content label for an email — heuristic first, then the
 * LLM-cached column. Returns null only if neither has an answer.
 */
export function resolvedContentLabel(email: EmailRow): ContentLabel | null {
  const heuristic = heuristicContentLabel(email);
  if (heuristic) return heuristic;
  const cached = email.gmail_label_llm_key;
  if (cached && isContentLabel(cached)) return cached;
  return null;
}

function isContentLabel(value: string): value is ContentLabel {
  return (
    value === "meeting" ||
    value === "receipt" ||
    value === "marketing" ||
    value === "fyi" ||
    value === "communication"
  );
}

/**
 * True if this email should be sent to the LLM for content classification.
 * Skips emails the heuristic already handles, and emails we've already
 * classified (cached in `gmail_label_llm_key`).
 */
export function needsLlmClassification(email: EmailRow): boolean {
  if (heuristicContentLabel(email) !== null) return false;
  if (email.gmail_label_llm_key) return false;
  const haystack =
    (email.subject || "") + " " + (email.body_preview || "") + " " + (email.snippet || "");
  return haystack.trim().length > 10;
}

// ─────────────────────────────────────────────────────────────────────────
// STATE LOGIC (content label → final Oushi label, given user state)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Map a content label + email state to the final Oushi label.
 * Static content (meeting/receipt/marketing/fyi) passes through unchanged.
 * "communication" gets mapped to respond/awaiting/followup based on state.
 */
export function applyStateLogic(
  contentLabel: ContentLabel,
  email: EmailRow
): OushiLabelKey | null {
  // Static content labels — return directly.
  if (contentLabel === "meeting") return "meeting";
  if (contentLabel === "receipt") return "receipt";
  if (contentLabel === "marketing") return "marketing";
  if (contentLabel === "fyi") return "fyi";

  // contentLabel === "communication" — state decides.

  // Follow-up: user sent last, thread silent 5+ days, real sender.
  if (
    email.user_was_last_sender &&
    !email.followup_dismissed_at &&
    email.user_last_sent_at &&
    !isAutomatedEmail(email)
  ) {
    const daysSinceUserSent =
      (Date.now() - new Date(email.user_last_sent_at).getTime()) /
      (24 * 60 * 60 * 1000);
    if (daysSinceUserSent >= 5 && email.score >= 50) {
      return "followup";
    }
  }

  // Awaiting: you opened it, never replied, real sender, score >= 50.
  if (
    email.is_read &&
    !email.user_replied &&
    !isAutomatedEmail(email) &&
    email.score >= 50
  ) {
    return "awaiting";
  }

  // Respond: unread, scored >= 60, real sender, not transactional.
  if (
    email.is_unread &&
    !email.user_replied &&
    !isAutomatedEmail(email) &&
    email.score >= 60
  ) {
    return "respond";
  }

  // Useful but in the middle — FYI.
  if (email.category === "useful" && email.score >= 30 && email.score < 60) {
    return "fyi";
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pick the single best Oushi label for an email, or null if no label fits.
 *
 * Order of precedence:
 *   1. Override (if explicitly provided by the caller)
 *   2. Heuristic content label
 *   3. Cached LLM content label
 *   4. Default to "communication" → state logic
 *
 * The override semantics:
 *   - override === undefined → no override, run heuristic + LLM
 *   - override === null      → user said "don't label this"
 *   - override === <key>     → user picked this label manually
 */
export function computeLabelForEmail(
  email: EmailRow,
  override?: OushiLabelKey | null
): OushiLabelKey | null {
  if (override !== undefined) return override;

  // Heuristic content → cached LLM → fallback to "communication"
  const contentLabel: ContentLabel = resolvedContentLabel(email) || "communication";
  return applyStateLogic(contentLabel, email);
}
