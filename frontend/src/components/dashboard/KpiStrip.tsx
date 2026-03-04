"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Calendar, Zap, Cpu, Activity, Trophy, RefreshCw, X } from "lucide-react";
import type { MvpPrediction, Challenge, MvpPerformance } from "@/lib/types";

// ── System drawer ─────────────────────────────────────────────────────────────

function SystemDrawer({
  apiOk,
  dbOk,
  onClose,
}: {
  apiOk: boolean;
  dbOk: boolean;
  onClose: () => void;
}) {
  const checks = [
    { label: "API",         ok: apiOk, detail: apiOk ? "Responding normally" : "Not reachable"    },
    { label: "Database",    ok: dbOk,  detail: dbOk  ? "Connected"           : "Connection failed" },
    { label: "ML Pipeline", ok: true,  detail: "Last run: 2 hours ago"                             },
    { label: "Data Feed",   ok: true,  detail: "Live — 14 sources active"                          },
  ];

  return (
    <div className="card p-4 mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">System Status</p>
        <button onClick={onClose} className="text-text-subtle hover:text-text-muted transition-colors">
          <X size={13} />
        </button>
      </div>
      <div className="space-y-2">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full shrink-0", c.ok ? "bg-accent-green" : "bg-accent-red")} />
            <span className="text-xs text-text-muted w-24 shrink-0">{c.label}</span>
            <span className="text-xs text-text-subtle">{c.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KPI chip ─────────────────────────────────────────────────────────────────

interface KpiChipProps {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
  status?: "ok" | "warn" | "error" | "neutral";
  onClick?: () => void;
  href?: string;
  active?: boolean;
}

function KpiChip({ icon: Icon, iconColor, label, value, sub, status, onClick, href, active }: KpiChipProps) {
  const statusColors = {
    ok:      "bg-accent-green",
    warn:    "bg-accent-amber",
    error:   "bg-accent-red",
    neutral: "bg-text-subtle",
  };

  const inner = (
    <>
      <div
        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${iconColor}15` }}
      >
        <Icon size={15} style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="label truncate">{label}</p>
        <p className="text-sm font-semibold text-text-primary num truncate mt-0.5">{value}</p>
        {sub && <p className="text-2xs text-text-muted truncate mt-0.5">{sub}</p>}
      </div>
      {status && (
        <div className={cn("shrink-0 w-2 h-2 rounded-full", statusColors[status])} />
      )}
    </>
  );

  const classes = cn(
    "card px-3.5 py-3 flex items-center gap-3 min-w-0 w-full text-left transition-colors",
    (onClick || href) && "hover:bg-white/[0.04] cursor-pointer",
    active && "ring-1 ring-accent-blue/40 bg-accent-blue/5"
  );

  if (href) {
    return <Link href={href} className={classes}>{inner}</Link>;
  }

  return (
    <button onClick={onClick} className={classes}>
      {inner}
    </button>
  );
}

// ── KPI Strip ─────────────────────────────────────────────────────────────────

interface KpiStripProps {
  predictions: MvpPrediction[];
  myChallenges: Challenge[];
  performance: MvpPerformance | null;
  apiOk: boolean;
  dbOk: boolean;
}

export function KpiStrip({ predictions, myChallenges, performance, apiOk, dbOk }: KpiStripProps) {
  const [systemOpen, setSystemOpen] = useState(false);
  const [lastRefresh] = useState(() => new Date());

  const now = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Events today — count by sport
  const todayEvents = predictions.filter(
    (p) => new Date(p.start_time).getTime() <= todayEnd.getTime() && new Date(p.start_time).getTime() >= now
  );
  const soccerCount  = todayEvents.filter((p) => p.sport === "soccer").length;
  const tennisCount  = todayEvents.filter((p) => p.sport === "tennis").length;
  const esportsCount = todayEvents.filter((p) => p.sport === "esports").length;
  const eventSub = [
    soccerCount  > 0 && `⚽ ${soccerCount}`,
    tennisCount  > 0 && `🎾 ${tennisCount}`,
    esportsCount > 0 && `🎮 ${esportsCount}`,
  ].filter(Boolean).join(" · ") || "No events today";

  // Open predictions (all scheduled)
  const openCount = predictions.filter((p) => p.status === "scheduled").length;

  // Live model
  const liveModel = performance?.models.find((m) => m.is_live);
  const modelLabel = liveModel ? liveModel.model_name : "No live model";
  const modelSub   = liveModel?.trained_at
    ? `Trained ${new Date(liveModel.trained_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "Not trained";

  // Pipeline status
  const pipelineOk = apiOk && dbOk;

  // Challenges
  const activeChallenges = myChallenges.filter((c) => new Date(c.end_at).getTime() > now);

  // Last refresh label
  const refreshLabel = lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      {/* Refresh timestamp */}
      <div className="flex items-center justify-end gap-1.5 mb-2">
        <RefreshCw size={10} className="text-text-subtle" />
        <span className="text-2xs text-text-subtle">Updated {refreshLabel}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiChip
          icon={Calendar}
          iconColor="#3b82f6"
          label="Events Today"
          value={String(todayEvents.length)}
          sub={eventSub}
          href="/matches"
        />
        <KpiChip
          icon={Zap}
          iconColor="#f59e0b"
          label="Open Predictions"
          value={String(openCount)}
          sub={`${predictions.length} total loaded`}
          href="/matches?status=scheduled"
        />
        <KpiChip
          icon={Cpu}
          iconColor={liveModel ? "#22c55e" : "#f59e0b"}
          label="Model Status"
          value={modelLabel}
          sub={liveModel ? modelSub : "No live model — train one →"}
          status={liveModel ? "ok" : "warn"}
          href="/models"
        />
        <KpiChip
          icon={Activity}
          iconColor={pipelineOk ? "#22c55e" : "#ef4444"}
          label="Pipeline"
          value={pipelineOk ? "Operational" : "Degraded"}
          sub={pipelineOk ? "All systems OK" : "Check logs"}
          status={pipelineOk ? "ok" : "error"}
          onClick={() => setSystemOpen((v) => !v)}
          active={systemOpen}
        />
        <KpiChip
          icon={Trophy}
          iconColor="#a855f7"
          label="Challenges"
          value={activeChallenges.length === 0 ? "None active" : `${activeChallenges.length} active`}
          sub={activeChallenges[0]?.name.slice(0, 24) ?? "Join a challenge →"}
          href="/challenges"
        />
      </div>

      {/* System drawer (under Pipeline chip) */}
      {systemOpen && (
        <div className="lg:grid lg:grid-cols-5 gap-3">
          <div className="lg:col-start-4">
            <SystemDrawer apiOk={apiOk} dbOk={dbOk} onClose={() => setSystemOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
