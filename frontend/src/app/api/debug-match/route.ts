import { NextRequest, NextResponse } from "next/server";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sport = sp.get("sport") ?? "soccer";
  const eventID = sp.get("eventID") ?? "";

  const out: Record<string, unknown> = {
    API_BASE,
    RAW_ENV: process.env.NEXT_PUBLIC_API_URL ?? "NOT_SET",
    sport,
    eventID,
  };

  // 1. Fetch SGO event
  const apiKey = process.env.SGO_API_KEY ?? "";
  try {
    const r = await fetch(
      `https://api.sportsgameodds.com/v2/events/?apiKey=${apiKey}&eventID=${eventID}`,
      { cache: "no-store" }
    );
    const d = await r.json();
    const event = d.data?.[0];
    out.sgoOk = r.ok;
    out.sgoStatus = r.status;
    out.sgoStartsAt = event?.status?.startsAt;
    out.sgoHomeTeam = event?.teams?.home?.names?.long;
    out.sgoAwayTeam = event?.teams?.away?.names?.long;

    const sgoHome = event?.teams?.home?.names?.long ?? "";
    const sgoAway = event?.teams?.away?.names?.long ?? "";

    // Try search endpoint
    const searchUrl = `${API_BASE}/matches/search?q=${encodeURIComponent(sgoHome)}&limit=20`;
    out.searchUrl = searchUrl;
    const sr = await fetch(searchUrl, { cache: "no-store" });
    out.searchStatus = sr.status;
    if (sr.ok) {
      const sd = await sr.json();
      out.searchResults = sd;
    } else {
      out.searchError = await sr.text().catch(() => "");
    }

    if (event?.status?.startsAt) {
      const startAt = new Date(event.status.startsAt);
      const dateFrom = new Date(startAt.getTime() - 12 * 3600_000).toISOString();
      const dateTo   = new Date(startAt.getTime() + 12 * 3600_000).toISOString();
      const listUrl = `${API_BASE}/sports/${sport}/matches?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&limit=500`;

      out.backendListUrl = listUrl;

      const lr = await fetch(listUrl, { cache: "no-store" });
      out.backendListStatus = lr.status;

      if (lr.ok) {
        const ld = await lr.json();
        out.backendTotal = ld.total;
        out.backendItemCount = ld.items?.length ?? 0;
        const found = (ld.items ?? []).find((m: { home_name: string; away_name: string }) =>
          m.home_name.toLowerCase().includes("nottingham") || m.away_name.toLowerCase().includes("fulham")
        );
        out.targetMatchFound = found ? `${found.home_name} vs ${found.away_name}` : "NOT FOUND in results";
        out.backendSampleNames = (ld.items ?? []).slice(0, 5).map((m: { home_name: string; away_name: string }) => `${m.home_name} vs ${m.away_name}`);
      } else {
        out.backendListError = await lr.text().catch(() => "");
      }
    }
  } catch (err) {
    out.error = String(err);
  }

  return NextResponse.json(out, { status: 200 });
}
