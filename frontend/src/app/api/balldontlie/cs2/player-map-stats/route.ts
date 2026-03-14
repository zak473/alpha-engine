import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/cs/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/cs2/player-map-stats?match_map_id=123
export async function GET(req: NextRequest) {
  const matchMapId = req.nextUrl.searchParams.get("match_map_id");
  if (!matchMapId) {
    return NextResponse.json({ data: [] });
  }

  const qs = new URLSearchParams();
  qs.set("match_map_id", matchMapId);
  qs.set("per_page", "100");

  try {
    const res = await fetch(`${BDL_BASE}/player_match_map_stats?${qs}`, {
      headers: bdlHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
