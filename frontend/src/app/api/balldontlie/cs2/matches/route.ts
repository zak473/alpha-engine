import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

export async function GET(req: NextRequest) {
  const datesParam = req.nextUrl.searchParams.get("dates"); // "2026-03-14,2026-03-13"
  const today = new Date().toISOString().split("T")[0];
  const dates = datesParam ? datesParam.split(",") : [today];

  const qs = new URLSearchParams();
  dates.forEach((d) => qs.append("dates[]", d));
  qs.set("per_page", "100");

  try {
    const res = await fetch(`${BDL_BASE}/cs2/matches?${qs}`, {
      headers: bdlHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ data: [], meta: {} }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [], meta: {} }, { status: 500 });
  }
}
