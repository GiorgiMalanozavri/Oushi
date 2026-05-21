import { NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/gmail";
import { createServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Gmail OAuth callback.
 *
 * Robust against the "unverified app" path on Google — when a user clicks
 * "Advanced → Go to oushi (unsafe)" the flow has a few quirks that can
 * make the callback fail silently (no refresh_token returned, expired
 * code on retry, etc.). We surface each failure with a specific error
 * code via `?gmailError=...` so the dashboard can show the user what
 * went wrong instead of bouncing them back to a blank Connect screen.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  // Google returned an error (user cancelled, app blocked, etc.)
  if (oauthError) {
    console.error("[gmail/callback] Google returned error:", oauthError);
    return NextResponse.redirect(
      `${origin}/dashboard?gmailError=${encodeURIComponent(oauthError)}`
    );
  }

  if (!code || !state) {
    console.error(
      "[gmail/callback] missing code or state",
      { hasCode: !!code, hasState: !!state }
    );
    return NextResponse.redirect(
      `${origin}/dashboard?gmailError=missing_code`
    );
  }

  // Exchange the code for tokens. This is the most common failure point —
  // expired/reused codes throw here.
  let tokens;
  try {
    const oauth2Client = getOAuth2Client();
    const result = await oauth2Client.getToken(code);
    tokens = result.tokens;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gmail/callback] getToken failed:", msg);
    return NextResponse.redirect(
      `${origin}/dashboard?gmailError=${encodeURIComponent(
        "token_exchange:" + msg.slice(0, 120)
      )}`
    );
  }

  // Refresh token is REQUIRED — without it we can't make API calls after
  // the access token expires. Google omits this when re-consenting if the
  // user has previously granted access and prompt=consent didn't reset.
  if (!tokens.refresh_token) {
    console.error(
      "[gmail/callback] no refresh_token in Google response — user likely needs to revoke access at myaccount.google.com/permissions and try again"
    );
    return NextResponse.redirect(
      `${origin}/dashboard?gmailError=no_refresh_token`
    );
  }

  // Encrypt + store. Encryption errors usually mean OAUTH_ENCRYPTION_KEY
  // isn't set or is the wrong length.
  try {
    const supabase = await createServiceClient();
    const { error: upsertError } = await supabase.from("user_tokens").upsert(
      {
        user_id: state,
        refresh_token: encrypt(tokens.refresh_token),
        access_token: tokens.access_token ? encrypt(tokens.access_token) : null,
        expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (upsertError) {
      console.error("[gmail/callback] token upsert failed:", upsertError.message);
      return NextResponse.redirect(
        `${origin}/dashboard?gmailError=${encodeURIComponent(
          "storage:" + upsertError.message.slice(0, 120)
        )}`
      );
    }

    // Check if user has a profile — if not, send to onboarding.
    const { data: profile } = await supabase
      .from("user_profile")
      .select("id")
      .eq("user_id", state)
      .single();

    if (!profile) {
      return NextResponse.redirect(`${origin}/onboarding`);
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gmail/callback] storage/redirect failed:", msg);
    return NextResponse.redirect(
      `${origin}/dashboard?gmailError=${encodeURIComponent(
        "storage_exception:" + msg.slice(0, 120)
      )}`
    );
  }
}
