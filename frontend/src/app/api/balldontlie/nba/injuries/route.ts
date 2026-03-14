import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/nba/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/nba/injuries?team_ids=1,2
export async function GET(req: NextRequest) {
  const teamIdsParam = req.nextUrl.searchParams.get("team_ids");
  if (!teamIdsParam) return NextResponse.json({ data: [] });

  const ids = teamIdsParam.split(",").filter(Boolean);
  const qs = new URLSearchParams();
  ids.forEach((id) => qs.append("team_ids[]", id));
  qs.set("per_page", "50");

  try {
    const res = await fetch(`${BDL_BASE}/player_injuries?${qs}`, {
      headers: bdlHeaders(),
      next: { revalidate: 120 }, // injuries — refresh every 2 min
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
