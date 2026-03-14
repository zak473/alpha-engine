import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get("game_id");
  const date = req.nextUrl.searchParams.get("date");

  let url: string;
  if (gameId) {
    url = `${BDL_BASE}/nba/box_scores?game_ids[]=${gameId}`;
  } else if (date) {
    url = `${BDL_BASE}/nba/box_scores?date=${date}`;
  } else {
    return NextResponse.json({ error: "game_id or date required" }, { status: 400 });
  }

  try {
    const res = await fetch(url, { headers: bdlHeaders(), cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ data: [] }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
