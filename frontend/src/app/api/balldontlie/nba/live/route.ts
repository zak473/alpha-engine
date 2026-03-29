import { NextResponse } from "next/server";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

async function tryFetch(url: string): Promise<{ ok: boolean; data: any[] }> {
  try {
    const res = await fetch(url, { headers: bdlHeaders(), next: { revalidate: 60 } });
    if (!res.ok) return { ok: false, data: [] };
    const json = await res.json();
    return { ok: true, data: json.data ?? [] };
  } catch {
    return { ok: false, data: [] };
  }
}

/**
 * GET /api/balldontlie/nba/live
 * Tries both known URL variants for live box scores.
 * BallDontLie docs show: GET https://api.balldontlie.io/v1/box_scores/live
 * but the NBA-namespaced path nba/v1/box_scores/live may also work.
 */
export async function GET() {
  // Try the URL the user confirmed from the docs first
  const primary = await tryFetch("https://api.balldontlie.io/v1/box_scores/live");
  const liveHeaders = { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' };
  if (primary.ok && primary.data.length > 0) {
    return NextResponse.json({ data: primary.data, source: "v1" }, { headers: liveHeaders });
  }

  // Fall back to nba/v1 variant
  const fallback = await tryFetch("https://api.balldontlie.io/nba/v1/box_scores/live");
  if (fallback.ok) {
    return NextResponse.json({ data: fallback.data, source: "nba/v1" }, { headers: liveHeaders });
  }

  return NextResponse.json({ data: [] }, { headers: liveHeaders });
}
