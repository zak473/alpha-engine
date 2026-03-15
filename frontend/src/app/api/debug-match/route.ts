import { NextResponse } from "next/server";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") ?? "soccer";
  const home = searchParams.get("home") ?? "";
  const away = searchParams.get("away") ?? "";

  const info: Record<string, unknown> = {
    API_BASE,
    RAW_ENV: process.env.NEXT_PUBLIC_API_URL,
    deploy_time: new Date().toISOString(),
  };

  // Search
  try {
    const searchUrl = `${API_BASE}/matches/search?q=${encodeURIComponent(home)}&limit=20`;
    info.searchUrl = searchUrl;
    const res = await fetch(searchUrl, { cache: "no-store" });
    info.searchStatus = res.status;
    if (res.ok) {
      const results = await res.json();
      info.searchResults = results;
      info.matchCandidates = results.filter((r: { type: string; sport: string }) => r.type === "match" && r.sport === sport);
    }
  } catch (e) {
    info.searchError = String(e);
  }

  return NextResponse.json(info, { status: 200 });
}
