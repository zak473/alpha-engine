import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/nba/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${BDL_BASE}/games/${params.id}`, {
      headers: bdlHeaders(),
      next: { revalidate: 60 },
    });
    if (!res.ok) return NextResponse.json({ data: null }, { status: res.status });
    return NextResponse.json(await res.json(), {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' }
    });
  } catch {
    return NextResponse.json({ data: null }, { status: 500 });
  }
}
