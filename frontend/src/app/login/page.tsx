import { AppShell } from "@/components/layout/AppShell";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <AppShell title="Login" subtitle="Sign in to Alpha Engine">
      <LoginForm />
    </AppShell>
  );
}
