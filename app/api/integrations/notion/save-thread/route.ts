import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { saveEmailToPage } from "@/lib/notion";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * POST /api/integrations/notion/save-thread
 *   Body: { email_id: string }
 *
 * Appends the email as a child block to the user's configured Notion
 * page. Rate-limited 30/hour per user so a script can't trash a page.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`notion-save:${user.id}`, 30, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Slow down — try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const emailId = String(body?.email_id || "").trim();
  if (!emailId) {
    return NextResponse.json({ error: "email_id is required" }, { status: 400 });
  }

  const service = await createServiceClient();
  const [{ data: integ }, { data: email }] = await Promise.all([
    service
      .from("user_integrations")
      .select("notion_access_token, notion_page_id, notion_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("emails")
      .select(
        "id, subject, from_name, from_email, received_at, snippet, body_preview, gmail_thread_id"
      )
      .eq("user_id", user.id)
      .eq("id", emailId)
      .maybeSingle(),
  ]);

  if (!integ?.notion_access_token || !integ?.notion_page_id) {
    return NextResponse.json(
      { error: "Notion isn't connected, or no page selected." },
      { status: 400 }
    );
  }
  if (!integ?.notion_enabled) {
    return NextResponse.json(
      { error: "Notion integration is paused — enable it in Settings." },
      { status: 400 }
    );
  }
  if (!email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  const ok = await saveEmailToPage(
    integ.notion_access_token,
    integ.notion_page_id,
    {
      subject: email.subject || "(no subject)",
      from_name: email.from_name,
      from_email: email.from_email,
      received_at: email.received_at,
      // Prefer body_preview if it's substantial, else snippet. Snippet
      // is usually the same first line Gmail shows — fine fallback.
      snippet:
        (email.body_preview && email.body_preview.length > 60)
          ? email.body_preview
          : email.snippet,
      gmail_thread_id: email.gmail_thread_id,
    }
  );

  if (!ok) {
    return NextResponse.json(
      { error: "Notion rejected the request. Re-share the page with Oushi?" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
