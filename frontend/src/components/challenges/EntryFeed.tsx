"use client";

import { useState, useCallback } from "react";
import { getChallengeEntries } from "@/lib/api";
import type { ChallengeEntry, EntryFeedPage } from "@/lib/types";
import { Inbox, Clock, CheckCircle2, XCircle, Lock } from "lucide-react";
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

function StatusIcon({ status }: { status: ChallengeEntry["status"] }) {
  if (status === "open")    return <Clock size={12} className="text-white/40" />;
  if (status === "locked")  return <Lock size={12} className="text-yellow-400/70" />;
  if (status === "settled") return <CheckCircle2 size={12} className="text-emerald-400" />;
  return <XCircle size={12} className="text-red-400/70" />;
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
      className={cn(
        "flex items-center gap-3 px-4 py-3 border-b transition-colors hover:bg-white/[0.02]",
        won ? "border-b-emerald-500/10" : lost ? "border-b-red-500/10" : ""
      )}
      style={{ borderColor: "var(--border0)" }}
    >
      {/* Status stripe */}
      <div className={cn(
        "w-0.5 self-stretch rounded-full flex-shrink-0",
        entry.status === "open" ? "bg-white/20" :
        entry.status === "locked" ? "bg-yellow-400/50" :
        won ? "bg-emerald-400" :
        lost ? "bg-red-400/60" : "bg-white/15"
      )} />

      {/* Sport icon */}
      <span className="text-sm flex-shrink-0 w-5 text-center">
        {SPORT_ICONS[entry.sport] ?? "🏆"}
      </span>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-bold text-text-primary truncate max-w-[200px]">{selection}</p>
          <span className="text-[10px] text-white/35">·</span>
          <p className="text-[11px] text-white/50 truncate">{market}</p>
        </div>
        <p className="text-[11px] text-white/40 mt-0.5 truncate">{matchLabel}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-white/30">{formatDate(entry.event_start_at)}</span>
          {entry.scope !== undefined && (
            <span className="text-[10px] text-white/25">· {shortId(entry.user_id)}</span>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        {/* Odds + edge */}
        <div className="flex items-center gap-1.5">
          {odds != null && (
            <span className="text-xs font-mono font-bold text-text-primary">{odds.toFixed(2)}</span>
          )}
          {edgePct != null && edgePct !== 0 && (
            <span className={cn(
              "text-[10px] font-semibold px-1.5 py-px rounded",
              edgePct > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
            )}>
              {edgePct > 0 ? "+" : ""}{edgePct.toFixed(1)}%
            </span>
          )}
        </div>
        {/* Status + score */}
        <div className="flex items-center gap-1.5">
          <StatusIcon status={entry.status} />
          {isSettled && entry.score_value != null ? (
            <span className={cn(
              "text-[11px] font-bold",
              won ? "text-emerald-400" : "text-white/35"
            )}>
              {won ? `+${entry.score_value.toFixed(2)}` : entry.score_value.toFixed(2)}
            </span>
          ) : (
            <span className={cn(
              "text-[10px] font-medium capitalize",
              entry.status === "locked" ? "text-yellow-400/70" :
              isVoid ? "text-white/30" : "text-white/40"
            )}>
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
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");

  const loadPage = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const result = await getChallengeEntries(challengeId, { scope, page: p, page_size: 20 });
        setData(result);
        setPage(p);
      } finally {
        setLoading(false);
      }
    },
    [challengeId, scope]
  );

  const filtered = data.items.filter((e) => {
    if (filter === "open")    return e.status === "open" || e.status === "locked";
    if (filter === "settled") return e.status === "settled" || e.status === "void";
    return true;
  });

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b" style={{ borderColor: "var(--border0)" }}>
        {(["all", "open", "settled"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-full text-[11px] font-semibold capitalize transition-all",
              filter === f
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/70"
            )}
          >
            {f === "open" ? "Open" : f === "settled" ? "Settled" : "All"}
            {f === "open" && (
              <span className="ml-1.5 text-[10px] text-white/30">
                {data.items.filter(e => e.status === "open" || e.status === "locked").length}
              </span>
            )}
            {f === "settled" && (
              <span className="ml-1.5 text-[10px] text-white/30">
                {data.items.filter(e => e.status === "settled" || e.status === "void").length}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-white/25">{data.total} total</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-4 flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer h-16 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-white/30">
          <Inbox size={28} className="opacity-40" />
          <p className="text-sm font-medium text-white/40">
            {filter === "open" ? "No open bets" : filter === "settled" ? "No settled bets" : "No picks yet"}
          </p>
        </div>
      ) : (
        filtered.map((entry) => <EntryRow key={entry.id} entry={entry} />)
      )}

      {/* Pagination */}
      {(data.has_next || page > 1) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ borderColor: "var(--border0)" }}>
          <button className="btn btn-md btn-ghost" disabled={page === 1} onClick={() => loadPage(page - 1)} style={{ fontSize: 11 }}>
            Previous
          </button>
          <span className="text-[11px] text-white/30">Page {page}</span>
          <button className="btn btn-md btn-ghost" disabled={!data.has_next} onClick={() => loadPage(page + 1)} style={{ fontSize: 11 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
