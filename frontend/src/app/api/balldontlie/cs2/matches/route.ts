import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/cs/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

export async function GET(_req: NextRequest) {
  try {
    // Fetch live + upcoming matches in parallel; dates[] filter is not supported by this API
    const [runningRes, upcomingRes, finishedRes] = await Promise.all([
      fetch(`${BDL_BASE}/matches?status=running&per_page=50`, {
        headers: bdlHeaders(),
        cache: "no-store",
      }),
      fetch(`${BDL_BASE}/matches?status=upcoming&per_page=50`, {
        headers: bdlHeaders(),
        cache: "no-store",
      }),
      fetch(`${BDL_BASE}/matches?status=finished&per_page=20`, {
        headers: bdlHeaders(),
        cache: "no-store",
      }),
    ]);

    const running = runningRes.ok ? (await runningRes.json()).data ?? [] : [];
    const upcoming = upcomingRes.ok ? (await upcomingRes.json()).data ?? [] : [];
    const finished = finishedRes.ok ? (await finishedRes.json()).data ?? [] : [];

    const all = [...running, ...upcoming, ...finished];

    return NextResponse.json({ data: all, meta: { total: all.length } });
  } catch {
    return NextResponse.json({ data: [], meta: {} }, { status: 500 });
  }
}
