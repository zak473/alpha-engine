import { AppShell } from "@/components/layout/AppShell";
import { DesignSystemClient } from "./DesignSystemClient";

export default function DesignSystemPage() {
  return (
    <AppShell title="Design System" subtitle="Quant Terminal token reference">
      <DesignSystemClient />
    </AppShell>
  );
}
