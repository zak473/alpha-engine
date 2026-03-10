import { AppShell } from "@/components/layout/AppShell";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return (
    <AppShell title="Profile & Settings" subtitle="Manage your account details">
      <ProfileClient />
    </AppShell>
  );
}
