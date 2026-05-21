import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY debug endpoint — delete after fixing the CRON_SECRET issue.
 *
 * Returns:
 *   - Whether each cron-related env var is set on this server
 *   - Length of each value (no full reveal)
 *   - First+last 4 chars (for visual byte-compare without leaking the value)
 *   - The Authorization header received from the caller (length + edges)
 *
 * Lets us answer: "Does the server have what we think it has, and is the
 * caller sending what we think they're sending?"
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET || "";
  const resendKey = process.env.RESEND_API_KEY || "";
  const auth = request.headers.get("authorization") || "";

  const peek = (s: string) =>
    !s
      ? null
      : {
          length: s.length,
          first4: s.slice(0, 4),
          last4: s.slice(-4),
        };

  return NextResponse.json({
    server: {
      CRON_SECRET_set: !!cronSecret,
      CRON_SECRET_preview: peek(cronSecret),
      RESEND_API_KEY_set: !!resendKey,
      RESEND_API_KEY_preview: peek(resendKey),
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || null,
    },
    caller: {
      authorization_received: !!auth,
      authorization_preview: peek(auth),
      expected_full_value:
        cronSecret && auth === `Bearer ${cronSecret}` ? "match" : "MISMATCH",
    },
    note: "Delete this endpoint after debugging.",
  });
}
