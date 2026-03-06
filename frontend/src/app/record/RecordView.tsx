"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, TrendingUp, Clock, CheckCircle2, XCircle, MinusCircle, Plus, X, Search } from "lucide-react";
import Link from "next/link";
import { getPicks, getPicksStats, deletePick, trackPicks, getSportMatches } from "@/lib/api";
import type { PickOut, PicksStatsOut, PickCreate } from "@/lib/api";
import { SPORT_CONFIG } from "@/lib/betting-types";

// ── Outcome badge ─────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: PickOut["outcome"] }) {
  if (!outcome) return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", color: "var(--text1)" }}>
      <Clock size={9} /> Pending
    </span>
  );
  if (outcome === "won") return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(34,197,94,0.15)", color: "var(--positive)" }}>
      <CheckCircle2 size={9} /> Won
    </span>
  );
  if (outcome === "lost") return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(239,68,68,0.15)", color: "var(--negative)" }}>
      <XCircle size={9} /> Lost
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", color: "var(--text1)" }}>
      <MinusCircle size={9} /> Void
    </span>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: PicksStatsOut }) {
  const roiColor = stats.roi > 0 ? "var(--positive)" : stats.roi < 0 ? "var(--negative)" : "var(--text0)";
  const clvColor = stats.avg_clv != null && stats.avg_clv > 0 ? "var(--positive)" : "var(--text0)";

  const kpis = [
    { label: "Total picks", value: String(stats.total),                                                                     color: "var(--text0)" },
    { label: "Settled",     value: String(stats.settled),                                                                   color: "var(--text0)" },
    { label: "Win rate",    value: stats.settled > 0 ? `${(stats.win_rate * 100).toFixed(0)}%` : "—",                      color: stats.win_rate >= 0.55 ? "var(--positive)" : "var(--text0)" },
    { label: "Avg odds",    value: stats.avg_odds > 0 ? stats.avg_odds.toFixed(2) : "—",                                   color: "var(--text0)" },
    { label: "ROI",         value: stats.total > 0 ? `${stats.roi >= 0 ? "+" : ""}${(stats.roi * 100).toFixed(1)}%` : "—", color: roiColor },
    { label: "Avg CLV",     value: stats.avg_clv != null ? `${stats.avg_clv >= 0 ? "+" : ""}${(stats.avg_clv * 100).toFixed(1)}%` : "—", color: clvColor },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 px-4 pt-4 pb-3 lg:px-6">
      {kpis.map(({ label, value, color }) => (
        <div key={label} className="stat-card">
          <p className="label mb-2">{label}</p>
          <p className="metric-hero text-xl" style={{ color }}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Pick row ──────────────────────────────────────────────────────────────────

function PickRow({ pick, onRemove }: { pick: PickOut; onRemove: () => void }) {
  const cfg = SPORT_CONFIG[pick.sport as keyof typeof SPORT_CONFIG];
  const date = new Date(pick.start_time);
  const edge = pick.edge ?? 0;
  const clv = pick.clv;

  return (
    <tr className="tr-hover group">
      {/* Sport */}
      <td>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: cfg?.color ?? "var(--accent)" }} />
          <span className="text-t1 text-xs capitalize">{pick.sport}</span>
        </div>
      </td>

      {/* Match + selection */}
      <td>
        <div className="flex flex-col gap-0.5">
          <span className="text-t0 font-semibold text-sm leading-tight truncate max-w-[220px]">
            {pick.selection_label}
            <span className="text-t1 font-normal text-xs ml-1">· {pick.market_name}</span>
          </span>
          <span className="text-t1 text-xs truncate max-w-[220px]">{pick.match_label}</span>
        </div>
      </td>

      {/* Date */}
      <td className="hidden md:table-cell text-t1 text-xs whitespace-nowrap">
        {date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}
      </td>

      {/* Odds */}
      <td className="col-right font-mono font-bold text-t0">
        {pick.odds.toFixed(2)}
      </td>

      {/* Edge */}
      <td className="col-right hidden sm:table-cell">
        <span className="text-xs font-mono font-semibold"
              style={{ color: edge > 0 ? "var(--positive)" : edge < 0 ? "var(--negative)" : "var(--text2)" }}>
          {edge !== 0 ? `${edge > 0 ? "+" : ""}${edge.toFixed(1)}%` : "—"}
        </span>
      </td>

      {/* CLV */}
      <td className="col-right hidden sm:table-cell">
        <span className="text-xs font-mono font-semibold"
              style={{ color: clv == null ? "var(--text2)" : clv > 0 ? "var(--positive)" : "var(--negative)" }}>
          {clv == null ? "—" : `${clv > 0 ? "+" : ""}${(clv * 100).toFixed(1)}%`}
        </span>
      </td>

      {/* Outcome */}
      <td className="text-center">
        <OutcomeBadge outcome={pick.outcome} />
      </td>

      {/* Delete */}
      <td className="text-right">
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded"
          style={{ color: "var(--text1)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--negative)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text1)")}
          aria-label="Remove pick"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

// ── Track Pick Modal ──────────────────────────────────────────────────────────

const SPORTS = ["soccer", "tennis", "esports", "basketball", "baseball"] as const;
type SportSlug = typeof SPORTS[number];

function TrackPickModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sport, setSport] = useState<SportSlug>("soccer");
  const [matchSearch, setMatchSearch] = useState("");
  const [matches, setMatches] = useState<{ id: string; label: string }[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<{ id: string; label: string } | null>(null);
  const [selection, setSelection] = useState("Home");
  const [odds, setOdds] = useState("");
  const [edge, setEdge] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchMatches = useCallback(async () => {
    if (!sport) return;
    setLoading(true);
    try {
      const res = await getSportMatches(sport, { status: "scheduled", limit: 20 });
      const q = matchSearch.toLowerCase();
      const filtered = res.items
        .filter((m) => !q || m.home_name.toLowerCase().includes(q) || m.away_name.toLowerCase().includes(q))
        .map((m) => ({ id: m.id, label: `${m.home_name} vs ${m.away_name}` }));
      setMatches(filtered);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [sport, matchSearch]);

  useEffect(() => {
    const t = setTimeout(searchMatches, 400);
    return () => clearTimeout(t);
  }, [searchMatches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMatch) { setError("Select a match"); return; }
    if (!odds || isNaN(Number(odds))) { setError("Enter valid odds"); return; }
    setSaving(true);
    setError(null);
    try {
      const pick: PickCreate = {
        match_id: selectedMatch.id,
        match_label: selectedMatch.label,
        sport,
        start_time: new Date().toISOString(),
        market_name: "1X2",
        selection_label: selection,
        odds: Number(odds),
        edge: edge ? Number(edge) : undefined,
      };
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
         style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md card p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text0)" }}>Track a Pick</h2>
          <button onClick={onClose} className="p-1 rounded text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Sport */}
          <div className="flex flex-col gap-1.5">
            <label className="label">Sport</label>
            <div className="flex gap-1 flex-wrap">
              {SPORTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSport(s); setSelectedMatch(null); setMatches([]); }}
                  className="text-xs px-3 py-1 rounded-full border transition-all capitalize"
                  style={sport === s ? {
                    background: "var(--accent-dim)", borderColor: "rgba(34,211,238,0.35)", color: "var(--accent)",
                  } : {
                    background: "transparent", borderColor: "var(--border0)", color: "var(--text1)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Match search */}
          <div className="flex flex-col gap-1.5">
            <label className="label">Match</label>
            <div className="relative">
              <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text2)", pointerEvents: "none" }} />
              <input
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
                placeholder="Search teams…"
                className="input-field"
                style={{ paddingLeft: 28 }}
              />
            </div>
            {loading && <p style={{ fontSize: 11, color: "var(--text2)" }}>Searching…</p>}
            {matches.length > 0 && !selectedMatch && (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setSelectedMatch(m); setMatchSearch(m.label); }}
                    className="text-left text-xs px-3 py-2 rounded border transition-colors"
                    style={{ borderColor: "var(--border0)", background: "var(--bg1)", color: "var(--text1)" }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {selectedMatch && (
              <p style={{ fontSize: 11, color: "var(--positive)" }}>✓ {selectedMatch.label}</p>
            )}
          </div>

          {/* Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="label">Selection</label>
            <div className="flex gap-2">
              {["Home", "Draw", "Away"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelection(s)}
                  className="flex-1 text-xs px-3 py-1.5 rounded border transition-all"
                  style={selection === s ? {
                    background: "var(--accent-dim)", borderColor: "rgba(34,211,238,0.35)", color: "var(--accent)",
                  } : {
                    background: "transparent", borderColor: "var(--border0)", color: "var(--text1)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Odds + Edge */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="label">Odds</label>
              <input
                type="number"
                step="0.01"
                min="1"
                value={odds}
                onChange={(e) => setOdds(e.target.value)}
                placeholder="e.g. 2.10"
                className="input-field"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="label">Edge % (optional)</label>
              <input
                type="number"
                step="0.1"
                value={edge}
                onChange={(e) => setEdge(e.target.value)}
                placeholder="e.g. 3.5"
                className="input-field"
              />
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: "var(--negative)" }}>{error}</p>}

          <button type="submit" className="btn-primary" disabled={saving}>
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
    <div className="flex flex-wrap items-center gap-3 px-4 lg:px-6 py-3 border-b"
         style={{ borderColor: "var(--border0)" }}>
      <div className="flex items-center gap-2 flex-1 flex-wrap">
        <span className="label">Result</span>
        <div className="tabs-segmented">
          {OUTCOME_OPTS.map((o) => (
            <button key={o.value} className="tab-seg-item" data-active={outcomeFilter === o.value}
                    onClick={() => onOutcome(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        <span className="label ml-2">Sport</span>
        <div className="tabs-segmented">
          {SPORT_OPTS.map((o) => (
            <button key={o.value} className="tab-seg-item" data-active={sportFilter === o.value}
                    onClick={() => onSport(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <button onClick={onTrack} className="btn btn-secondary btn-sm flex items-center gap-1.5">
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

  return (
    <>
      <div className="flex flex-col">
        {/* Stats strip */}
        {stats && <StatsStrip stats={stats} />}

        {/* Filter */}
        <FilterBar
          outcomeFilter={outcomeFilter}
          sportFilter={sportFilter}
          onOutcome={setOutcomeFilter}
          onSport={setSportFilter}
          onTrack={() => setShowTrackModal(true)}
        />

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-t1 text-sm" style={{ animation: "pulse 1.5s ease-in-out infinite" }}>Loading…</div>
          </div>
        ) : picks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div style={{
              width: 56, height: 56, borderRadius: "var(--radius-xl)",
              background: "var(--accent-dim)", border: "1px solid var(--accent-ring)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <TrendingUp size={24} style={{ color: "var(--accent)" }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-t0 mb-1">No picks tracked yet</p>
              <p className="text-xs text-t1 max-w-xs">
                Browse{" "}
                <Link href="/predictions" style={{ color: "var(--accent)" }}>predictions</Link>
                {" "}and track picks to see your record here.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Sport</th>
                  <th>Pick</th>
                  <th className="hidden md:table-cell">Date</th>
                  <th className="col-right">Odds</th>
                  <th className="col-right hidden sm:table-cell">Edge</th>
                  <th className="col-right hidden sm:table-cell">CLV</th>
                  <th className="text-center">Result</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => (
                  <PickRow key={p.id} pick={p} onRemove={() => handleRemove(p.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Track Pick Modal */}
      {showTrackModal && (
        <TrackPickModal
          onClose={() => setShowTrackModal(false)}
          onSaved={reload}
        />
      )}
    </>
  );
}
