import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/nba/v2";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/nba/odds?game_id=123
export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get("game_id");
  if (!gameId) return NextResponse.json({ data: [] });

  try {
    const res = await fetch(`${BDL_BASE}/odds?game_ids[]=${gameId}&per_page=50`, {
      headers: bdlHeaders(),
      next: { revalidate: 60 }, // odds — refresh every minute
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
