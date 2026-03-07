"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { FilterBar, type SportFilter, type RangeFilter, type FocusViewDef } from "@/components/dashboard/FilterBar";
import { MarketsTable } from "@/components/dashboard/MarketsTable";
import { PerformanceSnapshot } from "@/components/dashboard/PerformanceSnapshot";
import { EloMovers } from "@/components/dashboard/EloMovers";
import { ChallengesWidget } from "@/components/dashboard/ChallengesWidget";
import { CompareModal } from "@/components/dashboard/CompareModal";
import { DashboardLeftRail } from "@/components/dashboard/DashboardLeftRail";
import { SlipRail } from "@/components/dashboard/SlipRail";
import { DecisionQueue, type QueueItem } from "@/components/dashboard/DecisionQueue";
import { InPlayModule } from "@/components/dashboard/InPlayModule";
import type { MvpPrediction, MvpPerformance, Challenge, LeaderboardOut } from "@/lib/types";
import type { LiveMatchOut } from "@/lib/api";

interface DashboardShellProps {
  predictions: MvpPrediction[];
  performance: MvpPerformance | null;
  myChallenges: Challenge[];
  leaderboards: LeaderboardOut[];
  liveMatches: LiveMatchOut[];
  systemStatus: { api: boolean; db: boolean; env: string };
  initialSport: SportFilter;
  initialRange: RangeFilter;
  userId: string;
}

export function DashboardShell({
  predictions,
  performance,
  myChallenges,
  leaderboards,
  liveMatches,
  systemStatus,
  initialSport,
  initialRange,
  userId,
}: DashboardShellProps) {
  // ── Rail open/close ───────────────────────────────────────────────────────
  const [leftOpen,  setLeftOpen]  = useState(true);
  const [slipOpen,  setSlipOpen]  = useState(true);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [q,             setQ]             = useState("");
  const [activeSport,   setActiveSport]   = useState<string | null>(null);
  const [activeLeague,  setActiveLeague]  = useState<string | null>(null);
  const [activeFocusId, setActiveFocusId] = useState<string | null>(null);
  const [focusMinConf,  setFocusMinConf]  = useState(0);
  const [focusMaxHours, setFocusMaxHours] = useState<number | null>(null);
  const [entityFilter,  setEntityFilter]  = useState<string | null>(null);

  // ── Queue + compare ───────────────────────────────────────────────────────
  const [queueItems,   setQueueItems]   = useState<QueueItem[]>([]);
  const [compareItems, setCompareItems] = useState<string[]>([]);
  const [compareOpen,  setCompareOpen]  = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── Keyboard: S = toggle slip, L = toggle left rail ──────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "s" || e.key === "S") setSlipOpen((v) => !v);
      if (e.key === "l" || e.key === "L") setLeftOpen((v) => !v);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Filtered predictions ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = Date.now();
    const rangeMs: Record<RangeFilter, number> = {
      today: 86_400_000,
      "7d":  7 * 86_400_000,
      "30d": 30 * 86_400_000,
    };

    return predictions.filter((p) => {
      if (initialSport !== "all" && p.sport !== initialSport) return false;
      const start = new Date(p.start_time).getTime();
      if (start - now > rangeMs[initialRange]) return false;
      if (start < now) return false;
      if (activeSport  && p.sport   !== activeSport)  return false;
      if (activeLeague && p.league  !== activeLeague)  return false;
      if (focusMinConf > 0 && p.confidence < focusMinConf) return false;
      if (focusMaxHours !== null && start - now > focusMaxHours * 3_600_000) return false;
      if (q) {
        const needle   = q.toLowerCase();
        const haystack = [p.participants.home.name, p.participants.away.name, p.league, p.sport].join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (entityFilter) {
        const hay = [p.participants.home.name, p.participants.away.name].join(" ").toLowerCase();
        if (!hay.includes(entityFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [predictions, initialSport, initialRange, activeSport, activeLeague, q, focusMinConf, focusMaxHours, entityFilter]);

  // ── Focus views ───────────────────────────────────────────────────────────
  function handleFocusChange(view: FocusViewDef | null) {
    if (!view) {
      setActiveFocusId(null);
      setFocusMinConf(0);
      setFocusMaxHours(null);
      return;
    }
    setActiveFocusId(view.id);
    setFocusMinConf(view.minConf ?? 0);
    setFocusMaxHours(view.maxHours ?? null);
  }

  // ── Compare ───────────────────────────────────────────────────────────────
  function handleCompareToggle(id: string) {
    if (id === "__open__") { setCompareOpen(true); return; }
    if (id === "__clear__") { setCompareItems([]); return; }
    setCompareItems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]
    );
  }

  // ── Queue ─────────────────────────────────────────────────────────────────
  function addToQueue(item: QueueItem) {
    setQueueItems((prev) =>
      prev.find((q) => q.eventId === item.eventId) ? prev : [...prev, item]
    );
  }
  function removeFromQueue(id: string) {
    setQueueItems((prev) => prev.filter((q) => q.eventId !== id));
  }

  // ── Model staleness ───────────────────────────────────────────────────────
  const liveModel = performance?.models.find((m) => m.is_live);
  const modelStaleDays = liveModel?.trained_at
    ? Math.floor((Date.now() - new Date(liveModel.trained_at).getTime()) / 86_400_000)
    : null;

  const expiringCount = filtered.filter(
    (p) => new Date(p.start_time).getTime() - Date.now() < 7_200_000
  ).length;

  const challengeEndingSoon = myChallenges.find(
    (c) => new Date(c.end_at).getTime() - Date.now() < 3_600_000 * 6
  );

  const comparePredictions = predictions.filter((p) => compareItems.includes(p.event_id));

  // ── Compact KPI values ────────────────────────────────────────────────────
  const avgEdge = filtered.length > 0
    ? (filtered.reduce((sum, p) => sum + (p.confidence - 50), 0) / filtered.length / 10).toFixed(1)
    : "0.0";

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">

      {/* ── Left rail: sports + leagues ────────────────────────────────────── */}
      <DashboardLeftRail
        predictions={predictions}
        activeSport={activeSport}
        activeLeague={activeLeague}
        onSportSelect={setActiveSport}
        onLeagueSelect={setActiveLeague}
        activeFocusId={activeFocusId}
        onFocusChange={handleFocusChange}
        open={leftOpen}
        onToggle={() => setLeftOpen((v) => !v)}
      />

      {/* ── Center: sticky toolbar + markets ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Compact inline KPI bar */}
        <div className="kpi-bar shrink-0">
          <span className="kpi-bar-item">
            <span style={{ color: "var(--text2)" }}>Showing</span>
            <span className="num" style={{ fontWeight: 600, color: "var(--text0)" }}>{filtered.length}</span>
            <span style={{ color: "var(--text2)" }}>markets</span>
          </span>
          <span className="kpi-bar-item">
            <span style={{ color: "var(--text2)" }}>Avg edge</span>
            <span className="num" style={{ fontWeight: 600, color: Number(avgEdge) >= 0 ? "var(--positive)" : "var(--negative)" }}>
              {Number(avgEdge) >= 0 ? "+" : ""}{avgEdge}%
            </span>
          </span>
          <span className="kpi-bar-item">
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: systemStatus.api && systemStatus.db ? "var(--positive)" : "var(--negative)",
              boxShadow:  systemStatus.api && systemStatus.db ? "0 0 5px rgba(16,185,129,0.7)" : "0 0 5px rgba(244,63,94,0.7)",
            }} />
            <span style={{ color: "var(--text2)" }}>{systemStatus.api && systemStatus.db ? "Live" : "Degraded"}</span>
          </span>
          {liveMatches.filter((m) => m.is_live).length > 0 && (
            <span className="kpi-bar-item">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
              </span>
              <span style={{ color: "var(--text2)" }}>Live</span>
              <span className="num" style={{ fontWeight: 600, color: "#22c55e" }}>{liveMatches.filter((m) => m.is_live).length}</span>
            </span>
          )}
          {queueItems.length > 0 && (
            <span className="kpi-bar-item">
              <span style={{ color: "var(--text2)" }}>Queue</span>
              <span className="num" style={{ fontWeight: 600, color: "var(--accent)" }}>{queueItems.length}</span>
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--text2)", fontFamily: "'JetBrains Mono', monospace" }} className="hidden sm:inline">
            S · L — toggle rails
          </span>
        </div>

        {/* Scrollable center content */}
        <div className="flex-1 overflow-y-auto min-w-0">

          {/* Filter bar (sticky within scroll container) */}
          <div className="sticky top-0 z-20 bg-surface-base border-b border-surface-border">
            <FilterBar
              sport={initialSport}
              range={initialRange}
              q={q}
              onQChange={setQ}
              activeFocusId={activeFocusId}
              onFocusChange={handleFocusChange}
              searchRef={searchRef}
            />
          </div>

          {/* Markets table */}
          <MarketsTable
            predictions={filtered}
            compareItems={compareItems}
            onCompareToggle={handleCompareToggle}
            onQueueAdd={addToQueue}
            stickyOffset={0}
          />

          {/* Bottom panels: InPlay + Performance + ELO + Challenges */}
          <div className="p-4 space-y-4 border-t border-surface-border">
            {/* InPlay — full width if there are live matches */}
            {liveMatches.length > 0 && (
              <InPlayModule matches={liveMatches} />
            )}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <PerformanceSnapshot performance={performance} />
              <div className="space-y-4">
                <EloMovers onEntityClick={(name) => setEntityFilter((prev) => prev === name ? null : name)} />
                <ChallengesWidget
                  challenges={myChallenges}
                  leaderboards={leaderboards}
                  userId={userId}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right slip rail: queue + watchlist + alerts ─────────────────────── */}
      <SlipRail
        queueItems={queueItems}
        onApprove={removeFromQueue}
        onSkip={removeFromQueue}
        predictions={predictions}
        performance={performance}
        systemStatus={systemStatus}
        modelStaleDays={modelStaleDays}
        expiringCount={expiringCount}
        challengeEndingName={challengeEndingSoon?.name}
        open={slipOpen}
        onToggle={() => setSlipOpen((v) => !v)}
      />

      {/* ── Compare modal ────────────────────────────────────────────────────── */}
      <CompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        predictions={comparePredictions}
      />
    </div>
  );
}
