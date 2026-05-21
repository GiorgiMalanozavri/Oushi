/**
 * Single source of truth for every Oushi email address.
 *
 * Don't hardcode an oushi.app address anywhere else. Import from here so
 * if we ever change a brand address (e.g., hello@ → support@), it
 * propagates in one edit.
 *
 * All 5 are aliases on ImprovMX → forward to giorgi@oushi.app's real
 * inbox. Outbound sending goes through Resend with these as the From
 * address (proper SPF/DKIM/DMARC).
 */

/** Founder's personal / signed-emails address */
export const EMAIL_GIORGI = "giorgi@oushi.app";

/** Friendly public-facing contact (footer, "Contact" links, beta replies) */
export const EMAIL_HELLO = "hello@oushi.app";

/** Bug reports, help requests, account issues */
export const EMAIL_SUPPORT = "support@oushi.app";

/** Sender for system-generated emails (briefings, push, password resets) */
export const EMAIL_NOREPLY = "noreply@oushi.app";

/** Responsible disclosure / security.txt convention */
export const EMAIL_SECURITY = "security@oushi.app";

/**
 * "Send from" preset for system emails. Includes the friendly brand name
 * Gmail / Outlook display in the inbox row.
 */
export const FROM_NOREPLY = `Oushi <${EMAIL_NOREPLY}>`;
export const FROM_HELLO = `Oushi <${EMAIL_HELLO}>`;
export const FROM_GIORGI = `Giorgi at Oushi <${EMAIL_GIORGI}>`;

/**
 * Reply-To we set on every system email — so when a user hits "Reply" to
 * a briefing or password-reset, their reply lands in a real, monitored
 * inbox (not noreply@'s discard).
 */
export const REPLY_TO = EMAIL_HELLO;
