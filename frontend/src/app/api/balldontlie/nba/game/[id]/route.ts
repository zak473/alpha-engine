import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${BDL_BASE}/games/${params.id}`, {
      headers: bdlHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ data: null }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: null }, { status: 500 });
  }
}
