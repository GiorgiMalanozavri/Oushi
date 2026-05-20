import { NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/gmail";
import { createServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/dashboard?error=gmail_auth_failed`);
  }

  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  const supabase = await createServiceClient();
  await supabase.from("user_tokens").upsert(
    {
      user_id: state,
      refresh_token: encrypt(tokens.refresh_token!),
      access_token: tokens.access_token ? encrypt(tokens.access_token) : null,
      expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  // Check if user has a profile — if not, send to onboarding
  const { data: profile } = await supabase
    .from("user_profile")
    .select("id")
    .eq("user_id", state)
    .single();

  if (!profile) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
