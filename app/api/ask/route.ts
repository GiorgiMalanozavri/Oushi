import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/claude";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getActiveMemories, formatMemoriesForPrompt } from "@/lib/memory";

const ASK_MAX = 60;
const ASK_WINDOW_MS = 60 * 60 * 1000; // 60 asks / hour / user

const ASK_SYSTEM = `You are Oushi, the user's personal email assistant. The user is chatting with you about their inbox. Answer using ONLY the emails provided.

OUTPUT FORMAT — STRICT JSON, no markdown, no code fences:

{
  "text": "<short conversational answer, 1-3 sentences>",
  "cards": [ <0 or more cards> ]
}

The "text" field is REQUIRED. It's always present — a brief conversational lead-in or the full answer for simple questions.
The "cards" field is OPTIONAL. Include cards ONLY when visual structure makes the answer clearer.

Available card types:

1. TIMELINE — for trips, itineraries, sequences of dated events
   {"type":"timeline","title":"<optional name>","events":[
     {"date":"May 22","time":"10:30am","title":"United UA847 to NRT","subtitle":"Confirmation MYE8MC","detail":"Seat 14C","icon":"plane"}
   ]}
   icon: "plane" | "hotel" | "calendar" | "meeting" | "deadline" | "package" | "mail" | "dollar" | "dot"
   USE FOR: "when's my flight", "what's my trip look like", "what's coming up"

2. CHECKLIST — for commitments, action items, things-to-do extracted from emails
   {"type":"checklist","title":"This week","items":[
     {"text":"Send the design draft to Sarah","detail":"She asked by Friday","source":"from Sarah, May 14"}
   ]}
   USE FOR: "what did I commit to", "what's left to do", "what's waiting on me"

3. PEOPLE — for sender lists, relationship status, who's waiting
   {"type":"people","title":"Waiting on you","people":[
     {"name":"Sarah Chen","email":"sarah@acme.com","role":"PM","last_contact":"3 days ago","status":"waiting","note":"Asked about the design timeline"}
   ]}
   status: "waiting" | "replied" | "stale" | "fresh"
   USE FOR: "who emailed me", "who's waiting on me", "who haven't I responded to"

4. COMPARISON — for 2 or 3 options side-by-side
   {"type":"comparison","title":"Two offers","columns":[
     {"name":"Acme Co","subtitle":"Senior Engineer","rows":[
       {"label":"Salary","value":"$180k","highlight":true},
       {"label":"Equity","value":"0.5%"}
     ]}
   ]}
   USE FOR: any "compare X and Y" question
   IMPORTANT: keep columns to 2-3 max. Each column should have the SAME row labels.

5. SUMMARY — for digest-style answers with grouped sections
   {"type":"summary","title":"This week","sections":[
     {"heading":"Urgent","items":[{"text":"Contract from Stripe needs signing","from":"legal@stripe.com"}]},
     {"heading":"Awaiting reply","items":[{"text":"Sarah wants design feedback","from":"Sarah Chen"}]}
   ]}
   USE FOR: "summarize my week", "what happened today", "give me an overview"

Rules:
- "text" is ALWAYS present. Even with a card, the text should briefly introduce it ("Here's your Tokyo trip:").
- For simple answers ("you have 3 unread"), use text-only with NO cards.
- This is a chat — remember the previous turns. If the user says "tell me more" or "when?", connect to the prior context.
- Speak in second person ("you", "your inbox").
- Never invent dates, amounts, names, or details that aren't in the provided emails.
- If the answer isn't in the emails, say so plainly in text. No card.
- Output VALID JSON ONLY. No prose before or after the JSON object. No markdown code fences.`;

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
      max_tokens: 1600, // cards can be larger than plain text
      system: ASK_SYSTEM,
      messages: [
        ...claudeMessages,
        // Prefill the assistant's response with "{" to lock it into JSON.
        { role: "assistant", content: "{" },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    // The model continues from our prefilled "{", so we prepend it back.
    const jsonStr = "{" + raw;

    const parsed = safeParseAskJson(jsonStr);
    if (!parsed) {
      // Fall back to treating the whole thing as text — best effort.
      return NextResponse.json({
        answer: raw || "Sorry, I didn't get that.",
        cards: [],
        question: latestQuestion,
      });
    }

    return NextResponse.json({
      answer: parsed.text,
      cards: parsed.cards,
      question: latestQuestion,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ask failed" },
      { status: 500 }
    );
  }
}

/**
 * Parse the model's JSON response, tolerating common quirks (trailing
 * commentary, missing fields). Returns null on unrecoverable failure.
 */
function safeParseAskJson(input: string): { text: string; cards: unknown[] } | null {
  // Try to find a JSON object boundary
  const start = input.indexOf("{");
  if (start === -1) return null;

  // Find matching closing brace
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  const slice = input.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    const text = typeof obj?.text === "string" ? obj.text : "";
    const cards = Array.isArray(obj?.cards) ? obj.cards : [];
    return { text, cards };
  } catch {
    return null;
  }
}
