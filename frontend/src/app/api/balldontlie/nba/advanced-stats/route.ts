import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/nba/v2";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/nba/advanced-stats?game_id=123
export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get("game_id");
  if (!gameId) return NextResponse.json({ data: [] });

  try {
    const res = await fetch(
      `${BDL_BASE}/stats/advanced?game_ids[]=${gameId}&per_page=30`,
      { headers: bdlHeaders(), next: { revalidate: 300 } } // advanced stats — refresh every 5 min
    );
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
