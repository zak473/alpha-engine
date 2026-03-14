import { NextRequest, NextResponse } from "next/server";

const BDL_V1 = "https://api.balldontlie.io/nba/v1";
const BDL_V2 = "https://api.balldontlie.io/nba/v2";

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? "" };
}

async function bdlGet(url: string, revalidate: number) {
  try {
    const res = await fetch(url, { headers: bdlHeaders(), next: { revalidate } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Bundled NBA game data — returns game + box scores + plays + standings + odds
 * in a single response. Each BDL fetch is individually cached so repeated calls
 * within the cache window cost zero additional BDL requests.
 *
 * 5 BDL requests max on cache miss, 0 on cache hit.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;

  const [gameJson, boxJson, playsJson, standJson, oddsJson] = await Promise.all([
    bdlGet(`${BDL_V1}/games/${id}`, 60),
    bdlGet(`${BDL_V1}/box_scores?game_ids[]=${id}`, 60),
    bdlGet(`${BDL_V1}/plays?game_id=${id}&per_page=50`, 60),
    bdlGet(`${BDL_V1}/standings?season=2024&per_page=30`, 600),
    bdlGet(`${BDL_V2}/odds?game_ids[]=${id}&per_page=20`, 120),
  ]);

  // game can come from box score embed, single-game endpoint (wrapped or flat)
  const game =
    boxJson?.data?.[0]?.game ??
    (gameJson?.data?.id ? gameJson.data : null) ??
    (gameJson?.id ? gameJson : null);

  return NextResponse.json({
    game: game ?? null,
    boxScore: boxJson?.data?.[0] ?? null,
    plays: playsJson?.data ?? [],
    standings: standJson?.data ?? [],
    odds: oddsJson?.data ?? [],
  });
}
