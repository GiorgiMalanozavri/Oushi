import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rankUnrankedEmails } from "@/lib/ranking";

interface CategoryPreference {
  label: string;
  description: string;
  preference: "yes" | "no" | "meh";
  example_from: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { preferences }: { preferences: CategoryPreference[] } =
    await request.json();

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

  // Rank all emails with the new profile
  try {
    await rankUnrankedEmails(user.id);
  } catch {
    // Non-critical — they can re-rank from dashboard
  }

  return NextResponse.json({ success: true });
}
