import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/cs/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/cs2/player-accuracy?player_id=123
export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get("player_id");
  if (!playerId) return NextResponse.json({ data: [] });

  try {
    const res = await fetch(
      `${BDL_BASE}/player_accuracy_stats?player_id=${playerId}`,
      { headers: bdlHeaders(), cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
