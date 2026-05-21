import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check if user already has a profile — skip to dashboard
  const { data: profile } = await supabase
    .from("user_profile")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (profile) redirect("/dashboard");

  // Check if Gmail is connected — pass as a prop so the form skips the
  // "connect" phase and jumps straight to loading samples. Without this,
  // a user with tokens but no profile would loop through the OAuth flow.
  const { data: tokens } = await supabase
    .from("user_tokens")
    .select("id")
    .eq("user_id", user.id)
    .single();

  return <OnboardingForm hasGmailTokens={!!tokens} />;
}
