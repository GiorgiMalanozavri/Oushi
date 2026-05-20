import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rankUnrankedEmails } from "@/lib/ranking";

interface CategoryPreference {
  label: string;
  description: string;
  preference: "yes" | "no" | "meh";
  example_from: string;
}

interface ImportantPerson {
  email: string;
  name: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    preferences,
    important_people,
  }: {
    preferences: CategoryPreference[];
    important_people?: ImportantPerson[];
  } = await request.json();

  const liked = preferences
    .filter((p) => p.preference === "yes")
    .map((p) => p.label);
  const disliked = preferences
    .filter((p) => p.preference === "no")
    .map((p) => p.label);

  const bio = `User cares about: ${liked.join(", ") || "not specified"}. Ignores: ${disliked.join(", ") || "nothing specified"}.`;

  const service = await createServiceClient();

  await service.from("user_profile").upsert(
    {
      user_id: user.id,
      bio,
      interests: liked,
      priorities: liked,
      noise: disliked,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  // Persist explicit "important people" as high-priority memory entries +
  // a sender_reputation bump so the ranker boosts their emails immediately.
  if (important_people && important_people.length > 0) {
    for (const p of important_people) {
      if (!p.email) continue;
      const email = p.email.toLowerCase();
      const name = p.name || email.split("@")[0];

      // Memory entry — pinned so it persists across context windows
      try {
        await service.from("memory_entries").upsert(
          {
            user_id: user.id,
            kind: "person",
            subject: name,
            content: `${name} (${email}) — marked important during onboarding. Their emails should always be surfaced.`,
            pinned: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,kind,subject" }
        );
      } catch {
        // Try insert if upsert fails (older schema)
        await service.from("memory_entries").insert({
          user_id: user.id,
          kind: "person",
          subject: name,
          content: `${name} (${email}) — marked important during onboarding.`,
        });
      }

      // Reputation bump
      await service.from("sender_reputation").upsert(
        {
          user_id: user.id,
          sender_email: email,
          reputation: 50, // strong positive — explicit user choice
          source: "onboarding_important",
          signal_count: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,sender_email" }
      );
    }
  }

  // Rank all emails with the new profile
  try {
    await rankUnrankedEmails(user.id);
  } catch {
    // Non-critical — they can re-rank from dashboard
  }

  return NextResponse.json({ success: true });
}
