import { AppShell } from "@/components/layout/AppShell";
import { DeskPageIntro } from "@/components/layout/DeskPageIntro";
import { AdvisorClient } from "./AdvisorClient";

export const dynamic = "force-dynamic";

export default function AdvisorPage() {
  return (
    <AppShell title="Advisor" subtitle="Sports intelligence, powered by Claude" compact hideHero>
      <div className="space-y-4">
        <DeskPageIntro
          eyebrow="Research copilot"
          title="Advisor"
          subtitle="Sports intelligence, powered by Claude"
          metrics={[
            { label: "Mode", value: "Multi-sport", tone: "accent" },
            { label: "Workflow", value: "1-click", tone: "neutral" },
            { label: "Context", value: "Persistent", tone: "positive" },
          ]}
          primaryCta={{ label: "Ask the advisor", href: "/advisor" }}
          secondaryCta={{ label: "Open predictions", href: "/predictions" }}
        />
        <AdvisorClient />
      </div>
    </AppShell>
  );
}
