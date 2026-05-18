import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/claude";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getActiveMemories, formatMemoriesForPrompt } from "@/lib/memory";

const ASK_MAX = 60;
const ASK_WINDOW_MS = 60 * 60 * 1000; // 60 asks / hour / user

const ASK_SYSTEM = `You are Oushi, the user's personal email assistant. The user is chatting with you about their inbox. Answer using ONLY the emails provided in the first turn.

Rules:
- Be direct and conversational. 1-4 sentences usually.
- This is an ongoing conversation — remember what the user just asked. If they say "tell me more" or "when?" or "who?", connect it to the previous turn.
- If you reference a specific email, mention the sender's name.
- If the answer isn't in the provided emails, say so plainly. Do NOT make things up.
- No bullet lists unless the user asks for a list.
- No markdown headers. Plain prose.
- Speak in second person ("you", "your inbox").`;

type ChatMessage = { role: "user" | "assistant"; content: string };

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

  const body = await request.json();

  // Accept either { messages: [...] } (multi-turn chat) or { question: "..." }
  // (legacy single-shot). Normalize to messages.
  let messages: ChatMessage[] = [];
  if (Array.isArray(body.messages)) {
    messages = body.messages
      .filter((m: { role?: string; content?: string }) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
      )
      .slice(-12); // cap history at 12 turns
  } else if (typeof body.question === "string" && body.question.trim().length > 0) {
    messages = [{ role: "user", content: body.question.trim() }];
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "messages must end with a user turn" }, { status: 400 });
  }

  const latestQuestion = messages[messages.length - 1].content;

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

  // For keyword extraction, combine the latest question with the prior user turn
  // (gives "tell me more about it" enough context to find the right emails).
  const lastTwoUserTurns = messages
    .filter((m) => m.role === "user")
    .slice(-2)
    .map((m) => m.content)
    .join(" ");

  const STOP_WORDS = new Set([
    "the", "and", "for", "what", "when", "where", "who", "why", "how",
    "from", "this", "that", "with", "have", "has", "had", "are", "was",
    "were", "been", "being", "did", "does", "doing", "will", "would",
    "could", "should", "can", "may", "might", "must", "shall", "into",
    "about", "tell", "show", "give", "find", "any", "all", "some", "more",
    "next", "last", "your", "mine", "ours", "yours", "their", "you",
  ]);
  const rawWords = lastTwoUserTurns
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  // Synonym expansion — airlines rarely put "flight" in subject lines.
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

  // Wider keyword search going back 6 months
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

  // De-dupe by subject+from+date
  const seen = new Set<string>();
  const list: EmailLite[] = [];
  for (const e of [...(recentEmails || []), ...widerMatches]) {
    const key = `${e.from_email}|${e.subject}|${e.received_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(e);
  }

  // Full-body set: top 8 recent + top 8 highest-scored + up to 12 keyword-matched
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

  const emailContext = list.map((e: EmailLite, i) => {
    const date = new Date(e.received_at);
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const header = `[${i + 1}] ${dateStr} | ${e.from_name || e.from_email} <${e.from_email}> | ${e.subject}`;
    const useFullBody = fullBodyIds.has(e);
    const bodyText = useFullBody
      ? (e.body_preview || e.snippet || "")
      : (e.snippet || (e.body_preview?.slice(0, 200) || ""));
    const attach = useFullBody && e.attachments_text
      ? `\n[Attachments]: ${e.attachments_text.slice(0, 1500)}`
      : "";
    return `${header}\n${bodyText}${attach}`;
  }).join("\n\n---\n\n");

  const memories = await getActiveMemories(service, user.id, 50);
  const memoryBlock = formatMemoriesForPrompt(memories);

  // Build Claude-format messages. The first user turn gets the inbox context
  // prepended. Subsequent turns are passed through as-is for natural chat.
  const claudeMessages: ChatMessage[] = messages.map((m, idx) => {
    if (idx === 0 && m.role === "user") {
      return {
        role: "user",
        content: `${memoryBlock ? `${memoryBlock}\n\n---\n\n` : ""}My inbox (most recent first, including any older emails that match the question):\n\n${emailContext}\n\n---\n\n${m.content}`,
      };
    }
    // Update inbox context on the latest turn too — so follow-up questions
    // about new keywords also get the right emails surfaced. Skip if this is
    // already the first turn (handled above).
    if (idx === messages.length - 1 && m.role === "user" && messages.length > 1) {
      return {
        role: "user",
        content: `[Updated inbox context for this question:\n\n${emailContext}\n\n---\n\n]\n\n${m.content}`,
      };
    }
    return m;
  });

  try {
    const client = createAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: ASK_SYSTEM,
      messages: claudeMessages,
    });

    const answer = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    return NextResponse.json({ answer, question: latestQuestion });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ask failed" },
      { status: 500 }
    );
  }
}
