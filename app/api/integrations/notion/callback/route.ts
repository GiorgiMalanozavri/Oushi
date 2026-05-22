import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exchangeCodeForToken } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const settingsUrl = new URL(
    "/settings?section=integrations",
    process.env.NEXT_PUBLIC_APP_URL || url.origin
  );

  if (error) {
    settingsUrl.searchParams.set("notion_error", error);
    return NextResponse.redirect(settingsUrl);
  }
  if (!code || !state) {
    settingsUrl.searchParams.set("notion_error", "missing_code");
    return NextResponse.redirect(settingsUrl);
  }

  const cookieState = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith("oushi_notion_state="))
    ?.split("=")[1];

  if (!cookieState || cookieState !== state) {
    settingsUrl.searchParams.set("notion_error", "state_mismatch");
    return NextResponse.redirect(settingsUrl);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    settingsUrl.searchParams.set("notion_error", "not_signed_in");
    return NextResponse.redirect(settingsUrl);
  }

  const result = await exchangeCodeForToken(code);
  if (result.error || !result.access_token) {
    settingsUrl.searchParams.set(
      "notion_error",
      result.error || "exchange_failed"
    );
    return NextResponse.redirect(settingsUrl);
  }

  const service = await createServiceClient();
  await service.from("user_integrations").upsert(
    {
      user_id: user.id,
      notion_workspace_id: result.workspace_id || null,
      notion_workspace_name: result.workspace_name || null,
      notion_access_token: result.access_token,
      notion_bot_id: result.bot_id || null,
      // Don't auto-enable — the user still needs to pick a page (for
      // saved threads) and/or a database (for commitments mirror).
      notion_enabled: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  settingsUrl.searchParams.set("notion_connected", "1");
  const res = NextResponse.redirect(settingsUrl);
  res.cookies.set("oushi_notion_state", "", { maxAge: 0, path: "/" });
  return res;
}
