import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/nba/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get("game_id");
  if (!gameId) {
    return NextResponse.json({ data: [] }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${BDL_BASE}/plays?game_ids[]=${gameId}&per_page=100`,
      { headers: bdlHeaders(), next: { revalidate: 60 } }
    );
    if (!res.ok) {
      return NextResponse.json({ data: [] }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' }
    });
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
