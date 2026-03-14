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
        return { status: res.status, ok: res.ok, count: 0, raw: text.slice(0, 120) };
      }
    } catch (e) {
      return { status: null, ok: false, count: 0, raw: String(e) };
    }
  }

  const today = new Date().toISOString().split("T")[0];

  const [cs2Running, cs2Upcoming, nbaGames, nbaGame] = await Promise.all([
    test("https://api.balldontlie.io/cs/v1/matches?status=running&per_page=5"),
    test("https://api.balldontlie.io/cs/v1/matches?status=upcoming&per_page=5"),
    test(`https://api.balldontlie.io/nba/v1/games?dates[]=${today}&per_page=3`),
    // Test single game fetch with a known recent game ID from the list
    (async () => {
      try {
        const listRes = await fetch(`https://api.balldontlie.io/nba/v1/games?dates[]=${today}&per_page=1`, { headers: { Authorization: key }, cache: "no-store" });
        const listJson = await listRes.json();
        const firstId = listJson.data?.[0]?.id;
        if (!firstId) return { status: null, sample: "no games today to test single fetch" };
        const res = await fetch(`https://api.balldontlie.io/nba/v1/games/${firstId}`, { headers: { Authorization: key }, cache: "no-store" });
        const json = await res.json();
        return { status: res.status, gameId: firstId, hasDataWrapper: "data" in json, keys: Object.keys(json).slice(0, 5) };
      } catch (e) {
        return { status: null, sample: String(e) };
      }
    })(),
  ]);

  return NextResponse.json({
    keyLength: key.length,
    keyStart: key.slice(0, 8),
    cs2Running,
    cs2Upcoming,
    nbaGames,
    nbaGame,
  });
}
