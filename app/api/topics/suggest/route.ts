import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAnthropicClient, extractJson } from "@/lib/claude";

const SUGGEST_SYSTEM = `You analyze a user's email inbox and suggest 5-8 personalized topic categories they could create as boards.

Output ONLY valid JSON in this shape:
{
  "topics": [
    {
      "name": "<short, 1-3 word topic name, Title Case, e.g. 'Engineering', 'Internships', 'Family'>",
      "description": "<one short sentence describing what emails belong here>",
      "color": "orange" | "blue" | "green" | "purple" | "rose" | "amber"
    }
  ]
}

Rules:
- Names must be specific to THIS user's inbox, not generic.
- Avoid generic names like "Newsletters" or "Promotions" — those are handled separately.
- Don't suggest "Receipts" — that's also handled.
- Focus on what they ACTUALLY care about based on their profile and what's in the emails.
- Maximum 8 suggestions.
- Use distinct colors per topic.`;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = await createServiceClient();

  const { data: existingTopics } = await service
    .from("user_topics")
    .select("name")
    .eq("user_id", user.id);

  const existingNames = new Set((existingTopics || []).map((t) => t.name.toLowerCase()));

  const { data: profile } = await service
    .from("user_profile")
    .select("bio, interests, priorities")
    .eq("user_id", user.id)
    .single();

  const { data: emails } = await service
    .from("emails")
    .select("from_name, from_email, subject, snippet, score")
    .eq("user_id", user.id)
    .gte("score", 30)
    .order("score", { ascending: false })
    .limit(40);

  const emailLines = (emails || []).map((e, i) =>
    `${i + 1}. ${e.from_name || e.from_email} — ${e.subject}${e.snippet ? `: ${e.snippet.slice(0, 80)}` : ""}`
  ).join("\n");

  const profileLine = profile
    ? `User bio: ${profile.bio || ""}\nInterests: ${(profile.interests || []).join(", ")}\nPriorities: ${(profile.priorities || []).join(", ")}`
    : "";

  try {
    const client = createAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: SUGGEST_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${profileLine}\n\nA sample of their inbox:\n${emailLines}\n\nSuggest topic boards for this user.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(extractJson(text));
    interface SuggestedTopic { name: string; description: string; color: string }
    const filtered = (parsed.topics || []).filter(
      (t: SuggestedTopic) => t.name && !existingNames.has(t.name.toLowerCase())
    );

    return NextResponse.json({ topics: filtered });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Suggest failed" },
      { status: 500 }
    );
  }
}
