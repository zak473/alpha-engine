import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/nba/standings?season=2024
export async function GET(req: NextRequest) {
  const season = req.nextUrl.searchParams.get("season") ?? "2024";

  try {
    const res = await fetch(`${BDL_BASE}/standings?season=${season}&per_page=30`, {
      headers: bdlHeaders(),
      next: { revalidate: 300 }, // standings don't change mid-game
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
