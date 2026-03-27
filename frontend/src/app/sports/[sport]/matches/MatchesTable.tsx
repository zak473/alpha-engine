"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { SportMatchListItem } from "@/lib/types";
import type { SportSlug } from "@/lib/api";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";

interface MatchesTableProps {
  sport: SportSlug;
  matches: SportMatchListItem[];
  total: number;
  initialStatus?: string;
}

const STATUS_OPTS = [
  { value: "",          label: "All"      },
  { value: "scheduled", label: "Upcoming" },
  { value: "finished",  label: "Finished" },
  { value: "live",      label: "Live"     },
];

function statusBadge(status: string, liveClock?: string | null) {
  if (status === "live") {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <LiveBadge small />
        {liveClock && (
          <span className="font-mono text-[10px]" style={{ color: "var(--positive)" }}>
            {liveClock}
          </span>
        )}
      </div>
    );
  }
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    scheduled: { bg: "var(--info-dim)",      color: "var(--info)",     label: "Upcoming"  },
    finished:  { bg: "rgba(255,255,255,0.05)", color: "var(--text1)", label: "Finished"  },
    cancelled: { bg: "var(--negative-dim)", color: "var(--negative)", label: "Cancelled" },
  };
  const c = cfg[status] ?? cfg.finished;
  return (
    <span
      className="badge"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}30` }}
    >
      {c.label}
    </span>
  );
}

function outcomeBadge(outcome: string | null) {
  if (!outcome) return null;
  const label = outcome === "home_win" ? "H" : outcome === "away_win" ? "A" : "D";
  const color =
    outcome === "home_win" ? "var(--positive)" :
    outcome === "away_win" ? "var(--negative)" : "var(--text1)";
  return (
    <span className="font-bold text-xs ml-1 font-mono" style={{ color }}>{label}</span>
  );
}

function eloDiffChip(eloHome: number | null, eloAway: number | null) {
  if (eloHome == null || eloAway == null) return <span className="text-t2 text-xs">—</span>;
  const diff = Math.round(eloHome - eloAway);
  const positive = diff >= 0;
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-semibold tabular-nums"
      style={{
        background: positive ? "var(--positive-dim)" : "var(--negative-dim)",
        color: positive ? "var(--positive)" : "var(--negative)",
      }}
    >
      {positive ? "+" : ""}{diff}
    </span>
  );
}

function probBar(pHome: number | null, pAway: number | null) {
  if (pHome == null || pAway == null) return <span className="text-t2 text-xs">—</span>;
  const h = Math.round(pHome * 100);
  const a = Math.round(pAway * 100);
  return (
    <div className="flex flex-col gap-0.5 min-w-[88px]">
      <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div style={{ width: `${h}%`, background: "var(--info)" }} />
        <div style={{ flex: 1, background: "var(--warning)" }} />
      </div>
      <div className="flex justify-between text-[10px] font-mono tabular-nums">
        <span style={{ color: "var(--info)" }}>{h}%</span>
        <span style={{ color: "var(--warning)" }}>{a}%</span>
      </div>
    </div>
  );
}

function formatKickoff(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export function MatchesTable({ sport, matches, total, initialStatus }: MatchesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const hasLive = matches.some((m) => m.status === "live");
  const tick = useLiveRefresh(hasLive, 10_000);

  useEffect(() => {
    if (tick > 0) router.refresh();
  }, [tick, router]);

  function setStatus(val: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set("status", val); else p.delete("status");
    startTransition(() => {
      router.replace(`/sports/${sport}/matches${p.size ? `?${p}` : ""}`, { scroll: false });
    });
  }

  const currentStatus = searchParams.get("status") ?? "";

  return (
    <div className="flex flex-col gap-4">
      {/* Header + filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-t1 text-sm">
          <span className="font-mono font-semibold text-t0">{total}</span>
          <span className="ml-1">matches</span>
        </p>
        <div className="tabs-segmented">
          {STATUS_OPTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className="tab-seg-item"
              data-active={currentStatus === s.value}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {matches.length === 0 ? (
        <div
          className="flex items-center justify-center h-40 text-t1 text-sm card"
        >
          No matches found
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table" style={{ minWidth: 580 }}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Match</th>
                  <th className="hidden md:table-cell">League</th>
                  <th className="col-right hidden md:table-cell">ELO Δ</th>
                  <th className="col-right">Win Prob</th>
                  <th className="col-right hidden lg:table-cell">Odds H/A</th>
                  <th className="col-right">Score</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => {
                  const isLive = m.status === "live";
                  return (
                    <tr
                      key={m.id}
                      onClick={() => router.push(`/sports/${sport}/matches/${m.id}`)}
                      className="tr-hover"
                      style={isLive ? { borderLeft: "2px solid var(--positive)" } : undefined}
                    >
                      <td className="text-t1 text-xs whitespace-nowrap">
                        {formatKickoff(m.kickoff_utc)}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          {(m as any).home_logo ? (
                            <img src={(m as any).home_logo} alt={m.home_name} className="w-6 h-6 rounded-full object-contain bg-white/5 shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] font-bold text-t2 shrink-0">
                              {m.home_name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-t0 font-semibold text-sm leading-tight">{m.home_name}</span>
                            <div className="flex items-center gap-1.5">
                              {(m as any).away_logo ? (
                                <img src={(m as any).away_logo} alt={m.away_name} className="w-4 h-4 rounded-full object-contain bg-white/5 shrink-0" />
                              ) : null}
                              <span className="text-t1 text-xs">vs {m.away_name}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-t1 text-xs hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          {(m as any).league_logo && (
                            <img src={(m as any).league_logo} alt={m.league} className="w-4 h-4 rounded object-contain" />
                          )}
                          {m.league}
                        </div>
                      </td>
                      <td className="col-right hidden md:table-cell">{eloDiffChip(m.elo_home, m.elo_away)}</td>
                      <td className="col-right">{probBar(m.p_home, m.p_away)}</td>
                      <td className="col-right hidden lg:table-cell">
                        {(m as { odds_home?: number | null; odds_away?: number | null }).odds_home != null &&
                         (m as { odds_home?: number | null; odds_away?: number | null }).odds_away != null ? (
                          <span className="text-[11px] text-t1 font-mono tabular-nums">
                            {Number((m as { odds_home?: number }).odds_home).toFixed(2)}
                            {" / "}
                            {Number((m as { odds_away?: number }).odds_away).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-t2 text-xs">—</span>
                        )}
                      </td>
                      <td className="col-right">
                        {m.home_score != null && m.away_score != null ? (
                          <span className="font-mono text-sm font-semibold text-t0 tabular-nums">
                            {m.home_score}–{m.away_score}
                            {outcomeBadge(m.outcome)}
                          </span>
                        ) : (
                          <span className="text-t2 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-center">
                        {statusBadge(m.status, m.live_clock)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
