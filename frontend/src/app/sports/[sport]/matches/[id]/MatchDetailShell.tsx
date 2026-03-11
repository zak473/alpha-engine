"use client";

import { cn } from "@/lib/utils";
import type { SportMatchDetail } from "@/lib/types";
import type { SportSlug } from "@/lib/api";

interface MatchDetailShellProps {
  match: SportMatchDetail;
  sport: SportSlug;
}

function fmt(n: number | null | undefined, decimals = 1) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function ProbBar({ label, prob, colour }: { label: string; prob: number; colour: string }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-xl font-bold text-text-primary">{Math.round(prob * 100)}%</div>
      <div className="w-full h-1.5 rounded-full bg-white/[0.06]">
        <div className={cn("h-full rounded-full", colour)} style={{ width: `${prob * 100}%` }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-overlay border border-surface-border rounded-xl p-5">
      <h3 className="text-text-muted text-xs uppercase tracking-widest mb-4">{title}</h3>
      {children}
    </div>
  );
}

function StatRow({ label, home, away }: { label: string; home: React.ReactNode; away: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-surface-border/40 last:border-0">
      <span className="text-text-muted text-xs w-1/3 text-right pr-4">{home}</span>
      <span className="text-text-subtle text-xs w-1/3 text-center">{label}</span>
      <span className="text-text-muted text-xs w-1/3 text-left pl-4">{away}</span>
    </div>
  );
}

// ── Tab panels ──────────────────────────────────────────────────────────────

function OverviewTab({ match }: { match: SportMatchDetail }) {
  const p = match.probabilities;
  const hasDraw = typeof p?.draw === "number" && p.draw > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Score / status */}
      <Section title="Result">
        <div className="flex items-center justify-between">
          <div className="text-right flex-1 flex flex-col items-end gap-1">
            {match.home.logo_url ? (
              <img src={match.home.logo_url} alt={match.home.name} className="w-12 h-12 rounded-full object-contain bg-white/5" />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold bg-white/[0.06] text-text-muted">
                {match.home.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="text-text-primary font-semibold text-sm">{match.home.name}</div>
            <div className="text-3xl font-bold text-text-primary tabular-nums">
              {match.home_score != null ? match.home_score : (match.status === "live" ? "–" : "—")}
            </div>
          </div>
          <div className="flex flex-col items-center px-6 gap-1">
            {match.status === "live" ? (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-green-400 text-xs font-semibold uppercase tracking-widest">Live</span>
              </div>
            ) : (
              <span className="text-text-subtle text-xs uppercase tracking-widest">vs</span>
            )}
          </div>
          <div className="text-left flex-1 flex flex-col items-start gap-1">
            {match.away.logo_url ? (
              <img src={match.away.logo_url} alt={match.away.name} className="w-12 h-12 rounded-full object-contain bg-white/5" />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold bg-white/[0.06] text-text-muted">
                {match.away.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="text-text-primary font-semibold text-sm">{match.away.name}</div>
            <div className="text-3xl font-bold text-text-primary tabular-nums">
              {match.away_score != null ? match.away_score : (match.status === "live" ? "–" : "—")}
            </div>
          </div>
        </div>
        {match.outcome && (
          <div className="mt-2 text-center">
            <span className="text-xs text-accent-blue capitalize">
              {match.outcome.replace(/_/g, " ")}
            </span>
          </div>
        )}
      </Section>

      {/* Probabilities */}
      {p && (
        <Section title="Model Probabilities">
          <div className="flex gap-4">
            <ProbBar label="Home Win" prob={p.home_win} colour="bg-accent-blue" />
            {hasDraw && <ProbBar label="Draw" prob={p.draw!} colour="bg-amber-500" />}
            <ProbBar label="Away Win" prob={p.away_win} colour="bg-accent-red" />
          </div>
          {match.confidence != null && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-text-subtle text-xs">Confidence</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
                <div
                  className={cn("h-full rounded-full", match.confidence >= 75 ? "bg-green-500" : match.confidence >= 55 ? "bg-amber-500" : "bg-white/20")}
                  style={{ width: `${match.confidence}%` }}
                />
              </div>
              <span className="text-text-muted text-xs font-mono tabular-nums">{match.confidence}%</span>
            </div>
          )}
        </Section>
      )}

      {/* Key drivers */}
      {match.key_drivers && match.key_drivers.length > 0 && (
        <Section title="Key Drivers">
          <div className="flex flex-col gap-2">
            {match.key_drivers.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-32 truncate text-text-muted text-xs">{d.feature}</div>
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-accent-blue/60" style={{ width: `${d.importance * 100}%` }} />
                </div>
                <div className="text-text-subtle text-xs font-mono tabular-nums w-10 text-right">
                  {fmt(d.importance * 100, 0)}%
                </div>
                {d.value != null && (
                  <div className="text-text-muted text-xs font-mono tabular-nums w-12 text-right">
                    {fmt(d.value, 2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function StatsTab({ match }: { match: SportMatchDetail }) {
  const sh = match.stats_home as Record<string, any> | null;
  const sa = match.stats_away as Record<string, any> | null;
  const fh = (match as any).form_home as Record<string, any> | null;
  const fa = (match as any).form_away as Record<string, any> | null;

  const homeName = match.home.name;
  const awayName = match.away.name;

  const fieldToLabel: Record<string, string> = {
    shots_total: "Shots", shots_on_target: "On Target", xg: "xG", xga: "xGA",
    possession_pct: "Possession %", passes_completed: "Passes", pass_accuracy_pct: "Pass Acc %",
    yellow_cards: "Yellow Cards", red_cards: "Red Cards", fouls: "Fouls",
    points: "Points", fg_pct: "FG%", fg3_pct: "3P%", ft_pct: "FT%",
    rebounds_total: "Rebounds", assists: "Assists", turnovers: "Turnovers",
    steals: "Steals", blocks: "Blocks", plus_minus: "+/−",
    runs: "Runs", hits: "Hits", home_runs: "HR", rbi: "RBI",
    batting_avg: "BA", obp: "OBP", slg: "SLG", ops: "OPS",
    era: "ERA", whip: "WHIP", errors: "Errors", pitcher_name: "Starting Pitcher",
  };

  const display = (v: unknown, decimals = 1) => {
    if (v == null) return "—";
    if (typeof v === "number") return v.toFixed(decimals);
    return String(v);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Actual match stats if available */}
      {(sh || sa) && (
        <Section title={`${homeName} vs ${awayName} — Match Stats`}>
          <div className="text-xs text-text-subtle mb-3 flex items-center justify-between">
            <span className="font-medium text-text-muted">{homeName}</span>
            <span className="font-medium text-text-muted">{awayName}</span>
          </div>
          {sh && Object.entries(sh)
            .filter(([k]) => !["team_id", "team_name", "is_home"].includes(k))
            .filter(([k, val]) => val != null || sa?.[k] != null)  // skip if both sides null
            .map(([key, val]) => {
              const awayVal = sa?.[key];
              const label = fieldToLabel[key] ?? key.replace(/_/g, " ");
              const dec = key.includes("pct") || key === "batting_avg" ? 3 : 1;
              return (
                <StatRow key={key} label={label} home={display(val, dec)} away={display(awayVal, dec)} />
              );
            })}
        </Section>
      )}

      {/* Pre-match form averages */}
      {(fh || fa) && (
        <Section title="Pre-Match Form (Last 5 Games)">
          <div className="text-xs text-text-subtle mb-3 flex items-center justify-between">
            <span className="font-medium text-text-muted">{homeName}</span>
            <span className="font-medium text-text-muted">{awayName}</span>
          </div>
          {fh?.wins != null && <StatRow label="W / D / L" home={`${fh.wins}W ${fh.draws}D ${fh.losses}L`} away={fa ? `${fa.wins}W ${fa.draws}D ${fa.losses}L` : "—"} />}
          {fh?.form_pts != null && <StatRow label="Form pts" home={display(fh.form_pts, 0)} away={display(fa?.form_pts, 0)} />}
          {fh?.goals_scored_avg != null && <StatRow label="Goals scored avg" home={display(fh.goals_scored_avg)} away={display(fa?.goals_scored_avg)} />}
          {fh?.goals_conceded_avg != null && <StatRow label="Goals conceded avg" home={display(fh.goals_conceded_avg)} away={display(fa?.goals_conceded_avg)} />}
          {fh?.xg_avg != null && <StatRow label="xG avg" home={display(fh.xg_avg, 2)} away={display(fa?.xg_avg, 2)} />}
          {fh?.xga_avg != null && <StatRow label="xGA avg" home={display(fh.xga_avg, 2)} away={display(fa?.xga_avg, 2)} />}
          {fh?.days_rest != null && <StatRow label="Days rest" home={display(fh.days_rest, 0)} away={display(fa?.days_rest, 0)} />}
        </Section>
      )}

      {!sh && !sa && !fh && !fa && (
        <div className="flex items-center justify-center h-40 text-text-muted text-sm">
          No stats available yet
        </div>
      )}
    </div>
  );
}

function EloTab({ match }: { match: SportMatchDetail }) {
  const elo_h = match.elo_home;
  const elo_a = match.elo_away;

  if (!elo_h && !elo_a) {
    return (
      <div className="flex items-center justify-center h-40 text-text-muted text-sm">
        No ELO data available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {[
        { elo: elo_h, label: match.home.name, side: "Home" },
        { elo: elo_a, label: match.away.name, side: "Away" },
      ].map(({ elo, label, side }) => (
        <Section key={side} title={`${side} — ${label}`}>
          {elo ? (
            <div className="flex flex-col gap-3">
              <div className="text-4xl font-bold text-text-primary tabular-nums">
                {Math.round(elo.rating)}
              </div>
              {elo.rating_change != null && (
                <div className={cn("text-sm font-medium", elo.rating_change >= 0 ? "text-green-400" : "text-accent-red")}>
                  {elo.rating_change >= 0 ? "+" : ""}{elo.rating_change} pts last match
                </div>
              )}
              <div className="text-text-subtle text-xs">Global ELO rating</div>
            </div>
          ) : (
            <div className="text-text-subtle text-sm">No rating history</div>
          )}
        </Section>
      ))}
    </div>
  );
}

function H2HTab({ match }: { match: SportMatchDetail }) {
  const h2h = match.h2h;
  if (!h2h || h2h.total_matches === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-text-muted text-sm">
        No head-to-head history found
      </div>
    );
  }

  const homeWins = h2h.home_wins ?? h2h.player_a_wins ?? h2h.team_a_wins ?? 0;
  const awayWins = h2h.away_wins ?? h2h.player_b_wins ?? h2h.team_b_wins ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Section title="All-Time Record">
        <div className="flex items-center justify-around">
          <div className="flex flex-col items-center">
            <div className="text-3xl font-bold text-text-primary">{homeWins}</div>
            <div className="text-text-muted text-xs mt-1">{match.home.name}</div>
          </div>
          {h2h.draws != null && (
            <div className="flex flex-col items-center">
              <div className="text-3xl font-bold text-text-subtle">{h2h.draws}</div>
              <div className="text-text-subtle text-xs mt-1">Draws</div>
            </div>
          )}
          <div className="flex flex-col items-center">
            <div className="text-3xl font-bold text-text-primary">{awayWins}</div>
            <div className="text-text-muted text-xs mt-1">{match.away.name}</div>
          </div>
        </div>
      </Section>

      {h2h.recent_matches.length > 0 && (
        <Section title="Recent Meetings">
          <div className="flex flex-col gap-2">
            {h2h.recent_matches.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-surface-border/40 last:border-0">
                <span className="text-text-subtle">{m.date ? new Date(m.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}</span>
                <span className="text-text-muted font-mono">
                  {m.home_score ?? "—"} – {m.away_score ?? "—"}
                </span>
                <span className={cn("font-medium capitalize", m.outcome === "home_win" || m.winner === "home" || m.winner === "team_a" || m.winner === "player_a" ? "text-accent-blue" : "text-text-muted")}>
                  {m.outcome?.replace("_", " ") ?? m.winner ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function ModelTab({ match }: { match: SportMatchDetail }) {
  if (!match.model) {
    return (
      <div className="flex items-center justify-center h-40 text-text-muted text-sm">
        No model metadata available
      </div>
    );
  }
  return (
    <Section title="Model Information">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-text-subtle text-xs">Version</span>
          <span className="text-text-muted text-xs font-mono">{match.model.version}</span>
        </div>
        {match.model.algorithm && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Algorithm</span>
            <span className="text-text-muted text-xs font-mono">{match.model.algorithm}</span>
          </div>
        )}
        {match.model.trained_at && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Trained</span>
            <span className="text-text-muted text-xs">
              {new Date(match.model.trained_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
        )}
        {match.model.n_train_samples != null && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Training samples</span>
            <span className="text-text-muted text-xs font-mono">{match.model.n_train_samples.toLocaleString()}</span>
          </div>
        )}
        {match.model.accuracy != null && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Accuracy (eval)</span>
            <span className="text-text-muted text-xs font-mono">{(match.model.accuracy * 100).toFixed(1)}%</span>
          </div>
        )}
        {match.model.brier_score != null && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Brier score</span>
            <span className="text-text-muted text-xs font-mono">{match.model.brier_score.toFixed(4)}</span>
          </div>
        )}
        {match.fair_odds && (
          <>
            <div className="border-t border-surface-border/40 pt-2 mt-2 text-text-subtle text-xs uppercase tracking-widest">Fair Odds</div>
            <div className="flex items-center justify-between">
              <span className="text-text-subtle text-xs">Home</span>
              <span className="text-text-muted text-xs font-mono">{match.fair_odds.home_win?.toFixed(2)}</span>
            </div>
            {match.fair_odds.draw != null && match.fair_odds.draw > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-text-subtle text-xs">Draw</span>
                <span className="text-text-muted text-xs font-mono">{match.fair_odds.draw.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-text-subtle text-xs">Away</span>
              <span className="text-text-muted text-xs font-mono">{match.fair_odds.away_win?.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

function ContextTab({ match }: { match: SportMatchDetail }) {
  const ctx = match.context;
  if (!ctx) {
    return (
      <div className="flex items-center justify-center h-40 text-text-muted text-sm">
        No venue or context data available
      </div>
    );
  }
  return (
    <Section title="Venue & Context">
      <div className="flex flex-col gap-2">
        {ctx.venue_name && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Venue</span>
            <span className="text-text-muted text-xs">{ctx.venue_name}{ctx.venue_city ? `, ${ctx.venue_city}` : ""}</span>
          </div>
        )}
        {ctx.attendance != null && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Attendance</span>
            <span className="text-text-muted text-xs font-mono">{ctx.attendance.toLocaleString()}</span>
          </div>
        )}
        {ctx.neutral_site && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Neutral Site</span>
            <span className="text-text-muted text-xs">Yes</span>
          </div>
        )}
        {ctx.weather_desc && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Weather</span>
            <span className="text-text-muted text-xs">{ctx.weather_desc}</span>
          </div>
        )}
        {ctx.temperature_c != null && (
          <div className="flex items-center justify-between">
            <span className="text-text-subtle text-xs">Temperature</span>
            <span className="text-text-muted text-xs">{ctx.temperature_c}°C</span>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Main shell ──────────────────────────────────────────────────────────────

export function MatchDetailShell({ match, sport }: MatchDetailShellProps) {
  return (
    <div className="flex flex-col gap-6 pb-12">
      <OverviewTab match={match} />
      <StatsTab match={match} />
      <EloTab match={match} />
      <H2HTab match={match} />
      <ModelTab match={match} />
      <ContextTab match={match} />
    </div>
  );
}
