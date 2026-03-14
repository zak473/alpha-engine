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
      `${BDL_BASE}/plays?game_id=${gameId}&per_page=50`,
      { headers: bdlHeaders(), cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json({ data: [] }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
