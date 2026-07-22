import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient, extractJson } from "@/lib/claude";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const MATCH_SYSTEM = `You assign emails to user-defined topic boards.

You will receive:
- A list of topic boards (name + description)
- A batch of emails

For each email, decide which topic boards it belongs to (zero, one, or many).

Output ONLY valid JSON in this exact shape:
{
  "assignments": [
    { "id": "<email id>", "matched_topics": ["Topic A", "Topic B"] }
  ]
}

Rules:
- Use the EXACT topic names from the list, not paraphrases.
- An email can match multiple topics or none.
- Be discerning, don't shove emails into topics that only loosely relate.`;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = rateLimit(`rematch:${user.id}`, 6, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Re-sort hit cooldown. Try again in ${Math.ceil((limit.retryAfterSeconds || 60) / 60)} min.` },
      { status: 429 }
    );
  }

  const service = await createServiceClient();

  const { data: topics } = await service
    .from("user_topics")
    .select("name, description")
    .eq("user_id", user.id);

  if (!topics || topics.length === 0) {
    await service
      .from("emails")
      .update({ matched_topics: [] })
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true, rematched: 0 });
  }

  const { data: emails } = await service
    .from("emails")
    .select("id, from_name, from_email, subject, snippet, body_preview")
    .eq("user_id", user.id)
    .gte("score", 25)
    .gte("received_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order("received_at", { ascending: false })
    .limit(100);

  if (!emails || emails.length === 0) {
    return NextResponse.json({ ok: true, rematched: 0 });
  }

  const topicNames = new Set(topics.map((t) => t.name));
  const topicsBlock = topics
    .map((t) => `- "${t.name}"${t.description ? `: ${t.description}` : ""}`)
    .join("\n");

  const batchSize = 15;
  let rematched = 0;
  const client = createAnthropicClient();

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const emailList = batch
      .map((e) =>
        `id: ${e.id}\nFrom: ${e.from_name || e.from_email}\nSubject: ${e.subject}\nPreview: ${(e.snippet || e.body_preview?.slice(0, 200) || "").slice(0, 200)}`
      )
      .join("\n\n");

    try {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: MATCH_SYSTEM,
        messages: [
          {
            role: "user",
            content: `TOPIC BOARDS:\n${topicsBlock}\n\nEMAILS:\n\n${emailList}\n\nAssign each email to its topic boards.`,
          },
        ],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(extractJson(text));

      interface Assignment { id: string; matched_topics: string[] }
      for (const a of parsed.assignments || []) {
        const filtered = (Array.isArray(a.matched_topics) ? a.matched_topics : []).filter((n: string) =>
          topicNames.has(n)
        );
        await service
          .from("emails")
          .update({ matched_topics: filtered })
          .eq("id", a.id)
          .eq("user_id", user.id);
        rematched++;
      }
    } catch (e) {
      console.error("rematch batch failed", e);
    }
  }

  return NextResponse.json({ ok: true, rematched });
}
