/**
 * Outbound email sender — wraps the Resend SDK.
 *
 * Every system-generated email in Oushi goes through this helper. Two
 * properties that matter:
 *
 * 1. NO-OP IF UNCONFIGURED. If RESEND_API_KEY isn't set (local dev, fresh
 *    deploy before the key lands, CI), sendEmail() logs and returns
 *    {ok: false, reason: "not_configured"} instead of crashing the caller.
 *    Lets us ship email-sending features safely before the key is ready.
 *
 * 2. ALWAYS FROM @oushi.app. The from/replyTo addresses default to the
 *    canonical constants in ./addresses.ts so individual call-sites can't
 *    accidentally send from a personal address.
 *
 * To enable in prod, set in your hosting env:
 *   RESEND_API_KEY=re_xxx_xxx
 *   (optional) RESEND_FROM_OVERRIDE=Oushi <noreply@oushi.app>
 */

import { Resend } from "resend";
import { FROM_NOREPLY, REPLY_TO } from "./addresses";

type SendResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  if (cachedClient) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedClient = new Resend(key);
  return cachedClient;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  /** Plain text version (falls back if html is missing) */
  text?: string;
  /** HTML body — pass either text or html, ideally both */
  html?: string;
  /** Override the default From (Oushi <noreply@oushi.app>). Use the
   *  helpers in addresses.ts (FROM_HELLO, FROM_GIORGI) when a sender
   *  warmth matters — e.g., the founder welcome email. */
  from?: string;
  /** Override the default Reply-To (hello@oushi.app). */
  replyTo?: string;
  /** Idempotency-style tag so Resend can dedupe — useful for "welcome
   *  email" type sends that might fire twice on race conditions. */
  tags?: Array<{ name: string; value: string }>;
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const client = getClient();
  if (!client) {
    console.warn(
      "[email/send] RESEND_API_KEY not set — would send:",
      input.subject,
      "to",
      input.to
    );
    return { ok: false, reason: "not_configured" };
  }

  try {
    const result = await client.emails.send({
      from: input.from || process.env.RESEND_FROM_OVERRIDE || FROM_NOREPLY,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      text: input.text || stripHtml(input.html || ""),
      html: input.html || textToHtml(input.text || ""),
      replyTo: input.replyTo || REPLY_TO,
      tags: input.tags,
    });
    if (result.error) {
      console.error("[email/send] Resend returned error:", result.error);
      return { ok: false, reason: result.error.message || "resend_error" };
    }
    return { ok: true, id: result.data?.id || "" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email/send] threw:", msg);
    return { ok: false, reason: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers — tiny converters so callers can pass just text OR just html
// ─────────────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withBreaks = escaped.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>");
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#2A2520;max-width:560px;margin:0 auto;padding:24px"><p>${withBreaks}</p></body></html>`;
}
