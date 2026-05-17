import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rankUnrankedEmails } from "@/lib/ranking";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ranked = await rankUnrankedEmails(user.id);
    return NextResponse.json({ ranked });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ranking failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
