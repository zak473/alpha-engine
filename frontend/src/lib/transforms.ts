/**
 * Shared data transformation helpers.
 * Converts API response shapes into app-level types used by components.
 */

import type { Match, MvpPrediction } from "./types";

/**
 * Convert an MvpPrediction (from /predictions endpoint) to the Match shape
 * used by PredictionCard and MatchesTable. Previously duplicated in
 * dashboard/page.tsx and matches/page.tsx.
 */
export function mvpToMatch(p: MvpPrediction): Match {
  return {
    id: p.event_id,
    sport: p.sport as Match["sport"],
    competition: p.league,
    home_name: p.participants.home.name,
    away_name: p.participants.away.name,
    home_id: p.participants.home.id,
    away_id: p.participants.away.id,
    scheduled_at: p.start_time,
    status: p.status as Match["status"],
    p_home: p.probabilities.home_win,
    p_draw: p.probabilities.draw,
    p_away: p.probabilities.away_win,
    confidence: p.confidence,
  };
}
