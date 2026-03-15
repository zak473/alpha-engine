import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/nba/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/nba/team-games?team_id=14&season=2024
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("team_id");
  const season = req.nextUrl.searchParams.get("season") ?? "2024";
  if (!teamId) return NextResponse.json({ data: [] });

  const qs = new URLSearchParams();
  qs.append("team_ids[]", teamId);
  qs.append("seasons[]", season);
  qs.set("per_page", "30");

  try {
    const res = await fetch(`${BDL_BASE}/games?${qs}`, {
      headers: bdlHeaders(),
      next: { revalidate: 300 }, // recent team games — refresh every 5 min
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
