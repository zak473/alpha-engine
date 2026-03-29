import { AppShell } from "@/components/layout/AppShell";
import { DeskPageIntro } from "@/components/layout/DeskPageIntro";
import { TipstersView } from "./TipstersView";
import { getTipsters } from "@/lib/api";

export const revalidate = 60;

export const metadata = {
  title: "Tipsters",
};

export default async function TipstersPage() {
  const tipsters = await getTipsters().catch(() => []);

  const profileCount = tipsters.length;
  const hotStreakCount = tipsters.filter((t) => {
    const results = t.recent_results ?? [];
    const last3 = results.slice(-3);
    return last3.length === 3 && last3.every((r: string) => r === "W");
  }).length;
  const totalProfit = tipsters.reduce((sum, t) => sum + (t.profit_loss ?? 0), 0);
  const profitStr = totalProfit >= 0 ? `+${totalProfit.toFixed(1)}u` : `${totalProfit.toFixed(1)}u`;

  return (
    <AppShell title="Tipsters" subtitle="Follow credible tipsters, compare form quickly, and tail with more confidence" compact hideHero>
      <div className="space-y-4">
        <DeskPageIntro
          eyebrow="Community leaderboard"
          title="Tipsters"
          subtitle="Ranked form, recent results, and quick comparison blocks so you can decide who is worth following faster."
          metrics={[
            { label: "Verified", value: `${profileCount} profiles`, tone: "accent" },
            { label: "Hot streaks", value: `${hotStreakCount} running`, tone: "positive" },
            { label: "Tracked profit", value: profitStr, tone: totalProfit >= 0 ? "positive" : "warning" },
          ]}
          primaryCta={{ label: "Browse top boards", href: "/predictions" }}
        />
        <TipstersView initialTipsters={tipsters} />
      </div>
    </AppShell>
  );
}
