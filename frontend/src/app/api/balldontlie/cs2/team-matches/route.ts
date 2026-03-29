import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/cs/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/cs2/team-matches?team_id=123
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("team_id");
  if (!teamId) return NextResponse.json({ data: [] });

  const qs = new URLSearchParams();
  qs.append("team_ids[]", teamId);
  qs.set("per_page", "50");

  try {
    const res = await fetch(`${BDL_BASE}/matches?${qs}`, {
      headers: bdlHeaders(),
      next: { revalidate: 300 },
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    return NextResponse.json(await res.json(), {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' }
    });
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
