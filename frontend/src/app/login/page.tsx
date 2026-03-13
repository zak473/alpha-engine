import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <AppShell title="Account Access" subtitle="Sign in to the Never In Doubt betting board">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AppShell>
  );
}
