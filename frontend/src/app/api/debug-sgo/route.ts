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
    const res = await fetch(url, { next: { revalidate: 300 } });
    const raw = await res.json();

    // For the event, show what top-level keys exist beyond odds
    const event = raw.data?.[0] ?? raw.events?.[0];
    const gameResults = event?.results?.game;
    const firstPlayerID = gameResults ? Object.keys(gameResults).find(k => k !== "home" && k !== "away") : null;
    const summary = event ? {
      topLevelKeys: Object.keys(event),
      rawResultsGameHomeKeys: gameResults?.home ? Object.keys(gameResults.home) : null,
      rawResultsGameAwayKeys: gameResults?.away ? Object.keys(gameResults.away) : null,
      rawResultsGameHomeValues: gameResults?.home,
      rawResultsGameAwayValues: gameResults?.away,
      firstPlayerID,
      firstPlayerStats: firstPlayerID ? gameResults?.[firstPlayerID] : null,
      rawPlayers: event.players,
      rawInfo: event.info,
      rawClock: event.status?.clock,
      rawTeams: event.teams,
    } : { error: "no event found", raw };

    return NextResponse.json({ url, status: res.status, summary }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' }
    });
  } catch (e) {
    return NextResponse.json({ error: String(e), url });
  }
}
