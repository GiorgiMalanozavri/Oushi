import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const service = await createServiceClient();

  const [profile, mutes, topics, emails, feedback, syncState] = await Promise.all([
    service.from("user_profile").select("*").eq("user_id", user.id).single(),
    service.from("user_mutes").select("*").eq("user_id", user.id),
    service.from("user_topics").select("*").eq("user_id", user.id),
    service.from("emails").select("*").eq("user_id", user.id),
    service.from("feedback").select("*").eq("user_id", user.id),
    service.from("user_sync_state").select("*").eq("user_id", user.id).single(),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    },
    profile: profile.data || null,
    sync_state: syncState.data || null,
    mutes: mutes.data || [],
    topics: topics.data || [],
    feedback: feedback.data || [],
    emails: emails.data || [],
  };

  const filename = `oushi-export-${new Date().toISOString().split("T")[0]}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
