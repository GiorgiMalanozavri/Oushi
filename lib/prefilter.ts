interface PrefilterResult {
  score: number;
  category: "critical" | "useful" | "low_priority" | "noise";
  reasoning: string;
  requires_action: boolean;
}

const NOISE_SENDER_PATTERNS = [
  /^no[-_.]?reply@/i,
  /^do[-_.]?not[-_.]?reply@/i,
  /^notifications?@/i,
  /^newsletter@/i,
  /^marketing@/i,
  /^promotions?@/i,
  /^updates?@/i,
  /^alerts?@/i,
  /^info@/i,
  /^hello@/i,
  /^team@/i,
  /^automated@/i,
  /^postmaster@/i,
  /^mailer-daemon@/i,
  /^bounce@/i,
  /^digest@/i,
  /^email@/i,                 // email@email.brand.com style
  /^mail@/i,
  /^press@/i,
  /^announcement@/i,
  /^announcements@/i,
  /^reply\+/i,                // reply+abc123@... transactional bounce-trackers
  /^[a-z0-9]{20,}@/i,         // 20+ char hex senders (auto-gen IDs)
];

// Subdomain prefixes that indicate a marketing/bulk send (e.g. mail.acme.com,
// email.brand.com, e.retailer.com). If the From domain starts with one of these
// followed by a dot, the email is almost certainly bulk.
const NOISE_SUBDOMAIN_PREFIXES = [
  "email.",
  "mail.",
  "e.",
  "marketing.",
  "mkt.",
  "news.",
  "newsletter.",
  "promo.",
  "promotions.",
  "updates.",
  "notify.",
  "notifications.",
  "bulk.",
  "sender.",
  "broadcast.",
  "campaign.",
  "campaigns.",
  "send.",
  "ses.",
  "sendgrid.",
  "trk.",
  "click.",
  "links.",
  "info.",
];

const NOISE_DOMAIN_HINTS = [
  "mailchimp",
  "sendgrid",
  "mailgun",
  "constantcontact",
  "klaviyo",
  "hubspot",
  "marketo",
  "campaignmonitor",
  "convertkit",
  "substack",
  "beehiiv",
  "mailerlite",
  "amazonses",
  "sparkpost",
  "postmark",
  "sendinblue",
  "brevo",
  "mailjet",
  "iterable",
  "braze",
  "customer.io",
  "drip",
  "moosend",
  "omnisend",
  "intercom-mail",
];

const PROMO_SUBJECT_PATTERNS = [
  /\d+%\s*off/i,
  /\$\d+\s*off/i,
  /\bsale\b/i,
  /\bdeal\b/i,
  /\bdiscount(ed|s)?\b/i,
  /limited[\s-]time/i,
  /flash\s*sale/i,
  /last\s*chance/i,
  /final\s*(hours?|days?|chance)/i,
  /ends?\s*(today|tonight|tomorrow|soon)/i,
  /clearance/i,
  /coupon/i,
  /promo\s*code/i,
  /free\s*shipping/i,
  /unsubscribe/i,
  /\bbuy\s+\d+/i,
  /just\s*dropped/i,
  /new\s*arrival/i,
  /shop\s*(now|the)/i,
  /(perfect|new)\s+\w+\s+are\s+here/i,    // "your perfect shorts are HERE"
  /now\s+\d+%/i,
  /\bbogo\b/i,
  /save\s+(up\s+to\s+)?\$?\d+/i,
];

const LOW_VALUE_NOTIFICATION_PATTERNS = [
  /new\s*login/i,
  /new\s*device/i,
  /new\s*sign[-\s]?in/i,
  /signed?\s*in\s*(to|from)/i,
  /we\s*noticed\s*a?\s*(login|sign[-\s]?in)/i,
  /we\s*detected\s*a?\s*(login|sign[-\s]?in)/i,
  /sign[-\s]?in\s*(alert|detected|notification)/i,
  /security\s*alert/i,
  /verification\s*code/i,
  /verify\s*your\s*(email|account|identity)/i,
  /confirm\s*your\s*email/i,
  /one[-\s]?time\s*(passcode|password|code)/i,
  /your\s*account\s*was\s*accessed/i,
  /if\s*this\s*was\s*not\s*you/i,
  /password\s*(reset|changed|was\s*changed)/i,
  /two[-\s]?factor/i,
  /welcome\s*to/i,
];

interface PrefilterInput {
  from_email: string;
  subject: string;
  snippet: string;
  body_preview: string | null;
}

export function prefilter(email: PrefilterInput): PrefilterResult | null {
  const fromLower = email.from_email.toLowerCase();
  const domain = fromLower.split("@")[1] || "";
  const subject = email.subject || "";
  const haystack = `${subject} ${email.snippet || ""}`.toLowerCase();

  if (NOISE_SENDER_PATTERNS.some((re) => re.test(fromLower))) {
    return {
      score: 15,
      category: "noise",
      reasoning: "Automated / no-reply sender",
      requires_action: false,
    };
  }

  if (NOISE_DOMAIN_HINTS.some((hint) => domain.includes(hint))) {
    return {
      score: 18,
      category: "noise",
      reasoning: "Bulk email service",
      requires_action: false,
    };
  }

  if (NOISE_SUBDOMAIN_PREFIXES.some((p) => domain.startsWith(p))) {
    return {
      score: 16,
      category: "noise",
      reasoning: "Marketing subdomain",
      requires_action: false,
    };
  }

  // Emoji-heavy subjects (3+ emojis or 2+ uncommon ones) — almost always marketing
  // eslint-disable-next-line no-misleading-character-class
  const emojiMatches = subject.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  if (emojiMatches && emojiMatches.length >= 3) {
    return {
      score: 14,
      category: "noise",
      reasoning: "Emoji-heavy promotional subject",
      requires_action: false,
    };
  }

  if (PROMO_SUBJECT_PATTERNS.some((re) => re.test(subject))) {
    return {
      score: 12,
      category: "noise",
      reasoning: "Promotional content",
      requires_action: false,
    };
  }

  if (LOW_VALUE_NOTIFICATION_PATTERNS.some((re) => re.test(subject) || re.test(haystack))) {
    return {
      score: 14,
      category: "noise",
      reasoning: "Routine login / security notification",
      requires_action: false,
    };
  }

  if (
    haystack.includes("view this email in your browser") ||
    haystack.includes("you are receiving this") ||
    haystack.includes("manage your preferences")
  ) {
    return {
      score: 20,
      category: "noise",
      reasoning: "Mass-mail boilerplate detected",
      requires_action: false,
    };
  }

  return null;
}
