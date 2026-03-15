import { NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/nba/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

function bdlStatusToInternal(status: string): string {
  if (status === "Final") return "finished";
  if (/^\d{4}-\d{2}-\d{2}/.test(status)) return "scheduled";
  return "live";
}

/**
 * GET /api/balldontlie/nba/sport-matches
 * Returns today's NBA games in SportMatchListItem format for the sports hub.
 */
export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  try {
    const res = await fetch(
      `${BDL_BASE}/games?dates[]=${today}&per_page=100`,
      { headers: bdlHeaders(), cache: "no-store" }
    );

    if (!res.ok) {
      return NextResponse.json({ items: [] }, { status: res.status });
    }

    const json = await res.json();
    const games: any[] = json.data ?? [];

    const items = games.map((g) => ({
      id: String(g.id),
      league: "NBA",
      league_logo: null,
      season: String(g.season),
      kickoff_utc: g.datetime ?? g.date,
      status: bdlStatusToInternal(g.status),
      home_id: String(g.home_team.id),
      home_name: g.home_team.full_name,
      home_logo: null,
      away_id: String(g.visitor_team.id),
      away_name: g.visitor_team.full_name,
      away_logo: null,
      home_score: g.home_team_score ?? null,
      away_score: g.visitor_team_score ?? null,
      outcome: g.status === "Final"
        ? g.home_team_score > g.visitor_team_score ? "home" : "away"
        : null,
      elo_home: null,
      elo_away: null,
      elo_diff: null,
      p_home: null,
      p_draw: null,
      p_away: null,
      confidence: null,
      live_clock: bdlStatusToInternal(g.status) === "live" ? g.status : null,
      current_period: g.period ?? null,
      odds_home: null,
      odds_away: null,
      odds_draw: null,
    }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
