import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { confirm } = await request.json().catch(() => ({}));
  if (confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Confirmation required: send { confirm: "DELETE" }' },
      { status: 400 }
    );
  }

  const service = await createServiceClient();

  // Delete app data first (RLS-enabled tables — service client bypasses)
  // Order matters: child rows before parents in case of FK constraints.
  await service.from("feedback").delete().eq("user_id", user.id);
  await service.from("emails").delete().eq("user_id", user.id);
  await service.from("user_mutes").delete().eq("user_id", user.id);
  await service.from("user_topics").delete().eq("user_id", user.id);
  await service.from("user_sync_state").delete().eq("user_id", user.id);
  await service.from("user_profile").delete().eq("user_id", user.id);
  await service.from("user_tokens").delete().eq("user_id", user.id);

  // Finally, delete the auth user. This also signs them out everywhere.
  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json(
      { error: `Account data deleted but couldn't remove auth user: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
