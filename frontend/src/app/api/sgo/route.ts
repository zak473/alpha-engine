import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.sportsgameodds.com/v2";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const leagueID = sp.get("leagueID");
  const live = sp.get("live") === "1";
  const apiKey = process.env.SGO_API_KEY ?? "";

  if (!leagueID) return NextResponse.json({ error: "leagueID required" }, { status: 400 });

  const params = new URLSearchParams({
    apiKey,
    leagueID,
    oddsAvailable: "true",
    ...(live ? { live: "true" } : {}),
  });

  try {
    const res = await fetch(`${BASE}/events/?${params}`, {
      next: { revalidate: 60 }, // 1-min cache
    });
    if (!res.ok) return NextResponse.json({ events: [] }, { status: res.status });
    const data = await res.json();
    return NextResponse.json({ events: data.data ?? [] });
  } catch {
    return NextResponse.json({ events: [] }, { status: 500 });
  }
}
