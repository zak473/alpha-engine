/**
 * BallDontLie GOAT client
 * All data fetches go via Next.js API route handlers so the API key stays server-side.
 */

// ─── Core types ───────────────────────────────────────────────────────────

export interface BdlTeam {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
  full_name: string;
}

export interface BdlGame {
  id: number;
  date: string;      // "YYYY-MM-DD"
  datetime: string;  // ISO string e.g. "2026-03-14T17:00:00.000Z"
  season: number;
  /** ISO string when scheduled; "Q1"|"Q2"|"Q3"|"Q4"|"Halftime"|"OT"|"Final" otherwise */
  status: string;
  period: number;    // 0 = not started; 1–4 = quarters; 5+ = OT
  time: string | null; // "3:24" when live; null otherwise
  postseason: boolean;
  postponed: boolean;
  home_team_score: number;
  visitor_team_score: number;
  home_team: BdlTeam;
  visitor_team: BdlTeam;
  // Quarter / OT scores
  home_q1: number | null;
  home_q2: number | null;
  home_q3: number | null;
  home_q4: number | null;
  home_ot1: number | null;
  home_ot2: number | null;
  home_ot3: number | null;
  visitor_q1: number | null;
  visitor_q2: number | null;
  visitor_q3: number | null;
  visitor_q4: number | null;
  visitor_ot1: number | null;
  visitor_ot2: number | null;
  visitor_ot3: number | null;
  // Live context
  home_timeouts_remaining: number | null;
  visitor_timeouts_remaining: number | null;
  home_in_bonus: boolean | null;
  visitor_in_bonus: boolean | null;
}

export interface BdlPlayerMeta {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
}

export interface BdlPlayerBoxScore {
  player: BdlPlayerMeta;
  min: string | null;    // "35:00" | "DNP" | null
  fgm: number | null;
  fga: number | null;
  fg_pct: number | null;
  fg3m: number | null;
  fg3a: number | null;
  fg3_pct: number | null;
  ftm: number | null;
  fta: number | null;
  ft_pct: number | null;
  oreb: number | null;
  dreb: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  turnover: number | null;
  pf: number | null;
  pts: number | null;
  plus_minus_points: number | null;
}

export interface BdlTeamBoxScore {
  team: BdlTeam;
  players: BdlPlayerBoxScore[];
}

export interface BdlBoxScore {
  game: BdlGame;
  home_team: BdlTeamBoxScore;
  visitor_team: BdlTeamBoxScore;
}

export interface BdlPlay {
  id: number;
  game_id: number;
  team_id: number | null;
  player_id: number | null;
  period: number;
  clock: string;
  description: string;
  score_home: string;
  score_away: string;
}

// ─── Status helpers ───────────────────────────────────────────────────────

// BallDontLie actual status values:
//   Scheduled  → ISO datetime "2026-03-14T20:00:00.000Z"  OR  time string "7:00 pm ET"
//   Live       → "1st Qtr" | "2nd Qtr" | "Halftime" | "3rd Qtr" | "4th Qtr" | "1st OT" etc.
//   Finished   → "Final"

export function isGameFinished(status: string): boolean {
  return status === "Final";
}

export function isGameScheduled(status: string): boolean {
  if (!status) return false;
  // ISO datetime string
  if (/^\d{4}-\d{2}-\d{2}/.test(status)) return true;
  // Formatted time, e.g. "7:00 pm ET", "1:00 PM ET"
  if (/\d+:\d+\s*(am|pm)/i.test(status)) return true;
  return false;
}

export function isGameLive(status: string): boolean {
  if (!status) return false;
  return !isGameFinished(status) && !isGameScheduled(status);
}

export function getPeriodLabel(game: BdlGame): string {
  if (isGameScheduled(game.status)) {
    // If status is already a formatted time string like "7:00 pm ET", use it directly
    if (/\d+:\d+\s*(am|pm)/i.test(game.status)) return game.status;
    // Otherwise parse the ISO datetime
    const src = game.datetime ?? game.date;
    const d = new Date(src);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }) + " ET";
  }
  if (isGameFinished(game.status)) return "Final";
  // Live: BallDontLie returns "1st Qtr", "2nd Qtr", "Halftime", "3rd Qtr", "4th Qtr", "1st OT" etc.
  // Return the status string directly — it's already human-readable
  return game.status;
}

export function getClockDisplay(game: BdlGame): string {
  if (!isGameLive(game.status)) return "";
  const period = getPeriodLabel(game);
  return game.time ? `${period} · ${game.time}` : period;
}

// ─── Box score helpers ────────────────────────────────────────────────────

export function isDNP(player: BdlPlayerBoxScore): boolean {
  const m = player.min;
  return !m || m === "DNP" || m === "0:00" || m === "00:00";
}

export function parseMins(min: string | null): number {
  if (!min || min === "DNP") return 0;
  const [h, m] = min.split(":").map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

export function getTopScorer(teamBox: BdlTeamBoxScore): BdlPlayerBoxScore | null {
  const active = teamBox.players.filter((p) => !isDNP(p));
  if (!active.length) return null;
  return active.reduce((best, p) => ((p.pts ?? 0) > (best.pts ?? 0) ? p : best));
}

export interface TeamTotals {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
  pf: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
}

export function calcTeamTotals(players: BdlPlayerBoxScore[]): TeamTotals {
  const active = players.filter((p) => !isDNP(p));
  const sum = (key: keyof BdlPlayerBoxScore) =>
    active.reduce((acc, p) => acc + (((p[key] as number) ?? 0)), 0);
  return {
    pts: sum("pts"),
    reb: sum("reb"),
    ast: sum("ast"),
    stl: sum("stl"),
    blk: sum("blk"),
    turnover: sum("turnover"),
    pf: sum("pf"),
    fgm: sum("fgm"),
    fga: sum("fga"),
    fg3m: sum("fg3m"),
    fg3a: sum("fg3a"),
    ftm: sum("ftm"),
    fta: sum("fta"),
    oreb: sum("oreb"),
    dreb: sum("dreb"),
  };
}

export function fmtShotLine(made: number | null, attempted: number | null): string {
  if (made == null || attempted == null) return "—";
  return `${made}/${attempted}`;
}

export function fmtShotPct(made: number, attempted: number): string {
  if (!attempted) return "—";
  return (made / attempted * 100).toFixed(1) + "%";
}

// ─── Client fetch functions ───────────────────────────────────────────────

export async function getNBAGames(date?: string): Promise<BdlGame[]> {
  const d = date ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  try {
    const res = await fetch(`/api/balldontlie/nba/games?date=${d}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function getNBALiveBoxScores(date?: string): Promise<BdlBoxScore[]> {
  const d = date ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  try {
    const res = await fetch(`/api/balldontlie/nba/live?date=${d}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function getNBABoxScore(gameId: number): Promise<BdlBoxScore | null> {
  try {
    const res = await fetch(`/api/balldontlie/nba/boxscore?game_id=${gameId}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getNBAPlays(gameId: number): Promise<BdlPlay[]> {
  try {
    const res = await fetch(`/api/balldontlie/nba/plays?game_id=${gameId}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}
