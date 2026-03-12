import { AppShell } from "@/components/layout/AppShell";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <AppShell title="Create Your Account" subtitle="Join the Never In Doubt betting board">
      <RegisterForm />
    </AppShell>
  );
}
