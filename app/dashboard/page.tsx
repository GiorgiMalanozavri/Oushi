import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";
import { classifyAll, bucketize, type EmailRow } from "@/lib/outstanding";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ firstSync?: string; gmailError?: string }>;
}) {
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

  if (!profile) redirect("/onboarding");

  const { data: tokens } = await supabase
    .from("user_tokens")
    .select("id")
    .eq("user_id", user.id)
    .single();

  const { data: emails } = await supabase
    .from("emails")
    .select("*")
    .eq("user_id", user.id)
    .gte(
      "received_at",
      new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    )
    .order("score", { ascending: false, nullsFirst: false });

  const { data: feedbackCount } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: syncState } = await supabase
    .from("user_sync_state")
    .select("last_synced_at")
    .eq("user_id", user.id)
    .single();

  const { data: topics } = await supabase
    .from("user_topics")
    .select("*")
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  const params = await searchParams;
  const isFirstSync = params.firstSync === "true";
  const gmailError = params.gmailError || null;

  const classified = classifyAll((emails || []) as EmailRow[]);
  const buckets = bucketize(classified);

  return (
    <DashboardClient
      buckets={{
        urgent: buckets.urgent,
        awaiting_reply: buckets.awaiting_reply,
        following_up: buckets.following_up,
        reference: buckets.reference,
        fresh: buckets.fresh,
        background: buckets.background,
        handled: buckets.handled,
      }}
      allEmails={classified}
      topics={topics || []}
      totalEmails={classified.length}
      hasGmail={!!tokens}
      isFirstSync={isFirstSync}
      gmailError={gmailError}
      userEmail={user.email || ""}
      userAvatar={(user.user_metadata?.avatar_url as string | undefined) || null}
      userName={(user.user_metadata?.full_name as string | undefined) || (user.user_metadata?.name as string | undefined) || null}
      profile={{
        bio: profile.bio || "",
        interests: profile.interests || [],
        priorities: profile.priorities || [],
        noise: profile.noise || [],
      }}
      feedbackCount={feedbackCount?.length ?? 0}
      lastSyncedAt={syncState?.last_synced_at || null}
    />
  );
}
