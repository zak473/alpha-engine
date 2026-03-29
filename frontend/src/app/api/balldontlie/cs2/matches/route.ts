import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/cs/v1";

// BallDontLie CS2 API does not support status/date filtering.
// Matches 0-6619 are all old canceled/defwin data.
// Current/upcoming/running matches begin at cursor 6619 (IDs 4074668+).
const LIVE_CURSOR = 6619;

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

export async function GET(_req: NextRequest) {
  try {
    // Fetch two pages of recent matches starting from LIVE_CURSOR
    const [page1Res, page2Res] = await Promise.all([
      fetch(`${BDL_BASE}/matches?cursor=${LIVE_CURSOR}&per_page=100`, {
        headers: bdlHeaders(),
        next: { revalidate: 300 },
      }),
      fetch(`${BDL_BASE}/matches?cursor=4074668&per_page=100`, {
        headers: bdlHeaders(),
        next: { revalidate: 300 },
      }),
    ]);

    const page1 = page1Res.ok ? (await page1Res.json()).data ?? [] : [];
    const page2 = page2Res.ok ? (await page2Res.json()).data ?? [] : [];

    // Merge, deduplicate, filter out old canceled/defwin-only noise
    const seen = new Set<number>();
    const all: unknown[] = [];
    for (const m of [...page1, ...page2]) {
      const match = m as { id: number; status: string };
      if (!seen.has(match.id)) {
        seen.add(match.id);
        if (match.status !== "canceled" && match.status !== "defwin") {
          all.push(m);
        }
      }
    }

    return NextResponse.json({ data: all, meta: { total: all.length } }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' }
    });
  } catch {
    return NextResponse.json({ data: [], meta: {} }, { status: 500 });
  }
}
