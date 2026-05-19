import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/claude";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getActiveMemories, formatMemoriesForPrompt } from "@/lib/memory";

// Streaming endpoint — needs the Node runtime + force-dynamic so Vercel
// doesn't try to cache/buffer the response.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ASK_MAX = 60;
const ASK_WINDOW_MS = 60 * 60 * 1000; // 60 asks / hour / user

// File upload limits — keep per-request well under model + Vercel limits
const MAX_FILE_BYTES = 5 * 1024 * 1024;   // 5MB per file
const MAX_FILES_PER_REQUEST = 3;

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

INLINE ACTIONS — attach to any card item to make it actionable:

  Each item in a timeline/checklist/people card can have an "actions" array:
    "actions":[
      {"type":"open_email","label":"Open","email_id":"<the email's db id>"},
      {"type":"draft_reply","label":"Reply","email_id":"<id>"},
      {"type":"dismiss","label":"Dismiss","email_id":"<id>"},
      {"type":"ask_followup","label":"More on this","prompt":"tell me more about the United flight"}
    ]

  Action types:
    - open_email: opens the source email modal. Use when item refers to a specific email.
    - draft_reply: opens the email AND auto-drafts a reply. Use for "waiting on you" items.
    - dismiss: marks the email as handled. Use for noise/low-value items.
    - ask_followup: re-prompts the chat with the given text. Use for "drill in" buttons.

  Email IDs are shown in brackets at the start of each email line: [<uuid>]. Use that exact uuid.
  Only attach actions when they make sense for that specific item. Max 2 actions per item.

Rules:
- "text" is ALWAYS present. Even with a card, the text should briefly introduce it ("Here's your Tokyo trip:").
- For simple answers ("you have 3 unread"), use text-only with NO cards.
- This is a chat — remember the previous turns. If the user says "tell me more" or "when?", connect to the prior context.
- Speak in second person ("you", "your inbox").
- Never invent dates, amounts, names, or details that aren't in the provided emails.
- If the user attaches a PDF or image, READ IT and use it — extract dates, amounts, names, deadlines, anything specific. If the attachment is the main thing they're asking about, the answer should be grounded in the attachment, not their inbox.
- If the answer isn't in the emails or attachments, say so plainly in text. No card.
- Output VALID JSON ONLY. No prose before or after the JSON object. No markdown code fences.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

interface UploadedFile {
  filename: string;
  mime_type: string;
  data_base64: string;   // raw base64, no data: prefix
}

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

  // Parse + validate attachments (PDFs / images uploaded inline with the question)
  const rawAttachments: UploadedFile[] = Array.isArray(body.attachments)
    ? body.attachments.slice(0, MAX_FILES_PER_REQUEST)
    : [];
  const attachments: UploadedFile[] = [];
  for (const a of rawAttachments) {
    if (!a || typeof a !== "object") continue;
    const { filename, mime_type, data_base64 } = a as UploadedFile;
    if (typeof filename !== "string" || typeof mime_type !== "string" || typeof data_base64 !== "string") continue;
    if (!isAllowedMime(mime_type)) continue;
    // Cap byte size
    const approxBytes = Math.floor((data_base64.length * 3) / 4);
    if (approxBytes > MAX_FILE_BYTES) continue;
    attachments.push({ filename, mime_type, data_base64 });
  }

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
    id: string;
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
    .select("id, from_name, from_email, subject, snippet, body_preview, attachments_text, received_at, score, is_unread, user_replied")
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
      .select("id, from_name, from_email, subject, snippet, body_preview, attachments_text, received_at, score, is_unread, user_replied")
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
    // [id] is the database uuid — the model uses this for action.email_id
    const header = `[${e.id}] (#${i + 1}) ${dateStr} | ${e.from_name || e.from_email} <${e.from_email}> | ${e.subject}`;
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
  // The latest user turn ALSO gets any uploaded files attached as content blocks.
  type ClaudeContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

  type ClaudeMessage = { role: "user" | "assistant"; content: string | ClaudeContentBlock[] };

  const claudeMessages: ClaudeMessage[] = messages.map((m, idx) => {
    const isLatest = idx === messages.length - 1;
    const isFirst = idx === 0;

    if (isFirst && m.role === "user") {
      const textContent = `${memoryBlock ? `${memoryBlock}\n\n---\n\n` : ""}My inbox (most recent first, including any older emails that match the question):\n\n${emailContext}\n\n---\n\n${m.content}`;

      if (isLatest && attachments.length > 0) {
        return {
          role: "user",
          content: attachmentsToBlocks(attachments, textContent),
        };
      }
      return { role: "user", content: textContent };
    }

    // Update inbox context on the latest turn too — so follow-up questions
    // about new keywords also get the right emails surfaced.
    if (isLatest && m.role === "user" && messages.length > 1) {
      const textContent = `[Updated inbox context for this question:\n\n${emailContext}\n\n---\n\n]\n\n${m.content}`;
      if (attachments.length > 0) {
        return {
          role: "user",
          content: attachmentsToBlocks(attachments, textContent),
        };
      }
      return { role: "user", content: textContent };
    }
    return m;
  });

  try {
    const client = createAnthropicClient();
    const stream = client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000, // cards with actions need more headroom
      system: ASK_SYSTEM,
      // The SDK has strict literal types for media_type that our generic
      // string can't satisfy — we validated MIME at the boundary, so the
      // cast is safe.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: ([
        ...claudeMessages,
        // Prefill the assistant's response with "{" to lock it into JSON.
        { role: "assistant", content: "{" },
      ] as unknown) as any,
    });

    // Pipe raw text deltas back to the client. The client prepends "{" and
    // does incremental JSON parsing to surface text + cards as they arrive.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Send an immediate space byte to defeat any intermediate buffering.
        // The client's tolerant JSON parser ignores leading whitespace.
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          /* fine */
        }

        // Heartbeat — keeps the connection alive on slow Anthropic responses.
        // Sends a single space every 15s if no real chunks have come through.
        let lastChunkAt = Date.now();
        const heartbeat = setInterval(() => {
          if (Date.now() - lastChunkAt > 12_000) {
            try {
              controller.enqueue(encoder.encode(" "));
              lastChunkAt = Date.now();
            } catch {
              /* fine */
            }
          }
        }, 5_000);

        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta" &&
              event.delta.text
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
              lastChunkAt = Date.now();
            }
          }
          clearInterval(heartbeat);
          controller.close();
        } catch (err) {
          clearInterval(heartbeat);
          console.error("[ask] stream error", err instanceof Error ? err.message : err);
          // Emit a JSON-shaped error trailer so the client still parses something
          try {
            controller.enqueue(
              encoder.encode(
                `"text":"Sorry — I hit a problem reading the response. Try again?","cards":[]}`
              )
            );
          } catch {
            /* fine */
          }
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform, no-store",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ask failed" },
      { status: 500 }
    );
  }
}

const IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const DOC_MIMES = new Set(["application/pdf"]);

function isAllowedMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime) || DOC_MIMES.has(mime);
}

/**
 * Build the Claude content-block array for the latest user turn when files
 * are attached. PDFs go in as "document" blocks; images as "image" blocks.
 * The text question becomes the last block so the model anchors on the
 * latest typed words.
 */
function attachmentsToBlocks(
  files: UploadedFile[],
  textContent: string
): Array<
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
> {
  const blocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  > = [];

  for (const f of files) {
    if (IMAGE_MIMES.has(f.mime_type)) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: f.mime_type, data: f.data_base64 },
      });
    } else if (DOC_MIMES.has(f.mime_type)) {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: f.mime_type, data: f.data_base64 },
      });
    }
  }

  // Tell the model about the files by name before the question
  const fileNote =
    files.length > 0
      ? `\n\n(The user has attached ${files.length} file${files.length === 1 ? "" : "s"}: ${files
          .map((f) => `${f.filename}`)
          .join(", ")}. Use them as primary context for the question that follows.)`
      : "";

  blocks.push({ type: "text", text: textContent + fileNote });
  return blocks;
}

