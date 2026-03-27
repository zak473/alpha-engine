import { AppShell } from "@/components/layout/AppShell";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  return (
    <AppShell title="Profile & Settings" subtitle="Manage account access, identity details, and security" compact hideHero>
      <ProfileClient />
    </AppShell>
  );
}
