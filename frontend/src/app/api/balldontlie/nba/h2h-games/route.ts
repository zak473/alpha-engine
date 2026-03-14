import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/nba/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/nba/h2h-games?team1_id=14&team2_id=2
export async function GET(req: NextRequest) {
  const team1Id = req.nextUrl.searchParams.get("team1_id");
  const team2Id = req.nextUrl.searchParams.get("team2_id");
  if (!team1Id || !team2Id) return NextResponse.json({ data: [] });

  // Fetch recent seasons — seasons 2022, 2023, 2024
  const seasons = ["2022", "2023", "2024"];
  const qs = new URLSearchParams();
  qs.append("team_ids[]", team1Id);
  qs.append("team_ids[]", team2Id);
  seasons.forEach((s) => qs.append("seasons[]", s));
  qs.set("per_page", "50");

  try {
    const res = await fetch(`${BDL_BASE}/games?${qs}`, {
      headers: bdlHeaders(),
      next: { revalidate: 600 }, // h2h history — refresh every 10 min
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    const json = await res.json();

    // Filter to only games where BOTH teams played each other
    const t1 = Number(team1Id);
    const t2 = Number(team2Id);
    type GameRaw = { home_team: { id: number }; visitor_team: { id: number } };
    const h2h = (json.data ?? []).filter((g: GameRaw) => {
      const ids = [g.home_team?.id, g.visitor_team?.id];
      return ids.includes(t1) && ids.includes(t2);
    });

    return NextResponse.json({ data: h2h });
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
