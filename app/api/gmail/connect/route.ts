import { NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If the user isn't signed in, bounce them to login instead of returning
  // JSON — they came here from a "Connect Gmail" button, not an API call.
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    // "consent" forces Google to return a refresh_token even if the user
    // already granted access — required for offline use.
    prompt: "consent",
    // Don't merge in previously-granted scopes — that's the scenario
    // where Google sometimes omits the refresh_token. Asking for the
    // full set each time guarantees we get one.
    include_granted_scopes: false,
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state: user.id,
  });

  return NextResponse.redirect(url);
}
