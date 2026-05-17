import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient } from "@/lib/claude";
import { getActiveMemories, formatMemoriesForPrompt } from "@/lib/memory";

const BRIEFING_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { text: string; createdAt: number; signature: string }>();

const BRIEFING_SYSTEM = `You are the user's personal email chief of staff. Write a SHORT, conversational morning briefing in the user's own voice — like a chief of staff would, not like a newsletter.

Rules:
- 2-3 sentences MAX. Never longer.
- Lead with the single most important thing.
- Be specific: name people, dates, deadlines, dollar amounts when present.
- No emojis. No bullet lists. Plain prose.
- Sound human, not corporate. "There's a deadline from..." not "Please be advised that..."
- If the inbox is quiet, write a single relaxed sentence acknowledging that.
- Never invent details not in the emails.

Output plain text only — no JSON, no markdown.`;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  const { data: emails } = await service
    .from("emails")
    .select("from_name, from_email, subject, snippet, score, category, received_at, is_unread, user_replied, dismissed_at, highlight")
    .eq("user_id", user.id)
    .gte("received_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
    .gte("score", 50)
    .is("dismissed_at", null)
    .order("score", { ascending: false })
    .limit(15);

  const list = emails || [];
  const signature = `${list.length}:${list.map((e) => `${e.subject}-${e.score}`).join("|").slice(0, 200)}`;

  const cached = cache.get(user.id);
  if (cached && cached.signature === signature && Date.now() - cached.createdAt < BRIEFING_TTL_MS) {
    return NextResponse.json({ briefing: cached.text, cached: true });
  }

  if (list.length === 0) {
    const text = "Inbox is quiet. Nothing pressing.";
    cache.set(user.id, { text, createdAt: Date.now(), signature });
    return NextResponse.json({ briefing: text, cached: false });
  }

  const { data: profile } = await service
    .from("user_profile")
    .select("bio, interests, priorities")
    .eq("user_id", user.id)
    .single();

  const emailLines = list.slice(0, 10).map((e, i) => {
    const ageHrs = Math.round((Date.now() - new Date(e.received_at).getTime()) / 3600000);
    return `${i + 1}. [${e.score}, ${ageHrs}h old, ${e.is_unread ? "unread" : "read"}] ${e.from_name || e.from_email}: ${e.subject}${e.highlight ? ` — ${e.highlight}` : ""}${e.snippet ? ` (preview: ${e.snippet.slice(0, 120)})` : ""}`;
  }).join("\n");

  const profileLine = profile ? `User cares about: ${(profile.priorities || []).join(", ")}. Interests: ${(profile.interests || []).join(", ")}.` : "";

  const memories = await getActiveMemories(service, user.id, 40);
  const memoryBlock = formatMemoriesForPrompt(memories);

  try {
    const client = createAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      system: BRIEFING_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${profileLine}\n${memoryBlock ? `\n${memoryBlock}\n` : ""}\nTop emails from the last 3 days:\n${emailLines}\n\nWrite the user's morning briefing. Use the memories above to make it personal — e.g. reference specific people by name, recall ongoing commitments.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    cache.set(user.id, { text, createdAt: Date.now(), signature });
    return NextResponse.json({ briefing: text, cached: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Briefing failed" },
      { status: 500 }
    );
  }
}
