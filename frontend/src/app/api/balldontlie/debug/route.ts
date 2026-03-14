import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.BALLDONTLIE_API_KEY ?? "";

  async function test(label: string, url: string) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: key },
        cache: "no-store",
      });
      const body = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { parsed = body; }
      return { status: res.status, data: parsed };
    } catch (e) {
      return { status: null, data: String(e) };
    }
  }

  const nba = await test("nba-games", "https://api.balldontlie.io/v1/games?per_page=1");
  const cs2 = await test("cs2-matches", "https://api.balldontlie.io/cs/v1/matches?per_page=1");

  return NextResponse.json({
    keyLength: key.length,
    keyStart: key.slice(0, 8),
    keyEnd: key.slice(-4),
    nba,
    cs2,
  });
}
