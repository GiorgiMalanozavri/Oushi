import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, isNotionConfigured } from "@/lib/notion";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isNotionConfigured()) {
    return NextResponse.json(
      {
        error:
          "Notion isn't configured on this server. Set NOTION_CLIENT_ID + NOTION_CLIENT_SECRET.",
      },
      { status: 503 }
    );
  }

  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set("oushi_notion_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });
  return res;
}
