"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import type {
  HockeyMatchDetail as TMatch,
  HockeyEloPanelOut,
  HockeyTeamFormOut,
  HockeyTeamStatsOut,
  HockeyLineupOut,
  HockeyEventOut,
} from "@/lib/types";

// ─── Utilities ────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return n.toFixed(d);
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n * 100).toFixed(1) + "%";
}
function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return String(Math.round(n));
}
function outcomeLabel(o: string | null | undefined): string {
  if (!o) return "—";
  return o === "home_win" ? "Home Win" : o === "away_win" ? "Away Win" : "Draw";
}

// ─── Tab system ───────────────────────────────────────────────────────────────
const TABS = ["Overview", "Stats", "ELO", "Events", "Model"] as const;
type Tab = typeof TABS[number];

// ─── Panel component ──────────────────────────────────────────────────────────
function Panel({
  title,
  subtitle,
  children,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#d9e2d7] bg-white shadow-[0_12px_30px_rgba(17,19,21,0.05)]">
      {title && (
        <div className="border-b border-[#edf2ea] px-5 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#667066]">
            {title}
          </span>
          {subtitle && <p className="mt-1 text-[12px] text-[#7b857b]">{subtitle}</p>}
        </div>
      )}
      <div className={padded ? "px-5 py-5" : ""}>{children}</div>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-20 text-[#667066] text-xs text-center px-4">
      {msg}
    </div>
  );
}

// ─── Stat bar comparison ──────────────────────────────────────────────────────
function StatBar({
  label,
  homeVal,
  awayVal,
  homeDisplay,
  awayDisplay,
  lowerIsBetter = false,
}: {
  label: string;
  homeVal: number | null | undefined;
  awayVal: number | null | undefined;
  homeDisplay: string;
  awayDisplay: string;
  lowerIsBetter?: boolean;
}) {
  const h = homeVal ?? 0;
  const a = awayVal ?? 0;
  const total = h + a;
  const homePct = total > 0 ? (h / total) * 100 : 50;
  const awayPct = total > 0 ? 100 - homePct : 50;
  const homeWins = lowerIsBetter ? h <= a : h >= a;

  return (
    <div className="border-b border-[#d9e2d7] py-3 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            "text-[13px] font-mono tabular-nums font-semibold",
            homeWins ? "text-[#111315]" : "text-[#667066]"
          )}
        >
          {homeDisplay}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667066]">
          {label}
        </span>
        <span
          className={cn(
            "text-[13px] font-mono tabular-nums font-semibold",
            !homeWins ? "text-[#111315]" : "text-[#667066]"
          )}
        >
          {awayDisplay}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-[#f3f7f2]">
        <div
          className="h-full rounded-l-full"
          style={{ width: `${homePct}%`, background: "#2edb6c" }}
        />
        <div
          className="h-full rounded-r-full"
          style={{ width: `${awayPct}%`, background: "#f59e0b" }}
        />
      </div>
    </div>
  );
}

// ─── Metric row ───────────────────────────────────────────────────────────────
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#d9e2d7] py-2.5 last:border-0">
      <span className="text-[13px] text-[#667066]">{label}</span>
      <span className="text-[13px] font-mono text-[#111315] font-semibold">{value}</span>
    </div>
  );
}

// ─── Period score table ───────────────────────────────────────────────────────
function PeriodScoreTable({ match }: { match: TMatch }) {
  const hp = match.home_periods;
  const ap = match.away_periods;
  if (!hp && !ap) return null;

  const periods: string[] = ["P1", "P2", "P3"];
  if (hp?.ot != null || ap?.ot != null) periods.push("OT");
  if (hp?.so != null || ap?.so != null) periods.push("SO");

  const hVals = [
    hp?.p1,
    hp?.p2,
    hp?.p3,
    ...(periods.includes("OT") ? [hp?.ot] : []),
    ...(periods.includes("SO") ? [hp?.so] : []),
  ];
  const aVals = [
    ap?.p1,
    ap?.p2,
    ap?.p3,
    ...(periods.includes("OT") ? [ap?.ot] : []),
    ...(periods.includes("SO") ? [ap?.so] : []),
  ];

  return (
    <div className="overflow-x-auto">
      <table className="text-xs font-mono tabular-nums text-right w-full border-collapse">
        <thead>
          <tr className="text-[#667066] border-b border-[#d9e2d7]">
            <th className="text-left font-normal pr-4 py-1.5 font-sans text-[11px] uppercase tracking-[0.12em]">
              Team
            </th>
            {periods.map((p) => (
              <th key={p} className="w-10 py-1.5 text-[11px]">
                {p}
              </th>
            ))}
            <th className="pl-4 py-1.5 text-[#111315] font-semibold text-[11px]">T</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#edf2ea]">
            <td className="text-left text-[#111315] pr-4 py-1.5 font-sans font-medium text-[13px]">
              {match.home.name}
            </td>
            {hVals.map((v, i) => (
              <td key={i} className="py-1.5 text-[#667066]">
                {v ?? "—"}
              </td>
            ))}
            <td className="pl-4 py-1.5 text-[#111315] font-bold text-[14px]">
              {match.home_score ?? "—"}
            </td>
          </tr>
          <tr>
            <td className="text-left text-[#111315] pr-4 py-1.5 font-sans font-medium text-[13px]">
              {match.away.name}
            </td>
            {aVals.map((v, i) => (
              <td key={i} className="py-1.5 text-[#667066]">
                {v ?? "—"}
              </td>
            ))}
            <td className="pl-4 py-1.5 text-[#111315] font-bold text-[14px]">
              {match.away_score ?? "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Win probability bar ──────────────────────────────────────────────────────
function WinProbBar({ match }: { match: TMatch }) {
  const p = match.probabilities;
  if (!p) return null;
  const ph = Math.round(p.home_win * 100);
  const pa = Math.round(p.away_win * 100);
  const pd = Math.max(0, 100 - ph - pa);

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-[13px] font-semibold text-[#111315]">
        <span className="truncate max-w-[38%]">{match.home.name}</span>
        <span className="text-[11px] font-medium text-[#667066]">Win Probability</span>
        <span className="truncate max-w-[38%] text-right">{match.away.name}</span>
      </div>
      <div className="flex h-6 rounded-full overflow-hidden gap-0.5">
        {ph > 0 && (
          <div
            className="flex items-center justify-center text-[10px] font-bold text-white rounded-l-full"
            style={{ width: `${ph}%`, background: "#2edb6c" }}
          >
            {ph > 8 ? `${ph}%` : ""}
          </div>
        )}
        {pd > 0 && (
          <div
            className="flex items-center justify-center text-[10px] font-bold text-white"
            style={{ width: `${pd}%`, background: "#94a3b8" }}
          >
            {pd > 8 ? `${pd}%` : ""}
          </div>
        )}
        {pa > 0 && (
          <div
            className="flex items-center justify-center text-[10px] font-bold text-white rounded-r-full"
            style={{ width: `${pa}%`, background: "#f59e0b" }}
          >
            {pa > 8 ? `${pa}%` : ""}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[12px] text-[#667066]">
        <span className="font-semibold text-[#2edb6c]">{ph}%</span>
        {pd > 0 && <span className="text-[#94a3b8]">{pd}% draw</span>}
        <span className="font-semibold text-[#f59e0b]">{pa}%</span>
      </div>
    </div>
  );
}

// ─── Key drivers ──────────────────────────────────────────────────────────────
function KeyDrivers({ match }: { match: TMatch }) {
  if (!match.key_drivers?.length) return null;
  return (
    <div className="space-y-3">
      {match.key_drivers.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-[12px] mb-1">
              <span className="text-[#667066] capitalize">
                {d.feature.replace(/_/g, " ")}
              </span>
              <span className="text-[#111315] font-mono">
                {d.value != null ? fmt(d.value) : ""}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#f3f7f2] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round(d.importance * 100)}%`,
                  background: "#2edb6c",
                }}
              />
            </div>
          </div>
          <span className="text-[11px] text-[#667066] w-8 text-right">
            {Math.round(d.importance * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── H2H panel ────────────────────────────────────────────────────────────────
function H2HPanel({ match }: { match: TMatch }) {
  const h2h = match.h2h;
  if (!h2h || h2h.total_matches === 0) return <EmptyState msg="No head-to-head history found." />;
  const total = h2h.total_matches;
  const hwPct = total > 0 ? Math.round((h2h.home_wins / total) * 100) : 0;
  const awPct = total > 0 ? Math.round((h2h.away_wins / total) * 100) : 0;
  const drawPct = 100 - hwPct - awPct;

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-[13px] text-[#667066]">
        <span className="font-semibold text-[#111315]">{match.home.name}</span>
        <span>{total} games</span>
        <span className="font-semibold text-[#111315]">{match.away.name}</span>
      </div>
      <div className="flex h-5 rounded-full overflow-hidden text-[9px] font-bold text-white gap-0.5">
        {hwPct > 0 && (
          <div
            className="flex items-center justify-center rounded-l-full"
            style={{ width: `${hwPct}%`, background: "#2edb6c" }}
          >
            {hwPct > 10 ? `${hwPct}%` : ""}
          </div>
        )}
        {drawPct > 0 && (
          <div
            className="flex items-center justify-center"
            style={{ width: `${drawPct}%`, background: "#94a3b8" }}
          >
            {drawPct > 10 ? `${drawPct}%` : ""}
          </div>
        )}
        {awPct > 0 && (
          <div
            className="flex items-center justify-center rounded-r-full"
            style={{ width: `${awPct}%`, background: "#f59e0b" }}
          >
            {awPct > 10 ? `${awPct}%` : ""}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[12px] text-[#667066]">
        <span className="text-[#2edb6c] font-semibold">{h2h.home_wins}W</span>
        <span>{total - h2h.home_wins - h2h.away_wins}D</span>
        <span className="text-[#f59e0b] font-semibold">{h2h.away_wins}W</span>
      </div>
      {h2h.recent_matches.length > 0 && (
        <div className="space-y-1 pt-1">
          {h2h.recent_matches.slice(0, 5).map((m: any, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between text-[12px] text-[#667066] py-1.5 border-b border-[#edf2ea] last:border-0"
            >
              <span className="text-[11px] text-[#667066] w-20 shrink-0">
                {m.date
                  ? new Date(m.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "2-digit",
                    })
                  : "—"}
              </span>
              <span className="font-mono tabular-nums text-[#111315] font-semibold">
                {m.home_score ?? "?"} – {m.away_score ?? "?"}
              </span>
              <span
                className={cn(
                  "text-[11px] w-16 text-right font-semibold",
                  m.outcome === "home_win"
                    ? "text-[#2edb6c]"
                    : m.outcome === "away_win"
                    ? "text-[#f59e0b]"
                    : "text-[#667066]"
                )}
              >
                {m.outcome === "home_win"
                  ? match.home.name.split(" ").pop()
                  : m.outcome === "away_win"
                  ? match.away.name.split(" ").pop()
                  : "Draw"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Odds panel ───────────────────────────────────────────────────────────────
function OddsPanel({ match }: { match: TMatch }) {
  const hasOdds = match.odds_home != null || match.odds_away != null;
  if (!hasOdds) return <EmptyState msg="Live odds not available." />;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#d9e2d7] bg-[#f7f8f5] px-4 py-3 gap-1">
        <span className="text-[11px] text-[#667066]">{match.home.name}</span>
        <span className="text-[22px] font-black font-mono tabular-nums text-[#111315]">
          {fmt(match.odds_home, 2)}
        </span>
        {match.fair_odds?.home_win && (
          <span className="text-[11px] text-[#667066]">
            Fair: {fmt(match.fair_odds.home_win, 2)}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#d9e2d7] bg-[#f7f8f5] px-4 py-3 gap-1">
        <span className="text-[11px] text-[#667066]">{match.away.name}</span>
        <span className="text-[22px] font-black font-mono tabular-nums text-[#111315]">
          {fmt(match.odds_away, 2)}
        </span>
        {match.fair_odds?.away_win && (
          <span className="text-[11px] text-[#667066]">
            Fair: {fmt(match.fair_odds.away_win, 2)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ELO chart ────────────────────────────────────────────────────────────────
function EloChart({
  homeName,
  awayName,
  eloHomeHistory,
  eloAwayHistory,
}: {
  homeName: string;
  awayName: string;
  eloHomeHistory: Array<{ date: string; rating: number }>;
  eloAwayHistory: Array<{ date: string; rating: number }>;
}) {
  const n = Math.max(eloHomeHistory.length, eloAwayHistory.length);
  if (n === 0) return <EmptyState msg="ELO history not available." />;

  const data = Array.from(
    { length: Math.max(eloHomeHistory.length, eloAwayHistory.length) },
    (_, i) => ({
      i: i + 1,
      home: eloHomeHistory[i]?.rating ?? null,
      away: eloAwayHistory[i]?.rating ?? null,
    })
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#edf2ea" />
        <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#667066" }} />
        <YAxis tick={{ fontSize: 10, fill: "#667066" }} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #d9e2d7",
            borderRadius: 12,
            fontSize: 12,
            boxShadow: "0 4px 12px rgba(17,19,21,0.08)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#667066" }} />
        <Line
          type="monotone"
          dataKey="home"
          name={homeName}
          stroke="#2edb6c"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="away"
          name={awayName}
          stroke="#f59e0b"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Events feed ──────────────────────────────────────────────────────────────
function EventTypeIcon({ type }: { type: string | null | undefined }) {
  const t = (type || "").toLowerCase();
  if (t === "goal" || t === "shootout_goal")
    return <span className="text-[#2edb6c] font-bold text-sm">⬤</span>;
  if (t.includes("penalty")) return <span className="text-[#f59e0b] text-sm">⬛</span>;
  if (t === "fight") return <span className="text-red-500 text-sm">✕</span>;
  return <span className="text-[#667066] text-sm">·</span>;
}

function EventsFeed({
  events,
  homeName,
  awayName,
}: {
  events: HockeyEventOut[];
  homeName: string;
  awayName: string;
}) {
  const allEvents = events.filter(
    (e) => !["period_start", "period_end"].includes(e.type || "")
  );
  if (!allEvents.length)
    return <EmptyState msg="No events yet. Available during and after games." />;
  return (
    <div className="space-y-0.5">
      {allEvents.map((ev, i) => {
        const isHome = ev.team === "home";
        return (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 py-2.5 border-b border-[#edf2ea] last:border-0",
              isHome ? "flex-row" : "flex-row-reverse"
            )}
          >
            <div
              className={cn(
                "flex items-center gap-1.5 shrink-0",
                isHome ? "justify-start" : "justify-end"
              )}
            >
              <EventTypeIcon type={ev.type} />
              {ev.period && (
                <span className="text-[10px] text-[#667066]">P{ev.period}</span>
              )}
            </div>
            <div className={cn("flex-1 min-w-0", isHome ? "text-left" : "text-right")}>
              <div
                className="flex items-baseline gap-1.5 flex-wrap"
                style={{ justifyContent: isHome ? "flex-start" : "flex-end" }}
              >
                {ev.player_name && (
                  <span className="text-[13px] text-[#111315] font-semibold">
                    {ev.player_name}
                  </span>
                )}
                {ev.assist1 && (
                  <span className="text-[11px] text-[#667066]">
                    ({ev.assist1}
                    {ev.assist2 ? `, ${ev.assist2}` : ""})
                  </span>
                )}
              </div>
              {ev.description && !ev.player_name && (
                <div className="text-[11px] text-[#667066]">{ev.description}</div>
              )}
              {ev.time && (
                <div className="text-[10px] text-[#667066]">{ev.time}</div>
              )}
            </div>
            {ev.score_home != null && ev.score_away != null && (
              <div className="text-[11px] font-mono text-[#111315] font-semibold shrink-0 tabular-nums">
                {ev.score_home}–{ev.score_away}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Lineup panel ─────────────────────────────────────────────────────────────
function LineupSide({
  lineup,
  isHome,
}: {
  lineup: HockeyLineupOut | null | undefined;
  isHome: boolean;
}) {
  if (!lineup)
    return (
      <div className="text-[#667066] text-[12px] text-center py-4">No lineup data</div>
    );
  const goalies = lineup.players.filter((p) => p.is_goalie);
  const skaters = lineup.players.filter((p) => !p.is_goalie && p.is_starter);
  const align = isHome ? "text-left" : "text-right";
  return (
    <div className={cn("space-y-3", align)}>
      {goalies.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#667066] mb-1.5 font-semibold">
            Goalie
          </div>
          {goalies.map((p, i) => (
            <div key={i} className="text-[12px] text-[#111315]">
              {p.number && (
                <span className="font-mono text-[#667066] mr-1.5">#{p.number}</span>
              )}
              {p.name}
            </div>
          ))}
        </div>
      )}
      {skaters.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#667066] mb-1.5 font-semibold">
            Skaters
          </div>
          {skaters.map((p, i) => (
            <div key={i} className="text-[12px] text-[#111315]">
              {p.number && (
                <span className="font-mono text-[#667066] mr-1.5">#{p.number}</span>
              )}
              {p.name}
              {p.position && (
                <span className="text-[10px] text-[#667066] ml-1">{p.position}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LineupPanel({
  home,
  away,
  homeName,
  awayName,
}: {
  home: HockeyLineupOut | null | undefined;
  away: HockeyLineupOut | null | undefined;
  homeName: string;
  awayName: string;
}) {
  if (!home && !away)
    return <EmptyState msg="Lineups available closer to puck drop." />;
  return (
    <div className="grid grid-cols-2 gap-4 divide-x divide-[#edf2ea]">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667066] mb-3">
          {homeName}
        </div>
        <LineupSide lineup={home} isHome />
      </div>
      <div className="pl-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667066] mb-3 text-right">
          {awayName}
        </div>
        <LineupSide lineup={away} isHome={false} />
      </div>
    </div>
  );
}

// ─── Form streak pills ─────────────────────────────────────────────────────────
function FormPills({ form }: { form: HockeyTeamFormOut | null | undefined }) {
  if (!form) return null;
  const total = (form.wins ?? 0) + (form.losses ?? 0);
  if (total === 0) return null;
  const pills = [];
  for (let i = 0; i < Math.min(form.wins ?? 0, 5); i++)
    pills.push({ key: `w${i}`, type: "W" });
  for (let i = 0; i < Math.min(form.losses ?? 0, 5 - pills.length); i++)
    pills.push({ key: `l${i}`, type: "L" });
  return (
    <div className="flex gap-1">
      {pills.map((p) => (
        <span
          key={p.key}
          className={cn(
            "inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold",
            p.type === "W"
              ? "bg-[#dcfce7] text-[#16a34a]"
              : "bg-[#fee2e2] text-[#dc2626]"
          )}
        >
          {p.type}
        </span>
      ))}
    </div>
  );
}

// ─── Hero team block ───────────────────────────────────────────────────────────
function HeroTeamBlock({
  name,
  elo,
  form,
  isHome,
}: {
  name: string;
  elo: HockeyEloPanelOut | null | undefined;
  form: HockeyTeamFormOut | null | undefined;
  isHome: boolean;
}) {
  const align = isHome ? "items-end text-right" : "items-start text-left";
  return (
    <div className={cn("flex flex-col gap-2", align)}>
      {/* Team logo placeholder */}
      <div className="w-16 h-16 rounded-[18px] bg-white/10 border border-white/10 flex items-center justify-center">
        <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">
          {name.slice(0, 3)}
        </span>
      </div>
      <div className="text-[28px] md:text-[36px] font-semibold text-white leading-tight">
        {name}
      </div>
      {elo && (
        <div className={cn("flex items-center gap-2", isHome ? "flex-row-reverse" : "flex-row")}>
          {elo.rating_change != null && (
            <span
              className={cn(
                "text-[12px] font-mono font-semibold",
                elo.rating_change >= 0 ? "text-[#2edb6c]" : "text-red-400"
              )}
            >
              {elo.rating_change >= 0 ? "+" : ""}
              {fmt(elo.rating_change, 1)}
            </span>
          )}
          <span className="text-[#2edb6c] font-mono text-[22px] font-bold">
            {fmtInt(elo.rating)}
          </span>
        </div>
      )}
      <FormPills form={form} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  match: TMatch;
  eloHomeHistory: Array<{ date: string; rating: number; match_id?: string | null }>;
  eloAwayHistory: Array<{ date: string; rating: number; match_id?: string | null }>;
}

export function HockeyMatchDetail({ match: initialMatch, eloHomeHistory, eloAwayHistory }: Props) {
  const match = initialMatch;
  const router = useRouter();
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const tick = useLiveRefresh(isLive);
  useEffect(() => {
    if (tick > 0) router.refresh();
  }, [tick, router]);

  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const homeScore = match.home_score ?? (isLive || isFinished ? 0 : null);
  const awayScore = match.away_score ?? (isLive || isFinished ? 0 : null);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col gap-4 bg-[#f3f7f2] px-3 py-4 md:px-4 md:py-5">

      {/* ── Hero card ── */}
      <div className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,21,16,0.98),rgba(6,12,9,0.99))] shadow-[0_24px_60px_rgba(0,0,0,0.32)] overflow-hidden p-6 lg:p-8">

        {/* Top row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/sports/hockey/matches"
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white/8 border border-white/10 text-white/60 hover:text-white hover:bg-white/12 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            {match.league && (
              <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {match.league}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLive ? (
              <div className="flex items-center gap-1.5 rounded-full border border-[#2edb6c]/30 bg-[#2edb6c]/10 px-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2edb6c] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2edb6c]" />
                </span>
                <span className="text-[#2edb6c] text-[11px] font-semibold uppercase tracking-[0.14em]">
                  Live
                </span>
              </div>
            ) : (
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                  isFinished
                    ? "border-white/10 bg-white/8 text-white/50"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-400"
                )}
              >
                {isFinished ? "Final" : "Upcoming"}
              </span>
            )}
          </div>
        </div>

        {/* Teams + score */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
          {/* Home team */}
          <HeroTeamBlock
            name={match.home.name}
            elo={match.elo_home}
            form={match.form_home}
            isHome
          />

          {/* Center score */}
          <div className="flex flex-col items-center gap-2">
            <div
              className={cn(
                "text-[72px] font-semibold tracking-[-0.05em] tabular-nums leading-none",
                isLive
                  ? "text-[#2edb6c]"
                  : isFinished
                  ? "text-white"
                  : "text-white/40"
              )}
            >
              {homeScore != null && awayScore != null
                ? `${homeScore} – ${awayScore}`
                : "vs"}
            </div>
            {isLive && match.current_period != null && (
              <div className="text-[13px] text-[#2edb6c]/80 font-semibold">
                Period {match.current_period}
                {match.live_clock && ` · ${match.live_clock}`}
              </div>
            )}
            {!isLive && !isFinished && (
              <div className="text-[13px] text-white/50">
                {new Date(match.kickoff_utc).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
            {isFinished && match.outcome && (
              <div className="text-[12px] text-white/40 font-semibold">
                {outcomeLabel(match.outcome)}
              </div>
            )}
          </div>

          {/* Away team */}
          <div className="flex justify-end">
            <HeroTeamBlock
              name={match.away.name}
              elo={match.elo_away}
              form={match.form_away}
              isHome={false}
            />
          </div>
        </div>

        {/* Win probability bar */}
        {match.probabilities && (
          <div className="mt-6 pt-5 border-t border-white/8">
            <WinProbBar match={match} />
          </div>
        )}

        {/* Period score + meta */}
        {(match.home_periods || match.away_periods) && (
          <div className="mt-5 pt-4 border-t border-white/8 [&_table]:text-white/70 [&_th]:text-white/40 [&_td]:text-white/60 [&_.font-bold]:text-white">
            <PeriodScoreTable match={match} />
          </div>
        )}

        {/* Bottom pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {match.season && (
            <span className="rounded-full border border-white/8 bg-white/6 px-3 py-1 text-[11px] text-white/50">
              {match.season}
            </span>
          )}
          {match.context?.venue_name && (
            <span className="rounded-full border border-white/8 bg-white/6 px-3 py-1 text-[11px] text-white/50">
              {match.context.venue_name}
            </span>
          )}
          {match.confidence != null && (
            <span className="rounded-full border border-white/8 bg-white/6 px-3 py-1 text-[11px] text-white/50">
              Confidence: {match.confidence}%
            </span>
          )}
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {match.elo_home && (
          <div className="rounded-[20px] border border-[#d9e2d7] bg-[#f7f8f5] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667066] mb-1">
              {match.home.name} ELO
            </div>
            <div className="text-[22px] font-bold font-mono text-[#2edb6c]">
              {fmtInt(match.elo_home.rating)}
            </div>
            {match.elo_home.rating_change != null && (
              <div
                className={cn(
                  "text-[12px] font-mono",
                  match.elo_home.rating_change >= 0 ? "text-[#2edb6c]" : "text-red-500"
                )}
              >
                {match.elo_home.rating_change >= 0 ? "+" : ""}
                {fmt(match.elo_home.rating_change, 1)}
              </div>
            )}
          </div>
        )}
        {match.elo_away && (
          <div className="rounded-[20px] border border-[#d9e2d7] bg-[#f7f8f5] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667066] mb-1">
              {match.away.name} ELO
            </div>
            <div className="text-[22px] font-bold font-mono text-[#f59e0b]">
              {fmtInt(match.elo_away.rating)}
            </div>
            {match.elo_away.rating_change != null && (
              <div
                className={cn(
                  "text-[12px] font-mono",
                  match.elo_away.rating_change >= 0 ? "text-[#2edb6c]" : "text-red-500"
                )}
              >
                {match.elo_away.rating_change >= 0 ? "+" : ""}
                {fmt(match.elo_away.rating_change, 1)}
              </div>
            )}
          </div>
        )}
        {match.odds_home != null && (
          <div className="rounded-[20px] border border-[#d9e2d7] bg-[#f7f8f5] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667066] mb-1">
              Home Odds
            </div>
            <div className="text-[22px] font-bold font-mono text-[#111315]">
              {fmt(match.odds_home, 2)}
            </div>
            {match.fair_odds?.home_win && (
              <div className="text-[12px] text-[#667066]">
                Fair: {fmt(match.fair_odds.home_win, 2)}
              </div>
            )}
          </div>
        )}
        {match.odds_away != null && (
          <div className="rounded-[20px] border border-[#d9e2d7] bg-[#f7f8f5] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#667066] mb-1">
              Away Odds
            </div>
            <div className="text-[22px] font-bold font-mono text-[#111315]">
              {fmt(match.odds_away, 2)}
            </div>
            {match.fair_odds?.away_win && (
              <div className="text-[12px] text-[#667066]">
                Fair: {fmt(match.fair_odds.away_win, 2)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="sticky top-2 z-20">
        <div className="overflow-x-auto no-scrollbar rounded-[24px] border border-[#d9e2d7] bg-white p-2 shadow-[0_10px_24px_rgba(17,19,21,0.06)]">
          <div className="flex min-w-max items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2.5 text-[12px] font-semibold transition-all",
                  activeTab === t
                    ? "bg-[#111315] text-white shadow-sm"
                    : "border border-transparent bg-[#f7f8f5] text-[#667066] hover:border-[#d9e2d7] hover:bg-white hover:text-[#111315]"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Overview tab ── */}
      {activeTab === "Overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Main col */}
          <div className="lg:col-span-8 flex flex-col gap-4">

            {/* Win probability + key drivers */}
            {match.probabilities && (
              <Panel title="Win Probability">
                <WinProbBar match={match} />
                {match.key_drivers?.length ? (
                  <div className="mt-5 pt-4 border-t border-[#edf2ea]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#667066] mb-3">
                      Key Drivers
                    </div>
                    <KeyDrivers match={match} />
                  </div>
                ) : null}
              </Panel>
            )}

            {/* H2H */}
            <Panel title="Head-to-Head">
              <H2HPanel match={match} />
            </Panel>

            {/* Recent form */}
            <Panel title="Recent Form">
              <div>
                <div className="flex justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667066] mb-3 px-1">
                  <span className="w-[38%] text-right">{match.home.name}</span>
                  <span className="w-[24%] text-center" />
                  <span className="w-[38%] text-left">{match.away.name}</span>
                </div>
                {[
                  {
                    label: "Record",
                    home: match.form_home
                      ? `${match.form_home.wins}W–${match.form_home.losses}L`
                      : "—",
                    away: match.form_away
                      ? `${match.form_away.wins}W–${match.form_away.losses}L`
                      : "—",
                  },
                  {
                    label: "Goals/G",
                    home: fmt(match.form_home?.goals_scored_avg),
                    away: fmt(match.form_away?.goals_scored_avg),
                  },
                  {
                    label: "GA/G",
                    home: fmt(match.form_home?.goals_conceded_avg),
                    away: fmt(match.form_away?.goals_conceded_avg),
                  },
                  {
                    label: "Form Pts",
                    home: fmtInt(match.form_home?.form_pts),
                    away: fmtInt(match.form_away?.form_pts),
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between py-2 border-b border-[#d9e2d7] last:border-0"
                  >
                    <span className="text-[13px] font-mono tabular-nums font-semibold text-[#111315] w-[38%] text-right">
                      {row.home}
                    </span>
                    <span className="text-[11px] text-[#667066] w-[24%] text-center">
                      {row.label}
                    </span>
                    <span className="text-[13px] font-mono tabular-nums font-semibold text-[#111315] w-[38%] text-left">
                      {row.away}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

          </div>

          {/* Side col */}
          <div className="lg:col-span-4 flex flex-col gap-4">

            {/* Odds */}
            <Panel title="Odds">
              <OddsPanel match={match} />
            </Panel>

            {/* Lineup */}
            <Panel title="Lineup">
              <LineupPanel
                home={match.lineup_home}
                away={match.lineup_away}
                homeName={match.home.name}
                awayName={match.away.name}
              />
            </Panel>

          </div>
        </div>
      )}

      {/* ── Stats tab ── */}
      {activeTab === "Stats" && (
        <Panel title="Team Stats" subtitle="Live stats available during and after games.">
          {!match.stats_home && !match.stats_away ? (
            <EmptyState msg="Live stats available during and after games." />
          ) : (
            <div>
              <div className="flex justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667066] mb-1 px-1">
                <span>{match.home.name}</span>
                <span />
                <span>{match.away.name}</span>
              </div>
              <StatBar
                label="Shots"
                homeVal={match.stats_home?.shots}
                awayVal={match.stats_away?.shots}
                homeDisplay={fmtInt(match.stats_home?.shots)}
                awayDisplay={fmtInt(match.stats_away?.shots)}
              />
              <StatBar
                label="SOG"
                homeVal={match.stats_home?.shots_on_goal}
                awayVal={match.stats_away?.shots_on_goal}
                homeDisplay={fmtInt(match.stats_home?.shots_on_goal)}
                awayDisplay={fmtInt(match.stats_away?.shots_on_goal)}
              />
              <StatBar
                label="Hits"
                homeVal={match.stats_home?.hits}
                awayVal={match.stats_away?.hits}
                homeDisplay={fmtInt(match.stats_home?.hits)}
                awayDisplay={fmtInt(match.stats_away?.hits)}
              />
              <StatBar
                label="Blocked"
                homeVal={match.stats_home?.blocked_shots}
                awayVal={match.stats_away?.blocked_shots}
                homeDisplay={fmtInt(match.stats_home?.blocked_shots)}
                awayDisplay={fmtInt(match.stats_away?.blocked_shots)}
              />
              <StatBar
                label="FO Wins"
                homeVal={match.stats_home?.faceoff_wins}
                awayVal={match.stats_away?.faceoff_wins}
                homeDisplay={fmtInt(match.stats_home?.faceoff_wins)}
                awayDisplay={fmtInt(match.stats_away?.faceoff_wins)}
              />
              <StatBar
                label="FO %"
                homeVal={match.stats_home?.faceoff_pct}
                awayVal={match.stats_away?.faceoff_pct}
                homeDisplay={
                  match.stats_home?.faceoff_pct != null
                    ? fmtInt(match.stats_home.faceoff_pct) + "%"
                    : "—"
                }
                awayDisplay={
                  match.stats_away?.faceoff_pct != null
                    ? fmtInt(match.stats_away.faceoff_pct) + "%"
                    : "—"
                }
              />
              <StatBar
                label="PIM"
                homeVal={match.stats_home?.penalty_minutes}
                awayVal={match.stats_away?.penalty_minutes}
                homeDisplay={fmtInt(match.stats_home?.penalty_minutes)}
                awayDisplay={fmtInt(match.stats_away?.penalty_minutes)}
                lowerIsBetter
              />
              {/* Power play as metric rows */}
              <div className="mt-2 pt-2 border-t border-[#edf2ea]">
                <div className="flex justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667066] mb-2">
                  <span>Power Play</span>
                </div>
                {[
                  {
                    label: `${match.home.name} PP`,
                    value:
                      match.stats_home?.power_plays != null &&
                      match.stats_home?.power_play_goals != null
                        ? `${match.stats_home.power_play_goals}/${match.stats_home.power_plays}`
                        : "—",
                  },
                  {
                    label: `${match.away.name} PP`,
                    value:
                      match.stats_away?.power_plays != null &&
                      match.stats_away?.power_play_goals != null
                        ? `${match.stats_away.power_play_goals}/${match.stats_away.power_plays}`
                        : "—",
                  },
                ].map((r) => (
                  <MetricRow key={r.label} label={r.label} value={r.value} />
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* ── ELO tab ── */}
      {activeTab === "ELO" && (
        <div className="flex flex-col gap-4">
          <Panel title="ELO History">
            <EloChart
              homeName={match.home.name}
              awayName={match.away.name}
              eloHomeHistory={eloHomeHistory}
              eloAwayHistory={eloAwayHistory}
            />
          </Panel>
          <div className="grid grid-cols-2 gap-4">
            {match.elo_home && (
              <Panel title={`${match.home.name} ELO`}>
                <div className="text-[32px] font-bold font-mono text-[#2edb6c]">
                  {fmtInt(match.elo_home.rating)}
                </div>
                {match.elo_home.rating_change != null && (
                  <div
                    className={cn(
                      "text-[14px] font-mono mt-1",
                      match.elo_home.rating_change >= 0 ? "text-[#2edb6c]" : "text-red-500"
                    )}
                  >
                    {match.elo_home.rating_change >= 0 ? "▲ +" : "▼ "}
                    {fmt(Math.abs(match.elo_home.rating_change), 1)}
                  </div>
                )}
              </Panel>
            )}
            {match.elo_away && (
              <Panel title={`${match.away.name} ELO`}>
                <div className="text-[32px] font-bold font-mono text-[#f59e0b]">
                  {fmtInt(match.elo_away.rating)}
                </div>
                {match.elo_away.rating_change != null && (
                  <div
                    className={cn(
                      "text-[14px] font-mono mt-1",
                      match.elo_away.rating_change >= 0 ? "text-[#2edb6c]" : "text-red-500"
                    )}
                  >
                    {match.elo_away.rating_change >= 0 ? "▲ +" : "▼ "}
                    {fmt(Math.abs(match.elo_away.rating_change), 1)}
                  </div>
                )}
              </Panel>
            )}
          </div>
        </div>
      )}

      {/* ── Events tab ── */}
      {activeTab === "Events" && (
        <Panel title="Game Events">
          <EventsFeed
            events={match.events ?? []}
            homeName={match.home.name}
            awayName={match.away.name}
          />
        </Panel>
      )}

      {/* ── Model tab ── */}
      {activeTab === "Model" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 flex flex-col gap-4">
            {match.probabilities && (
              <Panel title="Model Probabilities">
                <WinProbBar match={match} />
                {match.key_drivers?.length ? (
                  <div className="mt-5 pt-4 border-t border-[#edf2ea]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#667066] mb-3">
                      Feature Importances
                    </div>
                    <KeyDrivers match={match} />
                  </div>
                ) : null}
              </Panel>
            )}
            {!match.probabilities && !match.model && (
              <Panel title="Model">
                <EmptyState msg="No model output available for this match." />
              </Panel>
            )}
          </div>
          <div className="lg:col-span-4 flex flex-col gap-4">
            {match.model && (
              <Panel title="Model Info">
                <div className="space-y-0.5">
                  <MetricRow label="Version" value={match.model.version} />
                  {match.model.algorithm && (
                    <MetricRow label="Algorithm" value={match.model.algorithm} />
                  )}
                  {match.model.accuracy != null && (
                    <MetricRow label="Accuracy" value={fmtPct(match.model.accuracy)} />
                  )}
                  {match.model.brier_score != null && (
                    <MetricRow
                      label="Brier Score"
                      value={fmt(match.model.brier_score, 3)}
                    />
                  )}
                </div>
              </Panel>
            )}
            {match.confidence != null && (
              <Panel title="Prediction Confidence">
                <div className="text-[40px] font-bold font-mono text-[#111315]">
                  {match.confidence}%
                </div>
                <div className="mt-2">
                  <div className="h-2.5 rounded-full bg-[#f3f7f2] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${match.confidence}%`,
                        background: "#2edb6c",
                      }}
                    />
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
