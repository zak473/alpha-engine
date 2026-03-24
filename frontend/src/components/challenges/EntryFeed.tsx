"use client";

import { useState, useCallback, useEffect } from "react";
import { getChallengeEntries } from "@/lib/api";
import type { ChallengeEntry, EntryFeedPage } from "@/lib/types";
import { Inbox, Clock, CheckCircle2, XCircle, Lock, TrendingUp, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  challengeId: string;
  scope: "feed" | "mine";
  initialData: EntryFeedPage;
}

const SPORT_ICONS: Record<string, string> = {
  soccer: "⚽", tennis: "🎾", basketball: "🏀",
  baseball: "⚾", hockey: "🏒", esports: "🎮",
};

function getPayloadField(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

function getOdds(payload: Record<string, unknown>): number | null {
  const v = payload["odds"];
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = parseFloat(v); if (!isNaN(n)) return n; }
  return null;
}

function formatMatchLabel(entry: ChallengeEntry): string {
  return (
    getPayloadField(entry.pick_payload, "match_label", "matchLabel") ??
    entry.event_id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  );
}

function formatSelection(entry: ChallengeEntry): string {
  return (
    getPayloadField(entry.pick_payload, "selection_label", "selection", "selectionLabel") ??
    entry.pick_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  );
}

function formatMarket(entry: ChallengeEntry): string {
  return (
    getPayloadField(entry.pick_payload, "market_name", "marketName") ??
    entry.pick_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  );
}

function shortId(userId: string) {
  return userId.startsWith("user-") ? userId.slice(5) : userId;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Filter = "all" | "open" | "settled";

interface EntryStats {
  total: number;
  open: number;
  won: number;
  lost: number;
  void: number;
}

function computeStats(items: ChallengeEntry[]): EntryStats {
  let open = 0, won = 0, lost = 0, voidCount = 0;
  for (const e of items) {
    if (e.status === "open" || e.status === "locked") open++;
    else if (e.status === "void") voidCount++;
    else if (e.status === "settled") {
      if (e.score_value != null && e.score_value > 0) won++;
      else lost++;
    }
  }
  return { total: items.length, open, won, lost, void: voidCount };
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span className="num" style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 10, color: "var(--text2)" }}>{label}</span>
    </div>
  );
}

function StatsBar({ stats, serverTotal }: { stats: EntryStats; serverTotal: number }) {
  const settled = stats.won + stats.lost;
  const winRate = settled > 0 ? (stats.won / settled) * 100 : null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 0,
      padding: "12px 20px",
      borderBottom: "1px solid var(--border0)",
      background: "rgba(255,255,255,0.015)",
      flexWrap: "wrap",
      rowGap: 8,
    }}>
      {/* Stat pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, flex: 1, flexWrap: "wrap" }}>
        <StatPill label="Total" value={serverTotal} color="var(--text0)" />
        <div style={{ width: 1, height: 20, background: "var(--border0)", flexShrink: 0 }} />
        <StatPill label="Active" value={stats.open} color="var(--warning, #f59e0b)" />
        <StatPill label="Won" value={stats.won} color="var(--positive)" />
        <StatPill label="Lost" value={stats.lost} color="var(--negative)" />
        {stats.void > 0 && <StatPill label="Void" value={stats.void} color="var(--text2)" />}
      </div>

      {/* Win rate */}
      {winRate !== null && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 20,
          background: winRate >= 50 ? "rgba(34,226,131,0.08)" : "rgba(255,80,80,0.08)",
          border: `1px solid ${winRate >= 50 ? "rgba(34,226,131,0.2)" : "rgba(255,80,80,0.2)"}`,
        }}>
          <TrendingUp size={11} style={{ color: winRate >= 50 ? "var(--positive)" : "var(--negative)" }} />
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            color: winRate >= 50 ? "var(--positive)" : "var(--negative)",
          }}>
            {winRate.toFixed(1)}% win rate
          </span>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: ChallengeEntry["status"] }) {
  if (status === "open")    return <Clock size={12} style={{ color: "rgba(255,255,255,0.35)" }} />;
  if (status === "locked")  return <Lock size={12} style={{ color: "rgba(245,158,11,0.7)" }} />;
  if (status === "settled") return <CheckCircle2 size={12} style={{ color: "var(--positive)" }} />;
  return <XCircle size={12} style={{ color: "rgba(255,80,80,0.6)" }} />;
}

function EntryRow({ entry }: { entry: ChallengeEntry }) {
  const matchLabel = formatMatchLabel(entry);
  const selection = formatSelection(entry);
  const market = formatMarket(entry);
  const odds = getOdds(entry.pick_payload);
  const edge = entry.pick_payload["edge"];
  const edgePct = typeof edge === "number" ? edge * 100 : null;
  const isSettled = entry.status === "settled";
  const isVoid = entry.status === "void";
  const won = isSettled && entry.score_value != null && entry.score_value > 0;
  const lost = isSettled && entry.score_value != null && entry.score_value <= 0;

  return (
    <div
      className="hover:bg-white/[0.02] transition-colors"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border0)",
      }}
    >
      {/* Status stripe */}
      <div style={{
        width: 3,
        alignSelf: "stretch",
        borderRadius: 3,
        flexShrink: 0,
        background: entry.status === "open" ? "rgba(255,255,255,0.15)"
          : entry.status === "locked" ? "rgba(245,158,11,0.5)"
          : won ? "var(--positive)"
          : lost ? "rgba(255,80,80,0.55)"
          : "rgba(255,255,255,0.1)",
      }} />

      {/* Sport icon */}
      <span style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: "center" }}>
        {SPORT_ICONS[entry.sport] ?? "🏆"}
      </span>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text0)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
            {selection}
          </p>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>·</span>
          <p style={{ fontSize: 11, color: "var(--text2)", margin: 0 }}>{market}</p>
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {matchLabel}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{formatDate(entry.event_start_at)}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>· {shortId(entry.user_id)}</span>
        </div>
      </div>

      {/* Right: odds + status */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {odds != null && (
            <span className="num" style={{ fontSize: 13, fontWeight: 700, color: "var(--text0)" }}>{odds.toFixed(2)}</span>
          )}
          {edgePct != null && edgePct !== 0 && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 4,
              background: edgePct > 0 ? "rgba(34,226,131,0.1)" : "rgba(255,80,80,0.1)",
              color: edgePct > 0 ? "var(--positive)" : "var(--negative)",
            }}>
              {edgePct > 0 ? "+" : ""}{edgePct.toFixed(1)}%
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <StatusIcon status={entry.status} />
          {isSettled && entry.score_value != null ? (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: won ? "var(--positive)" : "rgba(255,255,255,0.3)",
            }}>
              {won ? `+${entry.score_value.toFixed(2)}` : entry.score_value.toFixed(2)}
            </span>
          ) : (
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              textTransform: "capitalize",
              color: entry.status === "locked" ? "rgba(245,158,11,0.7)"
                : isVoid ? "rgba(255,255,255,0.25)"
                : "rgba(255,255,255,0.35)",
            }}>
              {entry.status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function EntryFeed({ challengeId, scope, initialData }: Props) {
  const [data, setData] = useState<EntryFeedPage>(initialData);
  const [loading, setLoading] = useState(true); // start loading — will fetch client-side
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [allItems, setAllItems] = useState<ChallengeEntry[]>(initialData.items);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadPage = useCallback(
    async (p: number) => {
      setLoading(true);
      setFetchError(null);
      try {
        const result = await getChallengeEntries(challengeId, { scope, page: p, page_size: 20 });
        setData(result);
        setPage(p);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Failed to load picks");
      } finally {
        setLoading(false);
      }
    },
    [challengeId, scope]
  );

  // Always fetch client-side on mount — server-side lacks auth cookie so SSR data may be empty
  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  // Fetch a larger set for accurate stats
  useEffect(() => {
    setStatsLoading(true);
    getChallengeEntries(challengeId, { scope, page: 1, page_size: 100 })
      .then((result) => setAllItems(result.items))
      .finally(() => setStatsLoading(false));
  }, [challengeId, scope]);

  const stats = computeStats(allItems);

  const openCount = data.items.filter(e => e.status === "open" || e.status === "locked").length;
  const settledCount = data.items.filter(e => e.status === "settled" || e.status === "void").length;

  const filtered = data.items.filter((e) => {
    if (filter === "open")    return e.status === "open" || e.status === "locked";
    if (filter === "settled") return e.status === "settled" || e.status === "void";
    return true;
  });

  return (
    <div>
      {/* Stats bar */}
      {!statsLoading && <StatsBar stats={stats} serverTotal={data.total} />}
      {statsLoading && (
        <div style={{ height: 48, background: "rgba(255,255,255,0.015)", borderBottom: "1px solid var(--border0)" }} className="shimmer" />
      )}

      {/* Filter tabs */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "8px 16px",
        borderBottom: "1px solid var(--border0)",
      }}>

        {(["all", "open", "settled"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "capitalize",
              transition: "all 0.15s",
              background: filter === f ? "rgba(255,255,255,0.1)" : "transparent",
              color: filter === f ? "var(--text0)" : "var(--text2)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {f === "open" ? "Active" : f === "settled" ? "Settled" : "All"}
            <span style={{ fontSize: 10, color: filter === f ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)" }}>
              {f === "all" ? data.total : f === "open" ? openCount : settledCount}
            </span>
          </button>
        ))}
        <button
          onClick={() => loadPage(page)}
          title="Refresh"
          style={{
            marginLeft: "auto",
            padding: 4,
            borderRadius: 6,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.25)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div style={{ margin: "12px 16px", padding: "10px 14px", borderRadius: 10, background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)" }}>
          <p style={{ fontSize: 11, color: "var(--negative)", margin: 0 }}>{fetchError}</p>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer" style={{ height: 64, borderRadius: 8 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "48px 24px", color: "rgba(255,255,255,0.25)" }}>
          <Inbox size={28} style={{ opacity: 0.4 }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.35)", margin: 0 }}>
            {filter === "open" ? "No active bets" : filter === "settled" ? "No settled bets" : "No picks yet"}
          </p>
        </div>
      ) : (
        filtered.map((entry) => <EntryRow key={entry.id} entry={entry} />)
      )}

      {/* Pagination */}
      {(data.has_next || page > 1) && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderTop: "1px solid var(--border0)",
        }}>
          <button className="btn btn-md btn-ghost" disabled={page === 1} onClick={() => loadPage(page - 1)} style={{ fontSize: 11 }}>
            Previous
          </button>
          <span style={{ fontSize: 11, color: "var(--text2)" }}>Page {page}</span>
          <button className="btn btn-md btn-ghost" disabled={!data.has_next} onClick={() => loadPage(page + 1)} style={{ fontSize: 11 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
