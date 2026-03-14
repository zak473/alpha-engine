import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/cs/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/cs2/h2h?team1_id=1&team2_id=2
export async function GET(req: NextRequest) {
  const team1Id = req.nextUrl.searchParams.get("team1_id");
  const team2Id = req.nextUrl.searchParams.get("team2_id");
  if (!team1Id || !team2Id) return NextResponse.json({ data: [] });

  const qs = new URLSearchParams();
  qs.append("team_ids[]", team1Id);
  qs.append("team_ids[]", team2Id);
  qs.set("per_page", "50");

  try {
    const res = await fetch(`${BDL_BASE}/matches?${qs}`, {
      headers: bdlHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    const json = await res.json();

    // Filter to only matches where BOTH teams are present
    const t1 = Number(team1Id);
    const t2 = Number(team2Id);
    type MatchRaw = {
      team1?: { id: number };
      team2?: { id: number };
      opponents?: Array<{ opponent: { id: number } }>;
    };
    const h2h = (json.data ?? []).filter((m: MatchRaw) => {
      const ids: number[] = [];
      if (m.team1?.id != null) ids.push(m.team1.id);
      if (m.team2?.id != null) ids.push(m.team2.id);
      m.opponents?.forEach((o) => ids.push(o.opponent.id));
      return ids.includes(t1) && ids.includes(t2);
    });

    return NextResponse.json({ data: h2h });
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
