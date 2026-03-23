"use client";

import { useState, useCallback, useEffect } from "react";
import { Users, Plus, X, Search, ChevronRight, Trophy, Zap } from "lucide-react";
import { SPORT_CONFIG } from "@/lib/betting-types";
import type { SportSlug } from "@/lib/betting-types";
import { cn } from "@/lib/utils";
import type { TipsterProfile, TipsterTip } from "@/lib/api";
import { getTipsters, getTipsterTips } from "@/lib/api";
import { useBetting } from "@/components/betting/BettingContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarColor(username: string): string {
  const colors = ["#22e283", "#60a5fa", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#f97316"];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initials(username: string) {
  return username.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
}

// ── Result badge ──────────────────────────────────────────────────────────────

function ResultBadge({ result }: { result: "W" | "L" }) {
  return (
    <span
      className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0"
      style={result === "W"
        ? { background: "rgba(34,226,131,0.15)", color: "var(--positive)" }
        : { background: "rgba(239,68,68,0.12)", color: "var(--negative)" }
      }
    >
      {result}
    </span>
  );
}

// ── Tip row (inside tipster modal) ────────────────────────────────────────────

function TipRow({ tip, tipsterUsername }: { tip: TipsterTip; tipsterUsername: string }) {
  const cfg = SPORT_CONFIG[tip.sport as SportSlug];
  const isPending = !tip.outcome || tip.outcome === "pending";
  const { addToQueue, isInQueue } = useBetting();
  const queueId = `tipster:${tip.id}`;
  const tailed = isInQueue(queueId);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border0)" }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5" style={{ background: cfg?.color ?? "var(--accent)" }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-primary leading-tight truncate">
          {tip.selection_label}
          <span className="text-text-muted font-normal ml-1">· {tip.market_name}</span>
        </p>
        <p className="text-[11px] text-text-muted truncate">{tip.match_label}</p>
      </div>
      <span className="text-xs font-mono font-bold tabular-nums text-text-primary flex-shrink-0">{tip.odds.toFixed(2)}</span>
      {isPending && (
        <button
          onClick={() => !tailed && addToQueue({
            id: queueId,
            matchId: tip.id,
            matchLabel: tip.match_label,
            sport: tip.sport as SportSlug,
            league: "",
            marketId: tip.id,
            marketName: tip.market_name,
            selectionId: tip.id,
            selectionLabel: `${tip.selection_label} (via @${tipsterUsername})`,
            odds: tip.odds,
            startTime: tip.start_time,
            addedAt: new Date().toISOString(),
          })}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all flex-shrink-0"
          style={tailed
            ? { background: "rgba(34,197,94,0.15)", color: "var(--positive)" }
            : { background: "var(--accent)", color: "#0f2418" }
          }
        >
          {tailed ? "✓ Tailed" : <><Zap size={9} /> Tail</>}
        </button>
      )}
      {!isPending && tip.outcome === "won" && (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: "rgba(34,197,94,0.15)", color: "var(--positive)" }}>Won</span>
      )}
      {!isPending && tip.outcome === "lost" && (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: "rgba(239,68,68,0.12)", color: "var(--negative)" }}>Lost</span>
      )}
    </div>
  );
}

// ── Tipster detail modal ──────────────────────────────────────────────────────

function TipsterModal({
  tipster,
  tips,
  onClose,
  onFollow,
}: {
  tipster: TipsterProfile;
  tips: TipsterTip[];
  onClose: () => void;
  onFollow: () => void;
}) {
  const color = avatarColor(tipster.username);
  const winPct = Math.round(tipster.weekly_win_rate * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col" style={{ background: "rgba(8,18,14,0.97)", border: "1px solid var(--border0)", maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.04)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0" style={{ background: color }}>
            {initials(tipster.username)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-text-primary">@{tipster.username}</h2>
            {tipster.bio && <p className="text-xs text-text-muted mt-0.5 truncate">{tipster.bio}</p>}
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-[11px] text-text-muted"><span className="font-bold text-text-primary">{tipster.followers.toLocaleString()}</span> followers</span>
              <span className="text-[11px] font-bold" style={{ color: winPct >= 60 ? "var(--positive)" : "var(--text0)" }}>{winPct}% weekly</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onFollow}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all"
              style={tipster.is_following ? {
                background: "var(--bg2)", borderColor: "var(--border1)", border: "1px solid", color: "var(--text1)",
              } : {
                background: "var(--accent)", color: "#0f2418", border: "1px solid transparent",
              }}
            >
              {tipster.is_following ? "Following" : "Follow"}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px" style={{ background: "var(--border0)" }}>
          {[
            { label: "Total picks", value: String(tipster.total_picks) },
            { label: "Won", value: String(tipster.won_picks) },
            { label: "Active tips", value: String(tipster.active_tips_count) },
          ].map(({ label, value }) => (
            <div key={label} className="py-3 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-[9px] uppercase tracking-wider text-text-muted mb-0.5">{label}</p>
              <p className="text-sm font-bold text-text-primary">{value}</p>
            </div>
          ))}
        </div>

        {/* Recent form */}
        <div className="px-6 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border0)", background: "rgba(255,255,255,0.04)" }}>
          <span className="text-[10px] uppercase tracking-wider text-text-muted mr-1">Recent</span>
          {tipster.recent_results.map((r, i) => <ResultBadge key={i} result={r} />)}
        </div>

        {/* Active tips */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-[11px] uppercase tracking-wider text-text-muted mb-3">Active tips ({tips.filter(t => !t.outcome || t.outcome === "pending").length})</p>
          {tips.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No active tips right now</p>
          ) : (
            tips.map((t) => <TipRow key={t.id} tip={t} tipsterUsername={tipster.username} />)
          )}
        </div>
      </div>
    </div>
  );
}

// ── Post tip modal ─────────────────────────────────────────────────────────────

const SPORTS = ["soccer", "tennis", "basketball", "esports", "baseball", "hockey"] as const;

function PostTipModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [sport, setSport] = useState<SportSlug>("soccer");
  const [matchLabel, setMatchLabel] = useState("");
  const [selection, setSelection] = useState("");
  const [market, setMarket] = useState("1X2");
  const [odds, setOdds] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchLabel.trim()) { setError("Enter a match"); return; }
    if (!selection.trim()) { setError("Enter your selection"); return; }
    if (!odds || isNaN(Number(odds)) || Number(odds) < 1) { setError("Enter valid odds (≥ 1.01)"); return; }
    setSaving(true);
    setError(null);
    try {
      // POST /api/v1/tipsters/tips
      const res = await fetch("/api/v1/tipsters/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, match_label: matchLabel, selection_label: selection, market_name: market, odds: Number(odds), note: note || undefined }),
      });
      if (!res.ok) throw new Error("Failed to post tip");
      onPosted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post tip");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4" style={{ background: "rgba(8,18,14,0.97)", border: "1px solid var(--border0)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">Post a Tip</h2>
          <button onClick={onClose} className="p-1 rounded text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Sport */}
          <div className="flex flex-col gap-1.5">
            <label className="label">Sport</label>
            <div className="flex gap-1 flex-wrap">
              {SPORTS.map((s) => (
                <button key={s} type="button" onClick={() => setSport(s)}
                  className="text-xs px-3 py-1 rounded-full border transition-all capitalize"
                  style={sport === s
                    ? { background: "var(--accent-dim)", borderColor: "rgba(34,226,131,0.35)", color: "var(--accent)" }
                    : { background: "transparent", borderColor: "var(--border0)", color: "var(--text1)" }
                  }
                >{s}</button>
              ))}
            </div>
          </div>

          {/* Match */}
          <div className="flex flex-col gap-1.5">
            <label className="label">Match</label>
            <input value={matchLabel} onChange={e => setMatchLabel(e.target.value)} placeholder="e.g. Arsenal vs Chelsea" className="input-field" />
          </div>

          {/* Market + Selection */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 w-24 flex-shrink-0">
              <label className="label">Market</label>
              <input value={market} onChange={e => setMarket(e.target.value)} placeholder="1X2" className="input-field" />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="label">Selection</label>
              <input value={selection} onChange={e => setSelection(e.target.value)} placeholder="e.g. Home, Over 2.5" className="input-field" />
            </div>
          </div>

          {/* Odds */}
          <div className="flex flex-col gap-1.5">
            <label className="label">Odds (decimal)</label>
            <input type="number" step="0.01" min="1.01" value={odds} onChange={e => setOdds(e.target.value)} placeholder="e.g. 2.10" className="input-field" required />
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <label className="label">Note <span className="text-text-muted font-normal">(optional)</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Reasoning, context…" rows={2}
              className="input-field resize-none" style={{ lineHeight: 1.5 }} />
          </div>

          {error && <p className="text-xs" style={{ color: "var(--negative)" }}>{error}</p>}

          <button type="submit" className="btn btn-primary h-10" disabled={saving}>
            {saving ? "Posting…" : "Post Tip"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Tipster card ──────────────────────────────────────────────────────────────

function TipsterCard({
  tipster,
  onOpen,
  onFollow,
}: {
  tipster: TipsterProfile;
  onOpen: () => void;
  onFollow: () => void;
}) {
  const color = avatarColor(tipster.username);
  const winPct = Math.round(tipster.weekly_win_rate * 100);
  const wonLabel = `${tipster.won_picks}/${tipster.total_picks}`;

  return (
    <div
      className="rounded-2xl border flex flex-col overflow-hidden transition-all duration-150 hover:shadow-md cursor-pointer"
      style={{ background: "rgba(255,255,255,0.04)", borderColor: "var(--border0)" }}
      onClick={onOpen}
    >
      {/* Top section */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ background: color }}
        >
          {initials(tipster.username)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary leading-tight">@{tipster.username}</p>
          {tipster.bio && <p className="text-[11px] text-text-muted leading-snug mt-0.5 line-clamp-1">{tipster.bio}</p>}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-text-muted">
              <span className="font-semibold text-text-primary">{tipster.followers.toLocaleString()}</span> followers
            </span>
            <span className="text-text-subtle">·</span>
            <span className="text-[11px] font-bold" style={{ color: winPct >= 60 ? "var(--positive)" : winPct >= 50 ? "var(--warning)" : "var(--negative)" }}>
              {winPct}% weekly
            </span>
          </div>
        </div>
      </div>

      {/* Recent results */}
      <div className="flex items-center gap-1 px-4 pb-3">
        <span className="text-[9px] uppercase tracking-wider text-text-muted mr-1">{wonLabel} latest</span>
        {tipster.recent_results.map((r, i) => <ResultBadge key={i} result={r} />)}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t mt-auto"
        style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}
        onClick={e => e.stopPropagation()}
      >
        <span className="text-[11px] font-semibold text-text-muted">
          {tipster.active_tips_count > 0
            ? <><span className="text-text-primary font-bold">{tipster.active_tips_count}</span> active {tipster.active_tips_count === 1 ? "tip" : "tips"}</>
            : "No active tips"
          }
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onOpen(); }}
            className="text-[11px] font-medium text-text-muted hover:text-text-primary transition-colors flex items-center gap-0.5"
          >
            View <ChevronRight size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onFollow(); }}
            className="px-3 py-1 rounded-lg text-[11px] font-bold transition-all"
            style={tipster.is_following ? {
              background: "var(--bg3)", color: "var(--text1)", border: "1px solid var(--border1)",
            } : {
              background: "var(--accent)", color: "#0f2418",
            }}
          >
            {tipster.is_following ? "Following" : "+ Follow"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

type SortOpt = "followers" | "winrate" | "active";
type Tab = "tipsters" | "leaderboard";

function LeaderboardView({ tipsters }: { tipsters: TipsterProfile[] }) {
  const ranked = [...tipsters].sort((a, b) => {
    const roiA = a.total_picks > 0 ? a.won_picks / a.total_picks : 0;
    const roiB = b.total_picks > 0 ? b.won_picks / b.total_picks : 0;
    return roiB - roiA;
  });
  return (
    <div className="px-4 py-4 lg:px-6">
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border0)", background: "var(--bg1)" }}>
        <div className="grid grid-cols-[28px_1fr_80px_80px_80px] gap-3 px-4 py-2 border-b text-[10px] uppercase tracking-wider text-text-muted font-bold" style={{ borderColor: "var(--border0)", background: "var(--bg2)" }}>
          <span>#</span><span>Tipster</span><span className="text-right">Win rate</span><span className="text-right">Picks</span><span className="text-right">Followers</span>
        </div>
        {ranked.map((t, i) => {
          const color = avatarColor(t.username);
          const winPct = Math.round(t.weekly_win_rate * 100);
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          return (
            <div key={t.id} className="grid grid-cols-[28px_1fr_80px_80px_80px] gap-3 items-center px-4 py-3 border-b last:border-b-0 hover:bg-[var(--bg2)] transition-colors" style={{ borderColor: "var(--border0)" }}>
              <span className="text-sm">{medal ?? <span className="text-[11px] text-text-muted font-bold">{i + 1}</span>}</span>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: color }}>
                  {initials(t.username)}
                </div>
                <span className="text-sm font-semibold text-text-primary truncate">@{t.username}</span>
              </div>
              <span className="text-right text-sm font-bold" style={{ color: winPct >= 65 ? "var(--positive)" : winPct >= 50 ? "var(--warning)" : "var(--negative)" }}>{winPct}%</span>
              <span className="text-right text-sm font-mono text-text-primary">{t.total_picks}</span>
              <span className="text-right text-sm font-mono text-text-muted">{t.followers.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TipstersView({ initialTipsters = [] }: { initialTipsters?: TipsterProfile[] }) {
  const [tipsters, setTipsters] = useState<TipsterProfile[]>(initialTipsters);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOpt>("followers");
  const [tab, setTab] = useState<Tab>("tipsters");
  const [openTipster, setOpenTipster] = useState<TipsterProfile | null>(null);
  const [openTips, setOpenTips] = useState<TipsterTip[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);

  useEffect(() => {
    getTipsters().then(setTipsters).catch(() => {});
  }, []);

  function handleOpenTipster(tipster: TipsterProfile) {
    setOpenTipster(tipster);
    setOpenTips([]);
    getTipsterTips(tipster.id).then(setOpenTips).catch(() => {});
  }

  const handleFollow = useCallback((id: string) => {
    setTipsters(prev => prev.map(t =>
      t.id === id
        ? { ...t, is_following: !t.is_following, followers: t.followers + (t.is_following ? -1 : 1) }
        : t
    ));
    if (openTipster?.id === id) {
      setOpenTipster(prev => prev ? { ...prev, is_following: !prev.is_following, followers: prev.followers + (prev.is_following ? -1 : 1) } : prev);
    }
  }, [openTipster]);

  const filtered = tipsters
    .filter(t => !search || t.username.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === "winrate") return b.weekly_win_rate - a.weekly_win_rate;
      if (sort === "active") return b.active_tips_count - a.active_tips_count;
      return b.followers - a.followers;
    });

  const followingCount = tipsters.filter(t => t.is_following).length;

  return (
    <>
      {/* Page header */}
      <div className="px-4 pt-5 pb-4 lg:px-6 border-b" style={{ borderColor: "var(--border0)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} style={{ color: "var(--accent)" }} />
              <h1 className="text-lg font-bold text-text-primary">Community Tipsters</h1>
            </div>
            <p className="text-sm text-text-muted">Follow verified tipsters and tail their picks directly into your queue.</p>
          </div>
          <button
            onClick={() => setShowPostModal(true)}
            className="btn btn-primary flex items-center gap-1.5 h-9 px-4 text-xs flex-shrink-0"
          >
            <Plus size={13} /> Post a Tip
          </button>
        </div>

        {/* Following strip */}
        {followingCount > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-text-muted">Following</span>
            {tipsters.filter(t => t.is_following).map(t => (
              <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: "rgba(34,226,131,0.12)", color: "var(--positive)", border: "1px solid rgba(34,226,131,0.2)" }}>
                <span className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white" style={{ background: avatarColor(t.username) }}>
                  {initials(t.username)}
                </span>
                @{t.username}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0 px-4 lg:px-6 border-b" style={{ borderColor: "var(--border0)" }}>
        {([["tipsters", "Tipsters", <Users key="u" size={12} />], ["leaderboard", "Leaderboard", <Trophy key="t" size={12} />]] as [Tab, string, React.ReactNode][]).map(([value, label, icon]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn("flex items-center gap-1.5 px-4 py-3 text-[12px] font-semibold border-b-2 transition-all", tab === value
              ? "border-[var(--accent)] text-text-primary"
              : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {tab === "leaderboard" && <LeaderboardView tipsters={tipsters} />}

      {tab === "tipsters" && <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6 border-b" style={{ borderColor: "var(--border0)" }}>
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tipsters…"
            className="input-field pl-8 h-9 text-sm w-full"
          />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[11px] text-text-muted mr-1">Sort</span>
          {(["followers", "winrate", "active"] as SortOpt[]).map(s => {
            const label = s === "followers" ? "Popular" : s === "winrate" ? "Win rate" : "Active tips";
            return (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={cn("px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border", sort === s
                  ? "bg-[var(--bg1)] border-[var(--border1)] text-text-primary shadow-sm"
                  : "border-transparent text-text-muted hover:text-text-primary"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="px-4 py-5 lg:px-6">
        {filtered.length === 0 ? (
          <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-6 py-16 shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
            <div className="flex flex-col items-center justify-center gap-5 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10">
                <Users size={28} style={{ color: "var(--accent)" }} />
              </div>
              <div className="max-w-sm">
                <p className="mb-1 text-base font-bold text-text-primary">
                  {search ? `No tipsters matching "${search}"` : "No tipsters yet"}
                </p>
                <p className="text-sm text-text-muted">
                  {search
                    ? "Try a different search or clear the filter."
                    : "Be the first to post a tip and build your reputation on the board."}
                </p>
              </div>
              {!search && (
                <button
                  onClick={() => setShowPostModal(true)}
                  className="btn btn-primary flex h-10 items-center gap-2 px-6 text-sm"
                >
                  <Plus size={14} /> Post your first tip
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(t => (
              <div key={t.id}>
              <TipsterCard
                tipster={t}
                onOpen={() => handleOpenTipster(t)}
                onFollow={() => handleFollow(t.id)}
              />
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-text-muted text-center mt-8">
          Win rates are calculated over the last 7 days. Past performance does not guarantee future results.
        </p>
      </div>
      </>}

      {/* Tipster detail modal */}
      {openTipster && (
        <TipsterModal
          tipster={openTipster}
          tips={openTips}
          onClose={() => { setOpenTipster(null); setOpenTips([]); }}
          onFollow={() => handleFollow(openTipster.id)}
        />
      )}

      {/* Post tip modal */}
      {showPostModal && (
        <PostTipModal
          onClose={() => setShowPostModal(false)}
          onPosted={() => {}}
        />
      )}
    </>
  );
}
