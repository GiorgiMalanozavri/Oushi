import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedClient, parseGmailMessage } from "@/lib/gmail";

export const maxDuration = 120;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data: emails } = await service
    .from("emails")
    .select("id, gmail_message_id")
    .eq("user_id", user.id)
    .gte("received_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order("received_at", { ascending: false })
    .limit(120);

  if (!emails || emails.length === 0) {
    return NextResponse.json({ refreshed: 0 });
  }

  const oauth2Client = await getAuthenticatedClient(user.id);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  let refreshed = 0;
  const batchSize = 10;

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((e) =>
        gmail.users.messages.get({ userId: "me", id: e.gmail_message_id, format: "full" })
      )
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const row = batch[j];
      if (r.status !== "fulfilled") continue;
      const parsed = parseGmailMessage(r.value.data);
      await service
        .from("emails")
        .update({
          body_preview: parsed.body_preview,
          snippet: parsed.snippet,
        })
        .eq("id", row.id)
        .eq("user_id", user.id);
      refreshed++;
    }
  }

  return NextResponse.json({ refreshed });
}
