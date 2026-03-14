import { NextRequest, NextResponse } from "next/server";

const BDL_BASE = "https://api.balldontlie.io/cs/v1";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

// GET /api/balldontlie/cs2/maps?match_ids=1,2,3
export async function GET(req: NextRequest) {
  const matchIdsParam = req.nextUrl.searchParams.get("match_ids");
  if (!matchIdsParam) {
    return NextResponse.json({ data: [] });
  }

  const ids = matchIdsParam.split(",").filter(Boolean);
  const qs = new URLSearchParams();
  ids.forEach((id) => qs.append("match_ids[]", id));
  qs.set("per_page", "100");

  try {
    const res = await fetch(`${BDL_BASE}/match_maps?${qs}`, {
      headers: bdlHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
