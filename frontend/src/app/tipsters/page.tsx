import { AppShell } from "@/components/layout/AppShell";
import { TipstersView } from "./TipstersView";

export const metadata = {
  title: "Tipsters",
};

export default function TipstersPage() {
  return (
    <AppShell title="Tipsters" subtitle="Follow community tipsters and tail their picks">
      <TipstersView />
    </AppShell>
  );
}
