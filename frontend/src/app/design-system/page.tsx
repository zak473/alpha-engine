import { AppShell } from "@/components/layout/AppShell";
import { DesignSystemClient } from "./DesignSystemClient";

export default function DesignSystemPage() {
  return (
    <AppShell title="Brand System" subtitle="Never In Doubt colours, cards, and UI language">
      <DesignSystemClient />
    </AppShell>
  );
}
