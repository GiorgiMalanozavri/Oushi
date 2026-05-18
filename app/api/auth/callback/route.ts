import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const errorParam = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  // Always redirect to canonical app URL (not request.url, which on Vercel
  // may be an internal deployment URL like *.vercel.app).
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/$/, "");

  console.log("[auth/callback]", {
    hasCode: !!code,
    next,
    appUrl,
    requestOrigin: requestUrl.origin,
    error: errorParam,
    errorDescription,
  });

  // OAuth provider returned an error directly (user cancelled, etc.)
  if (errorParam) {
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(errorParam)}`);
  }

  // No code = either user cancelled or the redirect URL isn't allowlisted in Supabase
  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=no_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent("auth_failed:" + error.message)}`
    );
  }

  console.log("[auth/callback] success, user:", data.session?.user?.email);
  return NextResponse.redirect(`${appUrl}${next}`);
}
