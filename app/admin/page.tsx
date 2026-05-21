import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { AdminDashboard } from "./admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email || null)) redirect("/dashboard");

  return <AdminDashboard adminEmail={user.email || ""} />;
}
