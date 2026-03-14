import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.BALLDONTLIE_API_KEY ?? "";

  async function test(url: string) {
    try {
      const res = await fetch(url, { headers: { Authorization: key }, cache: "no-store" });
      const json = await res.json();
      return { status: res.status, count: json.data?.length ?? 0, sample: json.data?.slice(0, 1) };
    } catch (e) {
      return { status: null, count: 0, sample: String(e) };
    }
  }

  const [cs2Running, cs2Upcoming, cs2Finished, nba] = await Promise.all([
    test(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/balldontlie/cs2/matches`.startsWith("http")
      ? `https://api.balldontlie.io/cs/v1/matches?status=running&per_page=5`
      : `https://api.balldontlie.io/cs/v1/matches?status=running&per_page=5`),
    test("https://api.balldontlie.io/cs/v1/matches?status=upcoming&per_page=5"),
    test("https://api.balldontlie.io/cs/v1/matches?status=finished&per_page=3"),
    test("https://api.balldontlie.io/v1/games?per_page=1"),
  ]);

  return NextResponse.json({
    keyLength: key.length,
    keyStart: key.slice(0, 8),
    cs2Running,
    cs2Upcoming,
    cs2Finished,
    nba,
  });
}
