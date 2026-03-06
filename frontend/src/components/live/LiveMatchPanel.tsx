"use client";

/**
 * Rich in-play panels for each sport — shown when match.status === "live".
 * Each panel shows sport-specific live game state.
 */

import { cn } from "@/lib/utils";
import type {
  SportMatchDetail,
  TennisMatchDetail,
  EsportsMatchDetail,
  BasketballMatchDetail,
  BaseballMatchDetail,
} from "@/lib/types";

// ── Pulsing live dot ───────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: "#ef4444", opacity: 0.6,
        animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
      }} />
      <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
    </span>
  );
}

// ── Panel shell ─────────────────────────────────────────────────────────────

function LivePanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(239,68,68,0.05)",
      border: "1px solid rgba(239,68,68,0.2)",
      borderRadius: 12,
      padding: "16px 20px",
      margin: "0 0 4px",
    }}>
      <div className="flex items-center gap-2 mb-3">
        <LiveDot />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: "0.08em" }}>
          LIVE
        </span>
        <span style={{ fontSize: 11, color: "var(--text1)", borderLeft: "1px solid var(--border0)", paddingLeft: 8, marginLeft: 4 }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

// ── Soccer ────────────────────────────────────────────────────────────────

export function SoccerLivePanel({ match }: { match: SportMatchDetail }) {
  const state = match.current_state as { minute?: number; ht_home?: number; ht_away?: number } | null;
  const htHome = state?.ht_home;
  const htAway = state?.ht_away;

  const period = match.current_period === 1 ? "1st Half" : match.current_period === 2 ? "2nd Half" : null;
  const label = [match.live_clock ?? "In Progress", period].filter(Boolean).join("  •  ");

  return (
    <LivePanel label={label}>
      {/* Score */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 text-center">
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>{match.home.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 32, fontWeight: 800, color: "var(--text0)", fontFamily: "monospace" }}>
            {match.home_score ?? 0}
          </span>
          <span style={{ fontSize: 20, color: "var(--text2)" }}>–</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: "var(--text0)", fontFamily: "monospace" }}>
            {match.away_score ?? 0}
          </span>
        </div>
        <div className="flex-1 text-center">
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>{match.away.name}</p>
        </div>
      </div>

      {/* Half-time / xG bar */}
      <div className="flex items-center gap-6 text-xs">
        {htHome != null && htAway != null && (
          <span style={{ color: "var(--text2)" }}>
            HT: {htHome}–{htAway}
          </span>
        )}
        {match.form_home?.xg_avg != null && match.form_away?.xg_avg != null && (
          <div className="flex items-center gap-2 flex-1">
            <span className="font-mono text-[10px]" style={{ color: "#3b82f6" }}>
              xG {match.form_home.xg_avg.toFixed(1)}
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(match.form_home.xg_avg / (match.form_home.xg_avg + match.form_away.xg_avg)) * 100}%`,
                  background: "linear-gradient(90deg, #3b82f6 0%, #22d3ee 100%)",
                }}
              />
            </div>
            <span className="font-mono text-[10px]" style={{ color: "#f59e0b" }}>
              {match.form_away.xg_avg.toFixed(1)} xG
            </span>
          </div>
        )}
      </div>
    </LivePanel>
  );
}

// ── Tennis ───────────────────────────────────────────────────────────────

type TennisLiveState = {
  current_set?: number;
  sets?: Array<{ a: number; b: number; tb_a?: number | null; tb_b?: number | null }>;
};

export function TennisLivePanel({ match }: { match: TennisMatchDetail }) {
  const state = match.current_state as TennisLiveState | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sets = state?.sets ?? (match as any).tennis_info?.sets_detail ?? [];
  const currentSet = state?.current_set ?? sets.length;

  const label = currentSet > 0 ? `Set ${currentSet} in progress` : "In Progress";

  const homeSets = match.home_score ?? 0;
  const awaySets = match.away_score ?? 0;

  return (
    <LivePanel label={label}>
      {/* Set scoreboard */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 280 }}>
          <thead>
            <tr style={{ color: "var(--text2)" }}>
              <th className="text-left pr-4 pb-1 font-normal" style={{ fontSize: 10 }}>Player</th>
              {sets.map((_: unknown, i: number) => (
                <th key={i} className={cn("text-center px-2 pb-1 font-normal", i === sets.length - 1 && "text-red-400")} style={{ fontSize: 10 }}>
                  {i + 1}
                </th>
              ))}
              <th className="text-center px-2 pb-1 font-semibold" style={{ fontSize: 12, color: "var(--text0)" }}>Sets</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: match.home?.name ?? "Home", sets: sets.map((s: { a: number }) => s.a), total: homeSets },
              { name: match.away?.name ?? "Away", sets: sets.map((s: { b: number }) => s.b), total: awaySets },
            ].map((player, pi) => (
              <tr key={pi}>
                <td className="pr-4 py-1" style={{ color: "var(--text1)", fontWeight: 600, fontSize: 12 }}>
                  {player.name}
                </td>
                {player.sets.map((g: number, i: number) => (
                  <td key={i}
                    className={cn("text-center px-2 py-1 font-mono",
                      i === sets.length - 1 ? "font-bold" : ""
                    )}
                    style={{
                      fontSize: i === sets.length - 1 ? 14 : 12,
                      color: i === sets.length - 1 ? "#ef4444" : "var(--text0)",
                      background: i === sets.length - 1 ? "rgba(239,68,68,0.1)" : "transparent",
                      borderRadius: i === sets.length - 1 ? 4 : 0,
                    }}
                  >
                    {g}
                  </td>
                ))}
                <td className="text-center px-2 py-1 font-bold font-mono" style={{ fontSize: 16, color: "var(--text0)" }}>
                  {player.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LivePanel>
  );
}

// ── Esports / CS2 ────────────────────────────────────────────────────────

type EsportsLiveState = {
  current_map?: number;
  current_map_name?: string;
  round_a?: number | null;
  round_b?: number | null;
  team_a_ct?: number | null;
  team_b_ct?: number | null;
  team_a_t?: number | null;
  team_b_t?: number | null;
};

export function EsportsLivePanel({ match }: { match: EsportsMatchDetail }) {
  const state = match.current_state as EsportsLiveState | null;

  // Use match.maps (completed maps) to derive context; live round scores come from current_state
  const completedMaps = match.maps ?? [];
  const lastCompletedMap = completedMaps[completedMaps.length - 1] ?? null;

  // Current map: prefer state (live), fall back to next map after last completed
  const currentMapNum = state?.current_map ?? match.current_period ?? (completedMaps.length + 1);
  const currentMapName = state?.current_map_name ?? lastCompletedMap?.map_name ?? "—";

  // Series format from match_info
  const seriesFormat = match.match_info?.series_format?.toUpperCase() ?? "BO3";
  const totalMaps = seriesFormat.replace(/[^0-9]/g, "") || "3";

  // Round scores: live state takes priority over completed map scores
  const roundA = state?.round_a ?? null;
  const roundB = state?.round_b ?? null;
  const ctA = state?.team_a_ct ?? null;
  const tA = state?.team_a_t ?? null;
  const ctB = state?.team_b_ct ?? null;
  const tB = state?.team_b_t ?? null;

  const label = `Map ${currentMapNum}${currentMapName && currentMapName !== "—" ? ` • ${currentMapName.toUpperCase()}` : ""}`;

  return (
    <LivePanel label={label}>
      <div className="flex flex-col gap-3">
        {/* Series score */}
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--text2)" }}>
          <span>Series: {match.home_score ?? 0}–{match.away_score ?? 0}</span>
          <span>Best of {totalMaps}</span>
        </div>

        {/* Current map score */}
        {roundA != null && roundB != null && (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text0)" }}>
                  {match.home?.name ?? "Team A"}
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: roundA > roundB ? "#22c55e" : "var(--text0)" }}>
                  {roundA}
                </span>
              </div>
              {/* Round bar */}
              <div className="flex h-2 rounded-full overflow-hidden bg-white/10">
                <div style={{ width: `${(roundA / (roundA + roundB + 0.01)) * 100}%`, background: "#3b82f6" }} />
              </div>
              {(ctA != null && tA != null) && (
                <p style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>
                  CT {ctA} · T {tA}
                </p>
              )}
            </div>

            <div className="flex flex-col items-center" style={{ fontSize: 11, color: "var(--text2)" }}>
              <span>–</span>
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: roundB > roundA ? "#22c55e" : "var(--text0)" }}>
                  {roundB}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text0)", textAlign: "right" }}>
                  {match.away?.name ?? "Team B"}
                </span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-white/10">
                <div style={{ width: `${(roundB / (roundA + roundB + 0.01)) * 100}%`, background: "#f59e0b" }} />
              </div>
              {(ctB != null && tB != null) && (
                <p style={{ fontSize: 10, color: "var(--text2)", marginTop: 2, textAlign: "right" }}>
                  CT {ctB} · T {tB}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </LivePanel>
  );
}

// ── Basketball ──────────────────────────────────────────────────────────

export function BasketballLivePanel({ match }: { match: BasketballMatchDetail }) {
  const period = match.current_period;
  const qLabels = ["Q1", "Q2", "Q3", "Q4", "OT"];
  const label = period != null && period >= 1 && period <= 5
    ? `${qLabels[period - 1]} in progress`
    : match.live_clock ?? "In Progress";

  // Pull quarter scores from match_info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hq = (match as any).match_info?.home_quarters ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aq = (match as any).match_info?.away_quarters ?? {};

  return (
    <LivePanel label={label}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 320 }}>
          <thead>
            <tr style={{ color: "var(--text2)" }}>
              <th className="text-left pr-4 pb-1 font-normal" style={{ fontSize: 10 }}>Team</th>
              {["Q1","Q2","Q3","Q4"].map((q, i) => (
                <th key={q}
                  className={cn("text-center px-2 pb-1 font-normal", period === i + 1 && "text-red-400 font-semibold")}
                  style={{ fontSize: 10 }}
                >
                  {q}
                </th>
              ))}
              {(hq.ot || aq.ot) && (
                <th className="text-center px-2 pb-1 font-normal" style={{ fontSize: 10, color: "var(--warning)" }}>OT</th>
              )}
              <th className="text-center px-2 pb-1 font-semibold" style={{ fontSize: 12, color: "var(--text0)" }}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: match.home?.name ?? "Home", q: [hq.q1, hq.q2, hq.q3, hq.q4], ot: hq.ot, total: match.home_score },
              { name: match.away?.name ?? "Away", q: [aq.q1, aq.q2, aq.q3, aq.q4], ot: aq.ot, total: match.away_score },
            ].map((team, ti) => (
              <tr key={ti}>
                <td className="pr-4 py-1" style={{ color: "var(--text1)", fontWeight: 600, fontSize: 12 }}>
                  {team.name}
                </td>
                {team.q.map((pts: number | null | undefined, i: number) => (
                  <td key={i}
                    className="text-center px-2 py-1 font-mono"
                    style={{
                      fontSize: 12,
                      color: period === i + 1 ? "#ef4444" : pts != null ? "var(--text0)" : "var(--text2)",
                      background: period === i + 1 ? "rgba(239,68,68,0.1)" : "transparent",
                      borderRadius: 4,
                    }}
                  >
                    {pts ?? "–"}
                  </td>
                ))}
                {(hq.ot || aq.ot) && (
                  <td className="text-center px-2 py-1 font-mono" style={{ fontSize: 12, color: "var(--warning)" }}>
                    {team.ot ?? "–"}
                  </td>
                )}
                <td className="text-center px-2 py-1 font-bold font-mono" style={{ fontSize: 18, color: "var(--text0)" }}>
                  {team.total ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LivePanel>
  );
}

// ── Baseball ────────────────────────────────────────────────────────────

type BaseballLiveState = {
  inning?: number;
  half?: "top" | "bottom";
  outs?: number;
  runners?: { first?: boolean; second?: boolean; third?: boolean };
};

export function BaseballLivePanel({ match }: { match: BaseballMatchDetail }) {
  const state = match.current_state as BaseballLiveState | null;
  const inning = state?.inning ?? match.current_period ?? 1;
  const half = state?.half ?? "top";
  const outs = state?.outs ?? 0;
  const runners = state?.runners ?? {};

  // Inning scores from match_info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const innings = (match as any).match_info?.inning_scores ?? (match as any).inning_scores ?? [];
  const label = `${half === "top" ? "Top" : "Bot"} ${inning}${inning === 1 ? "st" : inning === 2 ? "nd" : inning === 3 ? "rd" : "th"}`;

  return (
    <LivePanel label={label}>
      <div className="flex gap-6">
        {/* Outs + Bases */}
        <div className="flex flex-col items-center gap-3">
          {/* Outs */}
          <div>
            <p style={{ fontSize: 9, color: "var(--text2)", textAlign: "center", marginBottom: 4 }}>OUTS</p>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: i < outs ? "#f59e0b" : "transparent",
                  border: `1.5px solid ${i < outs ? "#f59e0b" : "var(--border0)"}`,
                }} />
              ))}
            </div>
          </div>

          {/* Diamond */}
          <div style={{ position: "relative", width: 52, height: 52 }}>
            {/* 2nd base (top) */}
            <div style={{
              position: "absolute", top: 0, left: "50%", transform: "translateX(-50%) rotate(45deg)",
              width: 14, height: 14,
              background: runners.second ? "#f59e0b" : "transparent",
              border: `2px solid ${runners.second ? "#f59e0b" : "rgba(255,255,255,0.2)"}`,
            }} />
            {/* 1st base (right) */}
            <div style={{
              position: "absolute", right: 0, top: "50%", transform: "translateY(-50%) rotate(45deg)",
              width: 14, height: 14,
              background: runners.first ? "#f59e0b" : "transparent",
              border: `2px solid ${runners.first ? "#f59e0b" : "rgba(255,255,255,0.2)"}`,
            }} />
            {/* 3rd base (left) */}
            <div style={{
              position: "absolute", left: 0, top: "50%", transform: "translateY(-50%) rotate(45deg)",
              width: 14, height: 14,
              background: runners.third ? "#f59e0b" : "transparent",
              border: `2px solid ${runners.third ? "#f59e0b" : "rgba(255,255,255,0.2)"}`,
            }} />
            {/* Home (bottom) */}
            <div style={{
              position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%) rotate(45deg)",
              width: 14, height: 14,
              background: "rgba(255,255,255,0.1)",
              border: "2px solid rgba(255,255,255,0.2)",
            }} />
          </div>
        </div>

        {/* Inning breakdown */}
        <div className="flex-1 overflow-x-auto">
          {innings.length > 0 ? (
            <table className="text-xs">
              <thead>
                <tr style={{ color: "var(--text2)" }}>
                  <th className="text-left pr-3 pb-1 font-normal" style={{ fontSize: 10 }}>Team</th>
                  {innings.map((_: unknown, i: number) => (
                    <th key={i}
                      className="text-center px-1.5 pb-1 font-normal"
                      style={{ fontSize: 10, color: i + 1 === inning ? "#ef4444" : undefined }}
                    >
                      {i + 1}
                    </th>
                  ))}
                  <th className="text-center px-2 pb-1 font-semibold" style={{ fontSize: 11, color: "var(--text0)" }}>R</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: match.home?.name ?? "Home", scores: innings.map((x: {home: number}) => x.home), total: match.home_score },
                  { name: match.away?.name ?? "Away", scores: innings.map((x: {away: number}) => x.away), total: match.away_score },
                ].map((team, ti) => (
                  <tr key={ti}>
                    <td className="pr-3 py-0.5" style={{ fontWeight: 600, color: "var(--text1)", fontSize: 11, whiteSpace: "nowrap" }}>
                      {team.name}
                    </td>
                    {team.scores.map((r: number, i: number) => (
                      <td key={i} className="text-center px-1.5 py-0.5 font-mono"
                        style={{ fontSize: 11, color: "var(--text0)" }}>
                        {r ?? 0}
                      </td>
                    ))}
                    <td className="text-center px-2 py-0.5 font-bold font-mono" style={{ fontSize: 14, color: "var(--text0)" }}>
                      {team.total ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center">
                <span style={{ fontSize: 28, fontWeight: 800, color: "var(--text0)", fontFamily: "monospace" }}>
                  {match.home_score ?? 0}
                </span>
                <span style={{ fontSize: 11, color: "var(--text1)" }}>{match.home?.name}</span>
              </div>
              <span style={{ fontSize: 18, color: "var(--text2)" }}>–</span>
              <div className="flex flex-col items-center">
                <span style={{ fontSize: 28, fontWeight: 800, color: "var(--text0)", fontFamily: "monospace" }}>
                  {match.away_score ?? 0}
                </span>
                <span style={{ fontSize: 11, color: "var(--text1)" }}>{match.away?.name}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </LivePanel>
  );
}
