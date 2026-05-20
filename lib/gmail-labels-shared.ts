/**
 * Client-safe Gmail-label primitives — constants, types, and the pure
 * classifier function. Lives apart from `lib/gmail-labels.ts` (which
 * imports googleapis and is server-only) so the dashboard modal can
 * render the current label without hitting the API.
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

export interface OushiLabelDef {
  key: OushiLabelKey;
  name: string;
  color: { textColor: string; backgroundColor: string };
  description: string;
  /** Shorthand for UI ("Respond", "FYI", ...) — without the Oushi/N · prefix. */
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

/**
 * Pick the single best Oushi label for an email, or null if no label fits.
 * Priority order matters — earlier rules win.
 *
 * If the caller passes an `override` (from email_label_overrides), it wins
 * unconditionally:
 *   - override === undefined → no override, run heuristic
 *   - override === null      → user said "don't label this"
 *   - override === <key>     → user picked this label manually
 */
export function computeLabelForEmail(
  email: EmailRow,
  override?: OushiLabelKey | null
): OushiLabelKey | null {
  if (override !== undefined) return override;

  const subject = (email.subject || "").toLowerCase();
  const fromEmail = (email.from_email || "").toLowerCase();

  // 1. Marketing — pure noise
  if (email.category === "noise") {
    // Login alerts / verification codes go to FYI, not marketing
    if (isLowValueNotification(email)) return "fyi";
    return "marketing";
  }

  // 2. Receipts / transactional confirmations
  if (isTrueTransactional(email)) {
    return "receipt";
  }
  if (
    /^your\s+(receipt|order|invoice|booking|reservation|subscription|statement)/i.test(subject) ||
    /receipt\s+from/i.test(subject) ||
    /payment\s+(received|confirmation|successful)/i.test(subject) ||
    /order\s+confirmation/i.test(subject) ||
    /thanks?\s+for\s+(your\s+order|signing\s*up|subscribing|your\s+purchase)/i.test(subject)
  ) {
    return "receipt";
  }

  // 3. Meeting — calendar invites / scheduling
  if (
    /\b(meeting|calendar|invite|invitation|scheduled|rsvp|google\s+meet|zoom)\b/i.test(subject) ||
    /^invitation:/i.test(subject) ||
    fromEmail === "calendar-notification@google.com"
  ) {
    return "meeting";
  }

  // 4. Low-value notification (login alerts, verification codes etc) -> FYI
  if (isLowValueNotification(email)) {
    return "fyi";
  }

  // 5. Follow-up — user sent last and the thread went quiet
  if (
    email.user_was_last_sender &&
    !email.followup_dismissed_at &&
    email.user_last_sent_at &&
    !isAutomatedEmail(email)
  ) {
    const daysSinceUserSent =
      (Date.now() - new Date(email.user_last_sent_at).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceUserSent >= 5 && email.score >= 50) {
      return "followup";
    }
  }

  // 6. Awaiting — you opened, never replied, real sender, score >= 50
  if (
    email.is_read &&
    !email.user_replied &&
    !isAutomatedEmail(email) &&
    email.score >= 50
  ) {
    return "awaiting";
  }

  // 7. Respond — unread, scored >= 60, real sender, not transactional
  if (
    email.is_unread &&
    !email.user_replied &&
    !isAutomatedEmail(email) &&
    email.score >= 60
  ) {
    return "respond";
  }

  // 8. Useful FYI — middle ground
  if (email.category === "useful" && email.score >= 30 && email.score < 60) {
    return "fyi";
  }

  // No label
  return null;
}
