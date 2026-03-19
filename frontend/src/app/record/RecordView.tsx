"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Clock, CheckCircle2, XCircle, MinusCircle, Plus, X, Search, ClipboardList, PenLine } from "lucide-react";
import Link from "next/link";
import { getPicks, getPicksStats, deletePick, settlePick, trackPicks, getSportMatches } from "@/lib/api";
import type { PickOut, PicksStatsOut, PickCreate } from "@/lib/api";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SPORT_COLOURS: Record<string, string> = {
  soccer:     "#3b82f6",
  tennis:     "#22c55e",
  esports:    "#a855f7",
  basketball: "#f59e0b",
  baseball:   "#ef4444",
  hockey:     "#06b6d4",
};

const SPORT_ICONS: Record<string, string> = {
  soccer: "⚽", tennis: "🎾", esports: "🎮",
  basketball: "🏀", baseball: "⚾", hockey: "🏒",
};

// ── Outcome badge ─────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: PickOut["outcome"] }) {
  if (!outcome) return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/40">
      <Clock size={9} /> Pending
    </span>
  );
  if (outcome === "won") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
      <CheckCircle2 size={9} /> Won
    </span>
  );
  if (outcome === "lost") return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
      <XCircle size={9} /> Lost
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/40">
      <MinusCircle size={9} /> Void
    </span>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: PicksStatsOut }) {
  const roiPos = stats.roi >= 0;
  const winPos = stats.win_rate >= 0.55;
  const clvPos = stats.avg_clv != null && stats.avg_clv > 0;

  const roiStr = stats.total > 0
    ? `${stats.roi >= 0 ? "+" : ""}${(stats.roi * 100).toFixed(1)}%`
    : "—";
  const winStr = stats.settled > 0 ? `${(stats.win_rate * 100).toFixed(0)}%` : "—";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 px-4 pt-4 pb-2 lg:px-6">
      {/* Win rate */}
      <div className={cn(
        "relative overflow-hidden rounded-[20px] border p-4",
        winPos
          ? "border-emerald-400/20 bg-[linear-gradient(135deg,rgba(52,211,153,0.10),rgba(52,211,153,0.03))]"
          : "border-white/[0.08] bg-white/[0.03]"
      )}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Win Rate</p>
        <p className={cn("mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none", winPos ? "text-emerald-300" : "text-white/60")}>
          {winStr}
        </p>
        <p className="mt-1 text-[10px] text-white/28">{stats.won}W · {stats.lost}L · {stats.void}V</p>
      </div>

      {/* ROI */}
      <div className={cn(
        "relative overflow-hidden rounded-[20px] border p-4",
        roiPos
          ? "border-emerald-400/20 bg-[linear-gradient(135deg,rgba(52,211,153,0.10),rgba(52,211,153,0.03))]"
          : "border-red-400/20 bg-[linear-gradient(135deg,rgba(248,113,113,0.08),rgba(248,113,113,0.02))]"
      )}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">ROI</p>
        <p className={cn("mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none", roiPos ? "text-emerald-300" : "text-red-400")}>
          {roiStr}
        </p>
        <p className="mt-1 text-[10px] text-white/28">flat stake</p>
      </div>

      {/* Total */}
      <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Total</p>
        <p className="mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none text-white">
          {stats.total}
        </p>
        <p className="mt-1 text-[10px] text-white/28">{stats.settled} settled</p>
      </div>

      {/* Avg odds */}
      <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Avg Odds</p>
        <p className="mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none text-white">
          {stats.avg_odds > 0 ? stats.avg_odds.toFixed(2) : "—"}
        </p>
        <p className="mt-1 text-[10px] text-white/28">decimal</p>
      </div>

      {/* Pending */}
      <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Pending</p>
        <p className="mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none text-white">
          {stats.pending}
        </p>
        <p className="mt-1 text-[10px] text-white/28">open bets</p>
      </div>

      {/* Avg CLV */}
      <div className={cn(
        "rounded-[20px] border p-4",
        clvPos
          ? "border-emerald-400/20 bg-[linear-gradient(135deg,rgba(52,211,153,0.08),rgba(52,211,153,0.02))]"
          : "border-white/[0.08] bg-white/[0.03]"
      )}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Avg CLV</p>
        <p className={cn("mt-1.5 font-mono text-[26px] font-bold tabular-nums leading-none", clvPos ? "text-emerald-300" : "text-white/60")}>
          {stats.avg_clv != null
            ? `${stats.avg_clv >= 0 ? "+" : ""}${(stats.avg_clv * 100).toFixed(1)}%`
            : "—"}
        </p>
        <p className="mt-1 text-[10px] text-white/28">closing line</p>
      </div>
    </div>
  );
}

// ── Settle buttons (for pending picks) ────────────────────────────────────────

function SettleButtons({ pickId, onSettled }: { pickId: string; onSettled: (updated: PickOut) => void }) {
  const [settling, setSettling] = useState<string | null>(null);
  async function settle(outcome: "won" | "lost" | "void") {
    setSettling(outcome);
    try {
      const updated = await settlePick(pickId, outcome);
      onSettled(updated);
    } catch {
      // ignore
    } finally {
      setSettling(null);
    }
  }
  return (
    <div className="flex gap-1">
      <button onClick={() => settle("won")} disabled={!!settling}
              className="flex items-center gap-1 rounded-[7px] border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300 transition-all hover:border-emerald-400/40 hover:bg-emerald-400/15 disabled:opacity-40">
        {settling === "won" ? "…" : <><CheckCircle2 size={10} /> Won</>}
      </button>
      <button onClick={() => settle("lost")} disabled={!!settling}
              className="flex items-center gap-1 rounded-[7px] border border-red-400/20 bg-red-400/8 px-2 py-1 text-[10px] font-bold text-red-400 transition-all hover:border-red-400/35 hover:bg-red-400/12 disabled:opacity-40">
        {settling === "lost" ? "…" : <><XCircle size={10} /> Lost</>}
      </button>
      <button onClick={() => settle("void")} disabled={!!settling}
              className="flex items-center gap-1 rounded-[7px] border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-bold text-white/35 transition-all hover:border-white/[0.14] hover:text-white/55 disabled:opacity-40">
        {settling === "void" ? "…" : <><MinusCircle size={10} /> Void</>}
      </button>
    </div>
  );
}

// ── Pick row (card) ───────────────────────────────────────────────────────────

function PickRow({ pick, onRemove, onUpdate }: { pick: PickOut; onRemove: () => void; onUpdate: (p: PickOut) => void }) {
  const cfg = SPORT_CONFIG[pick.sport as keyof typeof SPORT_CONFIG];
  const sportColor = SPORT_COLOURS[pick.sport] ?? cfg?.color ?? "#7af7b7";
  const sportIcon = SPORT_ICONS[pick.sport] ?? "🎯";
  const date = new Date(pick.start_time);
  const edge = pick.edge ?? 0;
  const clv = pick.clv;
  const isPending = pick.outcome == null;

  return (
    <div className="group flex flex-col gap-2 rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition-colors hover:border-white/[0.10] hover:bg-white/[0.04]">
      <div className="flex items-center gap-3">
        {/* Sport dot */}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] text-[15px]"
             style={{ background: `${sportColor}14` }}>
          {sportIcon}
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-[13px] font-semibold text-white max-w-[200px]">
              {pick.selection_label}
            </span>
            <span className="text-[11px] text-white/35">{pick.market_name}</span>
            {pick.is_manual && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-white/35">
                <PenLine size={8} /> manual
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-white/50 truncate max-w-[220px]">{pick.match_label}</span>
            <span className="text-[10px] text-white/28">
              {date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Odds */}
          <div className="hidden sm:block text-right">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Odds</p>
            <p className="font-mono text-[13px] font-bold text-white tabular-nums">{pick.odds.toFixed(2)}</p>
          </div>

          {/* Edge */}
          <div className="hidden md:block text-right">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Edge</p>
            <p className={cn("font-mono text-[13px] font-semibold tabular-nums",
              edge > 0 ? "text-emerald-300" : edge < 0 ? "text-red-400" : "text-white/35"
            )}>
              {edge !== 0 ? `${edge > 0 ? "+" : ""}${edge.toFixed(1)}%` : "—"}
            </p>
          </div>

          {/* CLV */}
          <div className="hidden lg:block text-right">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">CLV</p>
            <p className={cn("font-mono text-[13px] font-semibold tabular-nums",
              clv == null ? "text-white/35" : clv > 0 ? "text-emerald-300" : "text-red-400"
            )}>
              {clv == null ? "—" : `${clv > 0 ? "+" : ""}${(clv * 100).toFixed(1)}%`}
            </p>
          </div>

          {/* Outcome */}
          <OutcomeBadge outcome={pick.outcome} />

          {/* Delete */}
          <button
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/30 transition-all hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400"
            aria-label="Remove pick"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Settle row — shown for all pending picks on hover */}
      {isPending && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 pl-11">
          <span className="text-[10px] text-white/28">Mark result:</span>
          <SettleButtons pickId={pick.id} onSettled={onUpdate} />
        </div>
      )}
    </div>
  );
}

// ── Track Pick Modal ──────────────────────────────────────────────────────────

const SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball", "hockey"] as const;
type SportSlug = typeof SPORTS[number];

const INPUT_CLS = "w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-white/25 outline-none focus:border-emerald-400/30 focus:bg-white/[0.06] transition-colors";
const LABEL_CLS = "text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38";

function TrackPickModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [sport, setSport] = useState<SportSlug>("soccer");

  // Search mode state
  const [matchSearch, setMatchSearch] = useState("");
  const [matches, setMatches] = useState<{ id: string; label: string; start_time: string }[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<{ id: string; label: string; start_time: string } | null>(null);
  const [selection, setSelection] = useState("Home");
  const [loadingSearch, setLoadingSearch] = useState(false);

  // Manual mode state
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [league, setLeague] = useState("");
  const [kickoff, setKickoff] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [marketName, setMarketName] = useState("Match Winner");
  const [selectionLabel, setSelectionLabel] = useState("");

  // Shared state
  const [odds, setOdds] = useState("");
  const [edge, setEdge] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchMatches = useCallback(async () => {
    if (mode !== "search") return;
    setLoadingSearch(true);
    try {
      const res = await getSportMatches(sport, { status: "scheduled", limit: 20 });
      const q = matchSearch.toLowerCase();
      const filtered = res.items
        .filter((m) => !q || m.home_name.toLowerCase().includes(q) || m.away_name.toLowerCase().includes(q))
        .map((m) => ({ id: m.id, label: `${m.home_name} vs ${m.away_name}`, start_time: m.kickoff_utc ?? new Date().toISOString() }));
      setMatches(filtered);
    } catch {
      setMatches([]);
    } finally {
      setLoadingSearch(false);
    }
  }, [sport, matchSearch, mode]);

  useEffect(() => {
    const t = setTimeout(searchMatches, 400);
    return () => clearTimeout(t);
  }, [searchMatches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!odds || isNaN(Number(odds)) || Number(odds) <= 1) { setError("Enter valid odds (> 1.00)"); return; }

    let pick: PickCreate;
    if (mode === "search") {
      if (!selectedMatch) { setError("Select a match"); return; }
      pick = {
        match_id: selectedMatch.id,
        match_label: selectedMatch.label,
        sport,
        start_time: selectedMatch.start_time,
        market_name: "1X2",
        selection_label: selection,
        odds: Number(odds),
        edge: edge ? Number(edge) : undefined,
      };
    } else {
      if (!homeTeam.trim() || !awayTeam.trim()) { setError("Enter home and away team"); return; }
      if (!selectionLabel.trim()) { setError("Enter your selection"); return; }
      pick = {
        // no match_id — backend will generate a manual-* synthetic ID
        match_label: `${homeTeam.trim()} vs ${awayTeam.trim()}`,
        sport,
        league: league.trim() || undefined,
        start_time: new Date(kickoff).toISOString(),
        market_name: marketName.trim() || "Match Winner",
        selection_label: selectionLabel.trim(),
        odds: Number(odds),
        edge: edge ? Number(edge) : undefined,
      };
    }

    setSaving(true);
    try {
      await trackPicks([pick]);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pick");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,#0d1f18,#091510)] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-white">Track a Pick</h2>
          <button onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white/70 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="mb-5 flex rounded-[12px] border border-white/[0.08] bg-white/[0.03] p-1 gap-1">
          <button type="button" onClick={() => setMode("search")}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-[9px] py-1.5 text-[12px] font-semibold transition-all",
                    mode === "search" ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/25" : "text-white/40 hover:text-white/65 border border-transparent")}>
            <Search size={12} /> Search matches
          </button>
          <button type="button" onClick={() => setMode("manual")}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-[9px] py-1.5 text-[12px] font-semibold transition-all",
                    mode === "manual" ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/25" : "text-white/40 hover:text-white/65 border border-transparent")}>
            <PenLine size={12} /> Enter manually
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Sport */}
          <div className="flex flex-col gap-2">
            <label className={LABEL_CLS}>Sport</label>
            <div className="flex gap-1.5 flex-wrap">
              {SPORTS.map((s) => (
                <button key={s} type="button"
                        onClick={() => { setSport(s); setSelectedMatch(null); setMatches([]); }}
                        className={cn(
                          "rounded-full border px-3 py-1 text-[11px] font-semibold capitalize transition-all",
                          sport === s
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                            : "border-white/[0.08] bg-white/[0.03] text-white/45 hover:border-white/[0.14] hover:text-white/70"
                        )}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {mode === "search" ? (
            <>
              {/* Match search */}
              <div className="flex flex-col gap-2">
                <label className={LABEL_CLS}>Match</label>
                <div className="relative">
                  <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={matchSearch} onChange={(e) => setMatchSearch(e.target.value)}
                    placeholder="Search teams…"
                    className={cn(INPUT_CLS, "pl-8")} />
                </div>
                {loadingSearch && <p className="text-[11px] text-white/30">Searching…</p>}
                {matches.length > 0 && !selectedMatch && (
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {matches.map((m) => (
                      <button key={m.id} type="button"
                              onClick={() => { setSelectedMatch(m); setMatchSearch(m.label); }}
                              className="rounded-[8px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/60 transition-colors hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-white">
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
                {selectedMatch && <p className="text-[11px] text-emerald-400">✓ {selectedMatch.label}</p>}
              </div>

              {/* Selection */}
              <div className="flex flex-col gap-2">
                <label className={LABEL_CLS}>Selection</label>
                <div className="flex gap-2">
                  {["Home", "Draw", "Away"].map((s) => (
                    <button key={s} type="button" onClick={() => setSelection(s)}
                            className={cn("flex-1 rounded-[10px] border py-1.5 text-[12px] font-semibold transition-all",
                              selection === s
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                : "border-white/[0.08] bg-white/[0.03] text-white/45 hover:border-white/[0.14] hover:text-white/70")}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Manual match entry */}
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-2">
                  <label className={LABEL_CLS}>Home Team</label>
                  <input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="Arsenal" className={INPUT_CLS} required />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <label className={LABEL_CLS}>Away Team</label>
                  <input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="Chelsea" className={INPUT_CLS} required />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-2">
                  <label className={LABEL_CLS}>League <span className="normal-case text-white/25">(optional)</span></label>
                  <input value={league} onChange={(e) => setLeague(e.target.value)} placeholder="Premier League" className={INPUT_CLS} />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <label className={LABEL_CLS}>Kick-off</label>
                  <input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)}
                    className={cn(INPUT_CLS, "appearance-none")} required />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-2">
                  <label className={LABEL_CLS}>Market / Bet type</label>
                  <input value={marketName} onChange={(e) => setMarketName(e.target.value)} placeholder="Match Winner" className={INPUT_CLS} />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <label className={LABEL_CLS}>Your selection</label>
                  <input value={selectionLabel} onChange={(e) => setSelectionLabel(e.target.value)} placeholder="Arsenal" className={INPUT_CLS} required />
                </div>
              </div>
            </>
          )}

          {/* Odds + Edge (shared) */}
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <label className={LABEL_CLS}>Odds</label>
              <input type="number" step="0.01" min="1.01" value={odds}
                     onChange={(e) => setOdds(e.target.value)} placeholder="2.10"
                     className={INPUT_CLS} required />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <label className={LABEL_CLS}>Edge % <span className="normal-case text-white/25">(optional)</span></label>
              <input type="number" step="0.1" value={edge} onChange={(e) => setEdge(e.target.value)}
                     placeholder="3.5" className={INPUT_CLS} />
            </div>
          </div>

          {mode === "manual" && (
            <p className="text-[11px] text-white/30 rounded-[8px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              Manually entered picks won&apos;t settle automatically — you&apos;ll mark the result yourself once it&apos;s in.
            </p>
          )}

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <button type="submit" disabled={saving}
                  className="mt-1 w-full rounded-[12px] bg-[linear-gradient(135deg,rgba(54,242,143,0.22),rgba(54,242,143,0.12))] border border-emerald-400/25 py-2.5 text-[13px] font-bold text-emerald-200 transition-all hover:border-emerald-400/40 hover:bg-[linear-gradient(135deg,rgba(54,242,143,0.30),rgba(54,242,143,0.16))] disabled:opacity-50">
            {saving ? "Saving…" : "Save Pick"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

type OutcomeFilter = "all" | "pending" | "won" | "lost" | "void";

const OUTCOME_OPTS: { value: OutcomeFilter; label: string }[] = [
  { value: "all",     label: "All" },
  { value: "pending", label: "Pending" },
  { value: "won",     label: "Won" },
  { value: "lost",    label: "Lost" },
  { value: "void",    label: "Void" },
];

const SPORT_OPTS = [
  { value: "", label: "All Sports" },
  ...SPORTS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
];

function FilterBar({
  outcomeFilter, sportFilter, onOutcome, onSport, onTrack,
}: {
  outcomeFilter: OutcomeFilter;
  sportFilter: string;
  onOutcome: (v: OutcomeFilter) => void;
  onSport: (v: string) => void;
  onTrack: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3 lg:px-6">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Result</span>
        <div className="flex gap-1">
          {OUTCOME_OPTS.map((o) => (
            <button key={o.value}
                    onClick={() => onOutcome(o.value)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all",
                      outcomeFilter === o.value
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-white/[0.07] bg-transparent text-white/40 hover:border-white/[0.12] hover:text-white/65"
                    )}>
              {o.label}
            </button>
          ))}
        </div>

        <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Sport</span>
        <div className="flex gap-1 flex-wrap">
          {SPORT_OPTS.map((o) => (
            <button key={o.value}
                    onClick={() => onSport(o.value)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all",
                      sportFilter === o.value
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-white/[0.07] bg-transparent text-white/40 hover:border-white/[0.12] hover:text-white/65"
                    )}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={onTrack}
              className="flex items-center gap-1.5 rounded-[10px] border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-300 transition-all hover:border-emerald-400/40 hover:bg-emerald-400/15">
        <Plus size={12} /> Track Pick
      </button>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function RecordView() {
  const [picks, setPicks] = useState<PickOut[]>([]);
  const [stats, setStats] = useState<PicksStatsOut | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [sportFilter, setSportFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showTrackModal, setShowTrackModal] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        getPicks({
          outcome: outcomeFilter === "all" ? undefined : outcomeFilter as "won" | "lost" | "void" | "pending",
          sport: sportFilter || undefined,
          limit: 200,
        }),
        getPicksStats(sportFilter || undefined),
      ]);
      setPicks(p);
      setStats(s);
    } catch {
      // show empty state
    } finally {
      setLoading(false);
    }
  }, [outcomeFilter, sportFilter]);

  useEffect(() => { reload(); }, [reload]);

  const handleRemove = async (id: string) => {
    try {
      await deletePick(id);
      setPicks((prev) => prev.filter((p) => p.id !== id));
      setStats((prev) => prev ? { ...prev, total: prev.total - 1 } : prev);
    } catch {
      // ignore
    }
  };

  const handleUpdate = (updated: PickOut) => {
    setPicks((prev) => prev.map((p) => p.id === updated.id ? updated : p));
  };

  return (
    <>
      <div className="flex flex-col space-y-0 pb-12">
        {/* Header */}
        <div className="px-4 pt-4 pb-1 lg:px-6">
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-white">Bet Record</h1>
          <p className="mt-0.5 text-[12px] text-white/35">Settled picks, outcomes, and slip history</p>
        </div>

        {/* Stats strip */}
        {stats && <StatsStrip stats={stats} />}

        {/* Filter */}
        <div className="mt-2">
          <FilterBar
            outcomeFilter={outcomeFilter}
            sportFilter={sportFilter}
            onOutcome={setOutcomeFilter}
            onSport={setSportFilter}
            onTrack={() => setShowTrackModal(true)}
          />
        </div>

        {/* Picks list */}
        <div className="px-4 pt-4 lg:px-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
            </div>
          ) : picks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                <ClipboardList size={28} className="text-white/25" />
              </div>
              <div>
                <p className="text-[17px] font-semibold text-white">No picks recorded</p>
                <p className="mt-1 max-w-xs text-[13px] text-white/38">
                  Head to{" "}
                  <Link href="/predictions" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                    predictions
                  </Link>
                  , add picks to your queue, then track them here.
                </p>
              </div>
              <button onClick={() => setShowTrackModal(true)}
                      className="mt-1 flex items-center gap-2 rounded-[12px] border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-[13px] font-semibold text-emerald-300 transition-all hover:border-emerald-400/40 hover:bg-emerald-400/15">
                <Plus size={14} /> Track a Pick
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-white/28 mb-1">{picks.length} pick{picks.length !== 1 ? "s" : ""}</p>
              {picks.map((p) => (
                <PickRow key={p.id} pick={p} onRemove={() => handleRemove(p.id)} onUpdate={handleUpdate} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showTrackModal && (
        <TrackPickModal
          onClose={() => setShowTrackModal(false)}
          onSaved={reload}
        />
      )}
    </>
  );
}
