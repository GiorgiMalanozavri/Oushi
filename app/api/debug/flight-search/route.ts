import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Diagnostic: finds anything flight/travel-shaped in your inbox and reports
 * what we have stored — so we can see why /api/ask isn't finding it.
 *
 * GET /api/debug/flight-search
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  // Check the schema is set up
  const { data: schemaCheck, error: schemaErr } = await service
    .from("emails")
    .select("id, has_attachments, attachments_text")
    .eq("user_id", user.id)
    .limit(1);

  const hasAttachmentsColumn = !schemaErr;
  const sampleRow = schemaCheck?.[0];

  // Search the whole user inbox (no date filter) for flight-shaped emails
  const KEYWORDS = [
    "flight", "boarding", "itinerary", "departure", "airline", "airport",
    "booking confirmation", "e-ticket", "eticket", "reservation",
    "delta", "united", "american airlines", "southwest", "jetblue",
    "british airways", "lufthansa", "air france", "klm", "emirates",
    "qatar", "turkish", "ryanair", "easyjet", "wizz", "alaska airlines",
  ];

  // Build a Postgres OR filter
  const orFilter = KEYWORDS
    .map((k) => `subject.ilike.%${k}%,from_email.ilike.%${k}%,from_name.ilike.%${k}%,body_preview.ilike.%${k}%,snippet.ilike.%${k}%`)
    .join(",");

  const { data: matches } = await service
    .from("emails")
    .select("id, from_name, from_email, subject, snippet, received_at, has_attachments, attachments_text, score, body_preview")
    .eq("user_id", user.id)
    .or(orFilter)
    .order("received_at", { ascending: false })
    .limit(20);

  const summary = (matches || []).map((m) => {
    const ageDays = Math.floor((Date.now() - new Date(m.received_at).getTime()) / (24 * 60 * 60 * 1000));
    return {
      from: `${m.from_name} <${m.from_email}>`,
      subject: m.subject,
      received_days_ago: ageDays,
      score: m.score,
      has_attachments: m.has_attachments,
      attachments_text_length: m.attachments_text?.length || 0,
      attachments_text_preview: m.attachments_text?.slice(0, 300) || null,
      body_preview_length: m.body_preview?.length || 0,
      body_preview_first_300: m.body_preview?.slice(0, 300) || null,
      snippet: m.snippet?.slice(0, 200),
    };
  });

  // Also count total emails + how many have attachments
  const { count: totalCount } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { count: attachmentCount } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("has_attachments", true);

  const { count: extractedCount } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("attachments_text", "is", null);

  return NextResponse.json({
    schema: {
      has_attachments_column_exists: hasAttachmentsColumn,
      sample_row_has_field: sampleRow ? "has_attachments" in sampleRow : null,
    },
    inbox_stats: {
      total_emails: totalCount,
      emails_with_attachments_flag: attachmentCount,
      emails_with_extracted_text: extractedCount,
    },
    flight_matches_found: summary.length,
    flight_matches: summary,
  });
}
