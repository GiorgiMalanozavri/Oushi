/**
 * Email templates. Plain TS templates instead of MJML / react-email —
 * cheap, no build step, easy to edit. Each function returns
 * { subject, text, html } ready to hand to sendEmail.
 *
 * Voice rule: every email is signed by Giorgi personally during the
 * beta. Sounds like a person, not a robot. Once we have 1000+ users
 * we'll move to brand voice; for now founder warmth converts.
 */

import { EMAIL_GIORGI, EMAIL_HELLO } from "./addresses";

interface Template {
  subject: string;
  text: string;
  html: string;
}

const FOOTER = `
<p style="font-size:12px;color:#A89F92;margin-top:32px;padding-top:16px;border-top:1px solid #E6DCC4">
  You're receiving this because you signed up for Oushi.
  Reply to this email or write to <a href="mailto:${EMAIL_HELLO}" style="color:#B86B4A">${EMAIL_HELLO}</a> any time.
</p>
`;

const FOOTER_TEXT = `\n\n—\nReply to this email or write to ${EMAIL_HELLO} any time.`;

function htmlShell(body: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF6EB;margin:0;padding:24px"><div style="max-width:560px;margin:0 auto;background:#FFFCF3;border-radius:16px;border:1px solid #E6DCC4;padding:32px;font-size:15px;line-height:1.6;color:#2A2520">${body}${FOOTER}</div></body></html>`;
}

/** First-touch welcome — fires on signup */
export function welcomeEmail(firstName: string | null): Template {
  const hi = firstName ? `Hey ${firstName},` : "Hey,";
  const subject = "Welcome to Oushi";
  const text = `${hi}

I'm Giorgi, the person behind Oushi. You're one of the first to try it. Thank you.

A few things to know:

1. Oushi reads your last 30 days of email, ranks what matters, and labels everything in Gmail. The first sync takes about a minute.

2. The labels won't be perfect. If something's mis-labeled, click it and tell Oushi the right answer. Every correction makes the next one better.

3. If anything's broken or confusing, hit reply on this email. You'll go straight to me.

That's it. Open the app and let me know how it feels.

— Giorgi
${EMAIL_GIORGI}${FOOTER_TEXT}`;

  const html = htmlShell(`
    <p style="font-family:Georgia,serif;font-size:24px;margin:0 0 16px;color:#2A2520">${hi}</p>
    <p>I'm Giorgi, the person behind Oushi. You're one of the first to try it. Thank you.</p>
    <p>A few things to know:</p>
    <ol style="padding-left:20px;margin:16px 0">
      <li style="margin-bottom:8px">Oushi reads your last 30 days of email, ranks what matters, and labels everything in Gmail. The first sync takes about a minute.</li>
      <li style="margin-bottom:8px">The labels won't be perfect. If something's mis-labeled, click it and tell Oushi the right answer. Every correction makes the next one better.</li>
      <li style="margin-bottom:8px">If anything's broken or confusing, hit reply on this email. You'll go straight to me.</li>
    </ol>
    <p>That's it. Open the app and let me know how it feels.</p>
    <p style="margin-top:24px">— Giorgi<br/><a href="mailto:${EMAIL_GIORGI}" style="color:#B86B4A">${EMAIL_GIORGI}</a></p>
  `);

  return { subject, text, html };
}

/** Sent 24h after signup — "how's it going" check-in */
export function checkInEmail(firstName: string | null): Template {
  const hi = firstName ? `Hey ${firstName},` : "Hey,";
  const subject = "How's Oushi going?";
  const text = `${hi}

It's been about a day since you signed up for Oushi. Quick check-in.

Two questions if you have 60 seconds:

1. What's working well?
2. What's broken or confusing?

Even a one-line reply helps a ton. I read every response personally.

— Giorgi
${EMAIL_GIORGI}${FOOTER_TEXT}`;

  const html = htmlShell(`
    <p style="font-family:Georgia,serif;font-size:24px;margin:0 0 16px">${hi}</p>
    <p>It's been about a day since you signed up for Oushi. Quick check-in.</p>
    <p>Two questions if you have 60 seconds:</p>
    <ol style="padding-left:20px;margin:16px 0">
      <li style="margin-bottom:8px">What's working well?</li>
      <li style="margin-bottom:8px">What's broken or confusing?</li>
    </ol>
    <p>Even a one-line reply helps a ton. I read every response personally.</p>
    <p style="margin-top:24px">— Giorgi<br/><a href="mailto:${EMAIL_GIORGI}" style="color:#B86B4A">${EMAIL_GIORGI}</a></p>
  `);

  return { subject, text, html };
}

/** Routed feedback report — sent to support@ when user uses the
 *  in-app "Send feedback" button so reports land in your inbox. */
export function feedbackReportEmail(input: {
  fromEmail: string;
  fromName: string | null;
  message: string;
  pageUrl: string;
  userAgent: string;
  userId: string;
}): Template {
  const subject = `[Oushi feedback] ${input.message.slice(0, 60)}${input.message.length > 60 ? "…" : ""}`;
  const text = `New feedback from ${input.fromName || input.fromEmail}

User: ${input.fromName || "(no name)"} <${input.fromEmail}>
User ID: ${input.userId}
Page: ${input.pageUrl}
UA: ${input.userAgent}

Message:
${input.message}`;

  const html = htmlShell(`
    <p style="font-family:Georgia,serif;font-size:20px;margin:0 0 12px">Feedback from ${escapeHtml(input.fromName || input.fromEmail)}</p>
    <table style="width:100%;font-size:13px;color:#766E63;border-collapse:collapse">
      <tr><td style="padding:4px 0;width:80px">User</td><td>${escapeHtml(input.fromName || "(no name)")} &lt;<a href="mailto:${input.fromEmail}" style="color:#B86B4A">${input.fromEmail}</a>&gt;</td></tr>
      <tr><td style="padding:4px 0">User ID</td><td><code>${input.userId}</code></td></tr>
      <tr><td style="padding:4px 0">Page</td><td><code>${escapeHtml(input.pageUrl)}</code></td></tr>
      <tr><td style="padding:4px 0">UA</td><td style="font-size:11px;color:#A89F92"><code>${escapeHtml(input.userAgent)}</code></td></tr>
    </table>
    <div style="margin-top:20px;padding:16px;background:#FAF6EB;border-radius:8px;border-left:3px solid #B86B4A;white-space:pre-wrap">${escapeHtml(input.message)}</div>
  `);

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
