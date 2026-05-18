import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/claude";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getActiveMemories, formatMemoriesForPrompt } from "@/lib/memory";

const ASK_MAX = 30;
const ASK_WINDOW_MS = 60 * 60 * 1000; // 30 asks / hour / user

const ASK_SYSTEM = `You are Oushi, the user's personal email assistant. The user will ask a question about their inbox. Answer using ONLY the emails provided.

Rules:
- Be direct and conversational. 1-4 sentences usually.
- If you reference a specific email, mention the sender's name.
- If the answer isn't in the provided emails, say so plainly. Do NOT make things up.
- No bullet lists unless the user asks for a list.
- No markdown headers. Plain prose.
- Speak in second person ("you", "your inbox").`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = rateLimit(`ask:${user.id}`, ASK_MAX, ASK_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many questions. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: rateLimitHeaders(limit, ASK_MAX) }
    );
  }

  const { question } = await request.json();
  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }

  const service = await createServiceClient();

  type EmailLite = {
    from_name: string | null;
    from_email: string | null;
    subject: string | null;
    snippet: string | null;
    body_preview: string | null;
    attachments_text: string | null;
    received_at: string;
    score: number | null;
  };

  // Pull recent emails (last 30 days) for "what's in my inbox" type questions.
  const { data: recentEmails } = await service
    .from("emails")
    .select("from_name, from_email, subject, snippet, body_preview, attachments_text, received_at, score, is_unread, user_replied")
    .eq("user_id", user.id)
    .gte("received_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order("received_at", { ascending: false })
    .limit(60);

  // Extract meaningful keywords from the question.
  const STOP_WORDS = new Set([
    "the", "and", "for", "what", "when", "where", "who", "why", "how",
    "from", "this", "that", "with", "have", "has", "had", "are", "was",
    "were", "been", "being", "did", "does", "doing", "will", "would",
    "could", "should", "can", "may", "might", "must", "shall", "into",
    "about", "tell", "show", "give", "find", "any", "all", "some", "more",
    "next", "last", "your", "mine", "ours", "yours", "their",
  ]);
  const rawWords = question
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  // Synonym expansion — when the user asks about a flight, also pull
  // "ticket / itinerary / airline / booking" emails, since airlines rarely
  // put the word "flight" in subject lines.
  const SYNONYMS: Record<string, string[]> = {
    flight: ["flight", "airline", "boarding", "ticket", "itinerary", "departure", "trip", "booking", "confirmation", "eticket"],
    flights: ["flight", "airline", "boarding", "ticket", "itinerary", "departure", "trip", "booking", "confirmation", "eticket"],
    travel: ["flight", "hotel", "booking", "reservation", "itinerary", "trip", "airline"],
    trip: ["flight", "hotel", "booking", "reservation", "itinerary", "trip", "airline"],
    hotel: ["hotel", "booking", "reservation", "check-in", "checkin", "stay", "airbnb"],
    package: ["package", "delivery", "shipment", "shipped", "tracking", "order"],
    order: ["order", "purchase", "receipt", "shipment", "delivery", "tracking"],
    bill: ["bill", "invoice", "payment", "due", "balance", "statement"],
    invoice: ["bill", "invoice", "payment", "due", "balance", "statement"],
    meeting: ["meeting", "calendar", "schedule", "appointment", "invite"],
    interview: ["interview", "schedule", "calendar", "appointment", "call"],
  };
  const expanded = new Set<string>();
  for (const w of rawWords) {
    expanded.add(w);
    if (SYNONYMS[w]) for (const s of SYNONYMS[w]) expanded.add(s);
  }
  const qWords = Array.from(expanded);

  // ALSO do a wider keyword search going back 6 months — flights, hotels, bookings
  // are often confirmed months in advance, so the 30-day window misses them.
  let widerMatches: EmailLite[] = [];
  if (qWords.length > 0) {
    const orFilter = qWords
      .slice(0, 10)
      .flatMap((w) => [
        `subject.ilike.%${w}%`,
        `from_email.ilike.%${w}%`,
        `from_name.ilike.%${w}%`,
        `body_preview.ilike.%${w}%`,
        `snippet.ilike.%${w}%`,
        `attachments_text.ilike.%${w}%`,
      ])
      .join(",");

    const { data: olderMatches } = await service
      .from("emails")
      .select("from_name, from_email, subject, snippet, body_preview, attachments_text, received_at, score, is_unread, user_replied")
      .eq("user_id", user.id)
      .gte("received_at", new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
      .or(orFilter)
      .order("score", { ascending: false })
      .limit(30);
    widerMatches = olderMatches || [];
  }

  // De-dupe by subject+from
  const seen = new Set<string>();
  const list: EmailLite[] = [];
  for (const e of [...(recentEmails || []), ...widerMatches]) {
    const key = `${e.from_email}|${e.subject}|${e.received_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(e);
  }

  // Build the "full body" set. Three buckets:
  //   1. Top 8 most recent emails (always)
  //   2. Top 8 highest-scored emails from the last 30 days (catches important
  //      stuff like flight confirmations that may not be in top-recent)
  //   3. Up to 12 keyword-matched emails (with synonym expansion)
  const fullBodyIds = new Set<EmailLite>();

  for (const e of list.slice(0, 8)) fullBodyIds.add(e);

  const byScore = [...list]
    .filter((e) => (e.score ?? 0) >= 50)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8);
  for (const e of byScore) fullBodyIds.add(e);

  let matchedCount = 0;
  for (const e of list) {
    if (fullBodyIds.has(e)) continue;
    const hay = `${e.subject || ""} ${e.snippet || ""} ${e.body_preview || ""} ${e.attachments_text || ""} ${e.from_name || ""} ${e.from_email || ""}`.toLowerCase();
    const hits = qWords.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
    if (hits > 0) {
      fullBodyIds.add(e);
      matchedCount++;
      if (matchedCount >= 12) break;
    }
  }

  // Compose: full body for important set, snippet only for the rest.
  const emailContext = list.map((e: EmailLite, i) => {
    const date = new Date(e.received_at);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const header = `[${i + 1}] ${dateStr} | ${e.from_name || e.from_email} <${e.from_email}> | ${e.subject}`;
    const useFullBody = fullBodyIds.has(e);
    const body = useFullBody
      ? (e.body_preview || e.snippet || "")
      : (e.snippet || (e.body_preview?.slice(0, 200) || ""));
    const attach = useFullBody && e.attachments_text
      ? `\n[Attachments]: ${e.attachments_text.slice(0, 1500)}`
      : "";
    return `${header}\n${body}${attach}`;
  }).join("\n\n---\n\n");

  const memories = await getActiveMemories(service, user.id, 50);
  const memoryBlock = formatMemoriesForPrompt(memories);

  try {
    const client = createAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: ASK_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${memoryBlock ? `${memoryBlock}\n\n---\n\n` : ""}My inbox (most recent first, including any older emails that match the question):\n\n${emailContext}\n\n---\n\nMy question: ${question.trim()}`,
        },
      ],
    });

    const answer = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ask failed" },
      { status: 500 }
    );
  }
}
