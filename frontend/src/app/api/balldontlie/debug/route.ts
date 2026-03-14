import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.BALLDONTLIE_API_KEY ?? "";

  async function test(url: string) {
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

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

  const [nba, cs2All, cs2Today, cs2Yesterday] = await Promise.all([
    test("https://api.balldontlie.io/v1/games?per_page=1"),
    test("https://api.balldontlie.io/cs/v1/matches?per_page=3"),
    test(`https://api.balldontlie.io/cs/v1/matches?dates[]=${today}&per_page=10`),
    test(`https://api.balldontlie.io/cs/v1/matches?dates[]=${yesterday}&per_page=10`),
  ]);

  return NextResponse.json({
    keyLength: key.length,
    keyStart: key.slice(0, 8),
    today,
    yesterday,
    nbaStatus: nba.status,
    cs2AllStatus: cs2All.status,
    cs2TodayStatus: cs2Today.status,
    cs2TodayCount: (cs2Today.data as any)?.data?.length ?? "err",
    cs2TodaySample: (cs2Today.data as any)?.data?.slice(0, 2) ?? cs2Today.data,
    cs2YesterdayCount: (cs2Yesterday.data as any)?.data?.length ?? "err",
  });
}
