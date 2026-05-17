import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profile")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const { data: mutes } = await supabase
    .from("user_mutes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: syncState } = await supabase
    .from("user_sync_state")
    .select("digest_enabled, digest_hour_utc, last_digest_sent_at, last_synced_at")
    .eq("user_id", user.id)
    .single();

  const { data: gmailTokens } = await supabase
    .from("user_tokens")
    .select("id, created_at, updated_at")
    .eq("user_id", user.id)
    .single();

  const now = new Date().toISOString();
  const { data: memories } = await supabase
    .from("memory_entries")
    .select("*")
    .eq("user_id", user.id)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  return (
    <SettingsClient
      profile={profile}
      mutes={mutes || []}
      userEmail={user.email || ""}
      syncState={syncState || null}
      hasGmail={!!gmailTokens}
      memories={memories || []}
    />
  );
}
