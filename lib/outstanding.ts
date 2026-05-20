export interface EmailRow {
  id: string;
  from_name: string;
  from_email: string;
  subject: string;
  snippet: string;
  body_preview: string | null;
  attachments_text: string | null;
  has_attachments: boolean;
  score: number;
  category: string;
  reasoning: string;
  requires_action: boolean;
  received_at: string;
  is_read: boolean;
  is_unread: boolean;
  user_replied: boolean;
  gmail_thread_id: string | null;
  last_seen_at: string | null;
  dismissed_at: string | null;
  last_thread_message_at: string | null;
  user_was_last_sender: boolean;
  user_last_sent_at: string | null;
  followup_dismissed_at: string | null;
  highlight: string | null;
  matched_interests: string[] | null;
  matched_topics: string[] | null;
  suggested_action: {
    label: string;
    type: "reply" | "calendar" | "save" | "open" | "ignore";
    detail: string | null;
  } | null;
}

export type Bucket =
  | "urgent"          // High score, unread, sitting > 4h — needs attention now
  | "awaiting_reply"  // You opened it but never replied (real person, can reply)
  | "following_up"    // You sent the last message, they've gone silent — time to nudge
  | "reference"       // Receipts, confirmations, bookings — important but no reply needed
  | "fresh"           // Recently arrived, scored well
  | "background"      // Lower score, unread but not urgent
  | "handled";        // Replied, read, or low score

export interface Classified extends EmailRow {
  bucket: Bucket;
  hours_old: number;
  is_stale: boolean;
  is_automated: boolean;
  days_since_user_sent: number | null;
}

const HOUR = 60 * 60 * 1000;

const AUTOMATED_SENDER_HINTS = [
  "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply", "do_not_reply",
  "notifications", "notification", "alerts", "alert", "updates", "update",
  "automated", "automatic", "mailer", "newsletter", "receipts", "billing",
  "support@", "info@", "hello@", "team@", "service@", "postmaster",
];

const TRANSACTIONAL_SUBJECT_HINTS = [
  "receipt", "your order", "your booking", "your reservation",
  "your ticket", "etick", "itinerary", "invoice",
  "subscription", "renewed", "shipped", "delivered", "tracking",
  "statement",
];

const LOW_VALUE_NOTIFICATION_HINTS = [
  "new login", "new device", "signed in", "sign-in", "sign in from",
  "we noticed", "we detected", "security alert", "verification code",
  "verify your", "confirm your email", "one-time", "one time passcode",
  "if this was not you", "password reset", "password changed",
  "two-factor", "welcome to",
];

export function isAutomatedEmail(email: EmailRow): boolean {
  const from = (email.from_email || "").toLowerCase();
  if (AUTOMATED_SENDER_HINTS.some((hint) => from.includes(hint))) return true;
  const subject = (email.subject || "").toLowerCase();
  if (TRANSACTIONAL_SUBJECT_HINTS.some((hint) => subject.includes(hint))) return true;
  return false;
}

export function isLowValueNotification(email: EmailRow): boolean {
  const subject = (email.subject || "").toLowerCase();
  const snippet = (email.snippet || "").toLowerCase();
  const body = (email.body_preview || "").toLowerCase();
  const hay = `${subject} ${snippet} ${body}`;
  return LOW_VALUE_NOTIFICATION_HINTS.some((hint) => hay.includes(hint));
}

export function isTrueTransactional(email: EmailRow): boolean {
  const subject = (email.subject || "").toLowerCase();
  if (TRANSACTIONAL_SUBJECT_HINTS.some((hint) => subject.includes(hint))) return true;
  const body = (email.body_preview || "").toLowerCase();
  const hasMoney = /\$\d|\busd\b|€\d|£\d|\b\d+\.\d{2}\b/i.test(body);
  const hasConfNumber = /\b(confirmation|order|booking|reservation|ticket)\s*(number|#|code|id)\b/i.test(body);
  return hasMoney && hasConfNumber;
}

export function classifyEmail(email: EmailRow, now: Date = new Date()): Classified {
  const received = new Date(email.received_at);
  const hoursOld = (now.getTime() - received.getTime()) / HOUR;
  const isStale = hoursOld > 24;
  const isAutomated = isAutomatedEmail(email);

  const daysSinceUserSent =
    email.user_last_sent_at
      ? (now.getTime() - new Date(email.user_last_sent_at).getTime()) / (24 * HOUR)
      : null;

  let bucket: Bucket;

  if (email.dismissed_at) {
    bucket = "handled";
  } else if (
    // Follow-up: you sent the last message, no one has replied for 5+ days,
    // and we don't already think this thread is done.
    email.user_was_last_sender &&
    !email.followup_dismissed_at &&
    !isAutomated &&
    email.score >= 50 &&
    daysSinceUserSent !== null &&
    daysSinceUserSent >= 5
  ) {
    bucket = "following_up";
  } else if (email.user_replied) {
    bucket = "handled";
  } else if (isLowValueNotification(email)) {
    bucket = email.is_unread && hoursOld < 48 ? "background" : "handled";
  } else if (isTrueTransactional(email)) {
    bucket = "reference";
  } else if (email.score >= 70 && email.is_unread && hoursOld > 4 && !isAutomated) {
    bucket = "urgent";
  } else if (email.score >= 50 && !email.is_unread && !email.user_replied && hoursOld > 12 && !isAutomated) {
    bucket = "awaiting_reply";
  } else if (email.score >= 50 && hoursOld <= 24 && !isAutomated) {
    bucket = "fresh";
  } else if (email.score >= 30 && email.is_unread) {
    bucket = "background";
  } else {
    bucket = "handled";
  }

  return {
    ...email,
    bucket,
    hours_old: hoursOld,
    is_stale: isStale,
    is_automated: isAutomated,
    days_since_user_sent: daysSinceUserSent,
  };
}

export function classifyAll(emails: EmailRow[], now: Date = new Date()): Classified[] {
  return emails.map((e) => classifyEmail(e, now));
}

/**
 * Is this email plausibly something the user owes a reply to?
 *
 * The /api/today endpoint uses this to filter out receipts, verification
 * codes, login alerts, and other noise even when prefilter / ranking gave
 * them a high score. Saying "5d waiting" on a receipt would make the
 * dashboard look broken.
 */
export function isWorthSurfacing(email: EmailRow): boolean {
  if (isAutomatedEmail(email)) return false;
  if (isTrueTransactional(email)) return false;
  if (isLowValueNotification(email)) return false;
  // Even without subject/sender hints, anything explicitly tagged as a
  // receipt, invoice, or verification request in the subject is excluded
  // — broader than TRANSACTIONAL_SUBJECT_HINTS to catch edge cases.
  const subj = (email.subject || "").toLowerCase();
  const extraNonReplyPatterns = [
    /^your receipt\b/,
    /receipt from/,
    /^your (order|invoice|statement|booking|reservation|subscription)/,
    /verification code/,
    /your\s+\w+\s+verification code/,
    /verify your (email|account|identity|address)/,
    /one[-\s]?time (passcode|password|code)/,
    /confirm your email/,
    /password (reset|changed)/,
    /new (login|sign[-\s]?in)/,
    /signed?\s*in\s*(to|from)/,
    /security alert/,
    /^welcome to/,
    /thanks for (your order|signing up|subscribing)/,
  ];
  if (extraNonReplyPatterns.some((re) => re.test(subj))) return false;
  return true;
}

export function bucketize(classified: Classified[]) {
  return {
    urgent: classified.filter((e) => e.bucket === "urgent").sort(byPriority),
    awaiting_reply: classified.filter((e) => e.bucket === "awaiting_reply").sort(byPriority),
    following_up: classified.filter((e) => e.bucket === "following_up").sort(byFollowupAge),
    reference: classified.filter((e) => e.bucket === "reference").sort(byPriority),
    fresh: classified.filter((e) => e.bucket === "fresh").sort(byPriority),
    background: classified.filter((e) => e.bucket === "background").sort(byPriority),
    handled: classified.filter((e) => e.bucket === "handled").sort(byPriority),
  };
}

function byFollowupAge(a: Classified, b: Classified) {
  // Oldest user-send first (most stale = most needs nudging)
  const aTime = a.user_last_sent_at ? new Date(a.user_last_sent_at).getTime() : Infinity;
  const bTime = b.user_last_sent_at ? new Date(b.user_last_sent_at).getTime() : Infinity;
  return aTime - bTime;
}

function byPriority(a: Classified, b: Classified) {
  if (b.score !== a.score) return b.score - a.score;
  return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
}
