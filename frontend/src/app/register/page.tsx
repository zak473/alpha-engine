import { AppShell } from "@/components/layout/AppShell";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <AppShell title="Register" subtitle="Create your Alpha Engine account">
      <RegisterForm />
    </AppShell>
  );
}
