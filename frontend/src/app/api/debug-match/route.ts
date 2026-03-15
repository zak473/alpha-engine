import { NextResponse } from "next/server";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;
const SGO_KEY = process.env.SGO_API_KEY ?? "";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eventID = searchParams.get("eventID");
  const sport = searchParams.get("sport") ?? "soccer";

  const info: Record<string, unknown> = {
    API_BASE,
    deploy_time: new Date().toISOString(),
  };

  // Step 1: fetch SGO event
  let sgoHome = searchParams.get("home") ?? "";
  let sgoAway = searchParams.get("away") ?? "";

  if (eventID) {
    try {
      const sgoRes = await fetch(
        `https://api.sportsgameodds.com/v2/events/?apiKey=${SGO_KEY}&eventID=${eventID}`,
        { cache: "no-store" }
      );
      info.sgoStatus = sgoRes.status;
      if (sgoRes.ok) {
        const sgoData = await sgoRes.json();
        const ev = sgoData.data?.[0];
        if (ev) {
          sgoHome = ev.teams?.home?.names?.long ?? "";
          sgoAway = ev.teams?.away?.names?.long ?? "";
          info.sgoHome = sgoHome;
          info.sgoAway = sgoAway;
          info.sgoLeague = ev.leagueID;
        } else {
          info.sgoError = "No event found";
        }
      }
    } catch (e) {
      info.sgoError = String(e);
    }
  }

  info.searchingFor = { home: sgoHome, away: sgoAway, sport };

  // Step 2: search backend
  if (sgoHome) {
    try {
      const searchUrl = `${API_BASE}/matches/search?q=${encodeURIComponent(sgoHome)}&limit=20`;
      info.searchUrl = searchUrl;
      const res = await fetch(searchUrl, { cache: "no-store" });
      info.searchStatus = res.status;
      if (res.ok) {
        const results = await res.json();
        info.allResults = results;
        const candidates = results.filter((r: { type: string; sport: string; title: string }) =>
          r.type === "match" && r.sport === sport
        );
        info.sportMatchCandidates = candidates;
        // Show away name matching
        info.awayMatching = candidates.map((r: { title: string; id: string }) => ({
          id: r.id,
          title: r.title,
          awayInTitle: r.title.split(" vs ").slice(-1)[0],
          sgoAway,
        }));
      }
    } catch (e) {
      info.searchError = String(e);
    }
  }

  return NextResponse.json(info, { status: 200 });
}
