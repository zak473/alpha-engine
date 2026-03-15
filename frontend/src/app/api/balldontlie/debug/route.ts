import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.BALLDONTLIE_API_KEY ?? "";

  async function test(url: string) {
    try {
      const res = await fetch(url, { headers: { Authorization: key }, cache: "no-store" });
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return { status: res.status, ok: res.ok, count: json.data?.length ?? (json.id ? 1 : 0), sample: json.data?.[0] ?? (json.id ? { id: json.id } : null) };
      } catch {
        return { status: res.status, ok: res.ok, count: 0, raw: text.slice(0, 200) };
      }
    } catch (e) {
      return { status: null, ok: false, count: 0, raw: String(e) };
    }
  }

  const today = new Date().toISOString().split("T")[0];

  // Test games with three different URL formats to find which one works
  const [
    cs2Running,
    cs2Upcoming,
    // Format 1: unencoded brackets (what we currently use)
    nbaGamesUnencoded,
    // Format 2: percent-encoded brackets (as the official .gs script does)
    nbaGamesEncoded,
    // Format 3: start_date + end_date (alternative from OpenAPI spec)
    nbaGamesDateRange,
    // Format 4: seasons only (sanity check)
    nbaGamesSeason,
    nbaBoxScoresLive,
  ] = await Promise.all([
    test("https://api.balldontlie.io/cs/v1/matches?status=running&per_page=5"),
    test("https://api.balldontlie.io/cs/v1/matches?status=upcoming&per_page=5"),
    test(`https://api.balldontlie.io/nba/v1/games?dates[]=${today}&per_page=5`),
    test(`https://api.balldontlie.io/nba/v1/games?dates%5B%5D=${today}&per_page=5`),
    test(`https://api.balldontlie.io/nba/v1/games?start_date=${today}&end_date=${today}&per_page=5`),
    test(`https://api.balldontlie.io/nba/v1/games?seasons[]=2025&per_page=5`),
    test(`https://api.balldontlie.io/v1/box_scores/live`),
  ]);

  return NextResponse.json({
    keyLength: key.length,
    keyStart: key.slice(0, 8),
    keyEnd: key.slice(-4),
    today,
    cs2Running,
    cs2Upcoming,
    nbaGamesUnencoded,
    nbaGamesEncoded,
    nbaGamesDateRange,
    nbaGamesSeason,
    nbaBoxScoresLive,
  });
}
