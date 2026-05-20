import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { encrypt, isEncrypted } from "@/lib/crypto";

/**
 * One-time migration: encrypt all existing plaintext refresh_token /
 * access_token rows in user_tokens. Safe to run repeatedly — already-
 * encrypted rows are skipped.
 *
 * Protected with CRON_SECRET so it's not user-accessible.
 *
 * Run with:
 *   curl -X POST -H "Authorization: Bearer <CRON_SECRET>" \
 *     https://www.oushi.app/api/admin/encrypt-tokens
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data: rows, error } = await service
    .from("user_tokens")
    .select("user_id, refresh_token, access_token");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let encrypted = 0;
  let alreadyOk = 0;
  let failed = 0;

  for (const row of rows || []) {
    const refreshIsEncrypted = isEncrypted(row.refresh_token);
    const accessIsEncrypted = row.access_token ? isEncrypted(row.access_token) : true;
    if (refreshIsEncrypted && accessIsEncrypted) {
      alreadyOk++;
      continue;
    }
    try {
      const { error: updErr } = await service
        .from("user_tokens")
        .update({
          refresh_token: refreshIsEncrypted ? row.refresh_token : encrypt(row.refresh_token),
          access_token: row.access_token
            ? accessIsEncrypted
              ? row.access_token
              : encrypt(row.access_token)
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", row.user_id);
      if (updErr) {
        failed++;
        console.error("[admin/encrypt-tokens]", row.user_id, updErr.message);
      } else {
        encrypted++;
      }
    } catch (e) {
      failed++;
      console.error("[admin/encrypt-tokens]", row.user_id, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    total: rows?.length || 0,
    encrypted,
    already_encrypted: alreadyOk,
    failed,
  });
}
