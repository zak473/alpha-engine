import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.sportsgameodds.com/v2";

/**
 * GET /api/odds?league_id=NBA&live=0
 *
 * Proxies SportsGameOdds API — charged per event returned.
 * Pre-match: 1-hour server cache. Live: no cache.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const leagueID = sp.get("league_id");
  const live = sp.get("live") === "1";
  const apiKey = process.env.SGO_API_KEY ?? "";

  if (!leagueID) {
    return NextResponse.json({ error: "league_id required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    apiKey,
    leagueID,
    oddsAvailable: "true",
    ...(live ? { live: "true" } : {}),
  });

  const url = `${BASE}/events/?${params}`;

  try {
    const res = await fetch(url, {
      ...(live ? { cache: "no-store" } : { next: { revalidate: 3600 } }),
    });

    if (!res.ok) {
      return NextResponse.json({ events: [] }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ events: data.data ?? [] });
  } catch {
    return NextResponse.json({ events: [] }, { status: 500 });
  }
}
