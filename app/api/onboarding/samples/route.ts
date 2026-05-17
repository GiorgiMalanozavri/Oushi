import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncRecentEmails } from "@/lib/gmail";
import { createAnthropicClient, extractJson } from "@/lib/claude";
import { createServiceClient } from "@/lib/supabase/server";

const CLUSTER_SYSTEM = `You categorize emails into distinct types for a user to review during onboarding.

Given a list of emails, group them into 5-8 distinct categories (e.g. "Promotions & deals", "University / school", "Work / team", "Newsletters", "Social notifications", "Receipts & billing", "Personal", "Job-related").

For each category, pick the single most representative email.

Output ONLY valid JSON:
{
  "categories": [
    {
      "label": "short category name",
      "description": "one sentence describing this type",
      "email_id": "the gmail_message_id of the best representative email",
      "example_subject": "the subject line",
      "example_from": "sender name"
    }
  ]
}`;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  // Check if we already have emails
  const { count } = await service
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Sync if we don't have emails yet
  if (!count || count < 10) {
    try {
      await syncRecentEmails(user.id, 50);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to sync emails" },
        { status: 500 }
      );
    }
  }

  // Get all synced emails
  const { data: emails } = await service
    .from("emails")
    .select("id, gmail_message_id, from_name, from_email, subject, snippet")
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .limit(50);

  if (!emails || emails.length === 0) {
    return NextResponse.json({ error: "No emails found" }, { status: 404 });
  }

  // Ask Claude to cluster them
  const emailList = emails
    .map(
      (e, i) =>
        `${i + 1}. ID: ${e.gmail_message_id} | From: ${e.from_name} <${e.from_email}> | Subject: ${e.subject} | Preview: ${e.snippet?.slice(0, 100)}`
    )
    .join("\n");

  try {
    const client = createAnthropicClient();
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          system: CLUSTER_SYSTEM,
          messages: [
            {
              role: "user",
              content: `Here are the user's recent emails. Categorize them into 5-8 types and pick one representative email per type:\n\n${emailList}`,
            },
          ],
        });
        break;
      } catch (retryErr) {
        if (attempt === 2) throw retryErr;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    const rawText =
      response!.content[0].type === "text" ? response!.content[0].text : "";
    const text = extractJson(rawText);
    const clusters = JSON.parse(text);

    // Enrich with full email data
    const enriched = clusters.categories.map(
      (cat: { label: string; description: string; email_id: string; example_subject: string; example_from: string }) => {
        const email = emails.find(
          (e) => e.gmail_message_id === cat.email_id
        );
        return {
          ...cat,
          email: email || {
            from_name: cat.example_from,
            from_email: "",
            subject: cat.example_subject,
            snippet: "",
          },
        };
      }
    );

    return NextResponse.json({ categories: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Clustering failed" },
      { status: 500 }
    );
  }
}
