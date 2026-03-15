import { NextResponse } from "next/server";

const BASE = "https://api.sportsgameodds.com/v2";
const KEY = process.env.SGO_API_KEY ?? "";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eventID = searchParams.get("eventID");
  const endpoint = searchParams.get("endpoint") ?? "events";

  // Try the specific endpoint (events, scores, boxscores, stats)
  const url = eventID
    ? `${BASE}/${endpoint}/?apiKey=${KEY}&eventID=${eventID}`
    : `${BASE}/${endpoint}/?apiKey=${KEY}&leagueID=EPL&live=true`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const raw = await res.json();

    // For the event, show what top-level keys exist beyond odds
    const event = raw.data?.[0] ?? raw.events?.[0];
    const summary = event ? {
      topLevelKeys: Object.keys(event),
      statusKeys: event.status ? Object.keys(event.status) : [],
      teamsKeys: event.teams ? Object.keys(event.teams) : [],
      hasScores: "scores" in event || "score" in event,
      hasStats: "stats" in event || "statistics" in event || "boxscore" in event,
      rawStatus: event.status,
      rawScores: event.scores ?? event.score ?? "not present",
      rawStats: event.stats ?? event.statistics ?? event.boxscore ?? "not present",
    } : { error: "no event found", raw };

    return NextResponse.json({ url, status: res.status, summary });
  } catch (e) {
    return NextResponse.json({ error: String(e), url });
  }
}
