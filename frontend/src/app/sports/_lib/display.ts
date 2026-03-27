import type { SportSlug } from "@/lib/api";
import type { SGOEvent } from "@/lib/sgo";
import { LEAGUE_LABELS } from "@/lib/sgo";

export const VALID_SPORTS: SportSlug[] = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"];

export const SPORT_META: Record<SportSlug, { label: string; icon: string; eyebrow: string }> = {
  soccer: { label: "Soccer", icon: "⚽", eyebrow: "Football trading desk" },
  tennis: { label: "Tennis", icon: "🎾", eyebrow: "Match trading desk" },
  esports: { label: "Esports", icon: "🎮", eyebrow: "Esports trading desk" },
  basketball: { label: "Basketball", icon: "🏀", eyebrow: "Court intelligence desk" },
  baseball: { label: "Baseball", icon: "⚾", eyebrow: "Diamond intelligence desk" },
  hockey: { label: "Hockey", icon: "🏒", eyebrow: "Ice intelligence desk" },
};

function eventMode(event: SGOEvent): string {
  if (event.status?.live) return "Live";
  if (event.status?.ended || event.status?.completed) return "Final";
  if (event.status?.cancelled) return "Cancelled";
  return "Upcoming";
}

function leagueLabel(leagueId: string): string {
  return LEAGUE_LABELS[leagueId] ?? leagueId;
}

export function getSportMeta(sport: SportSlug) {
  return SPORT_META[sport];
}

export function getSportHubShell(sport: SportSlug) {
  const meta = SPORT_META[sport];

  const perSportStats: Record<SportSlug, { label: string; value: string; hint: string; tone: "accent" | "positive" | "warning" | "neutral" }[]> = {
    soccer: [
      { label: "Leagues", value: "8", hint: "Domestic and European boards", tone: "neutral" },
      { label: "Best edge", value: "+5.7%", hint: "Top market gap on current slate", tone: "positive" },
      { label: "High conviction", value: "70%+", hint: "Confidence band for lead spots", tone: "accent" },
    ],
    tennis: [
      { label: "Tours", value: "ATP/WTA", hint: "Split reads across both tours", tone: "neutral" },
      { label: "Surface reads", value: "Live", hint: "Form and court-specific weighting", tone: "accent" },
      { label: "Best edge", value: "+4.9%", hint: "Current board leader", tone: "positive" },
    ],
    esports: [
      { label: "Coverage", value: "CS2+", hint: "Expanding match intelligence stack", tone: "accent" },
      { label: "Map reads", value: "Deep", hint: "Map-level momentum and player form", tone: "neutral" },
      { label: "Live sync", value: "30s", hint: "Frequent board refresh cadence", tone: "positive" },
    ],
    basketball: [
      { label: "League", value: "NBA", hint: "Primary court intelligence board", tone: "neutral" },
      { label: "Model focus", value: "Pace + form", hint: "Price and possession weighted", tone: "accent" },
      { label: "Best edge", value: "+6.1%", hint: "Top spread or ML gap", tone: "positive" },
    ],
    baseball: [
      { label: "League", value: "MLB", hint: "Daily card with matchup reads", tone: "neutral" },
      { label: "Model focus", value: "Pitching", hint: "Starter strength and run environment", tone: "accent" },
      { label: "Best edge", value: "+4.8%", hint: "Current best value spot", tone: "positive" },
    ],
    hockey: [
      { label: "League", value: "NHL", hint: "Full slate and in-play reads", tone: "neutral" },
      { label: "Model focus", value: "Shot quality", hint: "Pace, goaltending, and special teams", tone: "accent" },
      { label: "Best edge", value: "+5.2%", hint: "Strongest current discrepancy", tone: "positive" },
    ],
  };

  return {
    title: `${meta.icon} ${meta.label} Hub`,
    subtitle: "Fixtures, live prices, and in-play reads",
    eyebrow: meta.eyebrow,
    stats: perSportStats[sport],
  };
}

export function getSportDetailShell(sport: SportSlug, event: SGOEvent) {
  const meta = SPORT_META[sport];
  const homeName = event.teams.home.names.long;
  const awayName = event.teams.away.names.long;
  const mode = eventMode(event);
  const kickoff = event.status?.startsAt
    ? new Date(event.status.startsAt).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "TBD";

  return {
    title: `${homeName} vs ${awayName}`,
    subtitle: leagueLabel(event.leagueID),
    eyebrow: `${meta.label} match center`,
    stats: [
      { label: "Status", value: mode, hint: event.status?.displayLong || `${meta.label} board status`, tone: mode === "Live" ? "positive" : mode === "Final" ? "neutral" : "accent" },
      { label: "League", value: leagueLabel(event.leagueID), hint: `${meta.label} tracked market`, tone: "neutral" },
      { label: "Kickoff", value: kickoff, hint: "Local board scheduling view", tone: "accent" },
    ],
  };
}
