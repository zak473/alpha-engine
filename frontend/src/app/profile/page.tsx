import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const token = cookies().get("ae_token")?.value;
  if (!token) redirect("/login?next=/profile");

  return (
    <AppShell title="Profile & Settings" subtitle="Manage your account details" requireAuth>
      <ProfileClient />
    </AppShell>
  );
}
