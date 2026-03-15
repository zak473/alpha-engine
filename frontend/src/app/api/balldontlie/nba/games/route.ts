import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/nba/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

function etDate(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * GET /api/balldontlie/nba/games?date=YYYY-MM-DD
 * Fetches today + yesterday (ET dates) so live games that started
 * near midnight ET are never missed.
 */
export async function GET(req: NextRequest) {
  const requestedDate = req.nextUrl.searchParams.get("date");

  const dates = requestedDate
    ? [requestedDate]
    : [etDate(0), etDate(-1)]; // today + yesterday in ET

  try {
    const results = await Promise.all(
      dates.map((date) =>
        fetch(`${BDL_BASE}/games?dates[]=${date}&per_page=100`, {
          headers: bdlHeaders(),
          cache: "no-store",
        }).then((r) => (r.ok ? r.json() : { data: [] }))
      )
    );

    // Merge, deduplicate by game id, keep most-recent status for each
    const byId = new Map<number, any>();
    for (const result of results) {
      for (const game of result.data ?? []) {
        byId.set(game.id, game);
      }
    }

    return NextResponse.json({ data: Array.from(byId.values()), meta: {} });
  } catch {
    return NextResponse.json({ data: [], meta: {} }, { status: 500 });
  }
}
