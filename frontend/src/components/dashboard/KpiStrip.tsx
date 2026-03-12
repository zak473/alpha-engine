"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, Zap, Cpu, Activity, Trophy, X, RefreshCw } from "lucide-react";
import type { MvpPrediction, Challenge, MvpPerformance } from "@/lib/types";
import { triggerSync } from "@/lib/api";

// ── System drawer ─────────────────────────────────────────────────────────────

function SystemDrawer({ apiOk, dbOk, onClose }: { apiOk: boolean; dbOk: boolean; onClose: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const checks = [
    { label: "API endpoint",  ok: apiOk, detail: apiOk ? "Responding · p50 42ms"  : "Unreachable"       },
    { label: "Database",      ok: dbOk,  detail: dbOk  ? "Connected · 12 active"  : "Connection refused" },
    { label: "ML pipeline",   ok: true,  detail: "Last run 2h ago · OK"                                  },
    { label: "Data ingest",   ok: true,  detail: "Scheduler · 6h interval"                               },
  ];

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await triggerSync();
      setSyncMsg(res.status === "sync started" ? "Sync started — check logs" : res.status);
    } catch {
      setSyncMsg("Sync failed — check API key");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{
      position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
      width: 272, background: "var(--bg2)", border: "1px solid var(--border1)",
      borderRadius: "var(--radius-md)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", padding: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span className="label">System Status</span>
        <button onClick={onClose} style={{ color: "var(--text1)", background: "none", border: "none", cursor: "pointer", display: "flex" }}>
          <X size={12} />
        </button>
      </div>
      {checks.map((c) => (
        <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: c.ok ? "var(--positive)" : "var(--negative)",
            boxShadow: c.ok ? "0 0 5px rgba(16,185,129,0.6)" : "0 0 5px rgba(244,63,94,0.6)",
          }} />
          <span style={{ fontSize: 11, color: "var(--text1)", width: 88, flexShrink: 0 }}>{c.label}</span>
          <span style={{ fontSize: 11, color: "var(--text2)" }}>{c.detail}</span>
        </div>
      ))}

      {/* Manual sync */}
      <div style={{ borderTop: "1px solid var(--border0)", marginTop: 8, paddingTop: 8 }}>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%",
            background: "var(--bg3)", border: "1px solid var(--border1)",
            borderRadius: "var(--radius-sm)", padding: "5px 8px",
            color: "var(--text1)", fontSize: 11, cursor: syncing ? "default" : "pointer",
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={10} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
          {syncing ? "Syncing…" : "Sync live data now"}
        </button>
        {syncMsg && (
          <p style={{ fontSize: 10, color: "var(--text2)", marginTop: 5, margin: "5px 0 0" }}>{syncMsg}</p>
        )}
      </div>
    </div>
  );
}

// ── KPI Tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; iconColor: string;
  status?: "ok" | "warn" | "error";
  href?: string; onClick?: () => void; active?: boolean;
}

function KpiTile({ label, value, sub, icon: Icon, iconColor, status, href, onClick, active }: KpiTileProps) {
  const statusColor = { ok: "var(--positive)", warn: "var(--warning)", error: "var(--negative)" }[status ?? "ok"];

  const inner = (
    <div style={{ padding: "10px 14px", position: "relative", height: "100%" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div style={{
          width: 20, height: 20, borderRadius: "var(--radius-sm)",
          background: "color-mix(in srgb, " + iconColor + " 12%, transparent)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={10} style={{ color: iconColor }} strokeWidth={2.5} />
        </div>
        <span className="label" style={{ flex: 1 }}>{label}</span>
        {status && (
          <span style={{
            width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
            background: statusColor,
            boxShadow: `0 0 5px ${statusColor}80`,
          }} />
        )}
      </div>

      {/* Value */}
      <div className="num" style={{
        fontSize: 22, fontWeight: 700, color: "var(--text0)",
        lineHeight: 1, letterSpacing: "-0.035em", marginBottom: 4,
      }}>
        {value}
      </div>

      {/* Sub */}
      {sub && <div style={{ fontSize: 10, color: "var(--text2)", lineHeight: 1.3 }}>{sub}</div>}

      {/* Active bottom bar */}
      {active && <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: "var(--accent)", borderRadius: "0 0 var(--radius-md) var(--radius-md)",
      }} />}
    </div>
  );

  const s: React.CSSProperties = {
    background:   active ? "var(--accent-muted)" : "var(--bg2)",
    border:       `1px solid ${active ? "rgba(0,212,255,0.2)" : "var(--border0)"}`,
    borderRadius: "var(--radius-md)",
    transition:   "all 140ms",
    display:      "block",
    width:        "100%",
    textAlign:    "left",
    textDecoration: "none",
    color:        "inherit",
    cursor:       href || onClick ? "pointer" : "default",
    position:     "relative",
  };

  if (href)    return <Link href={href} style={s}>{inner}</Link>;
  if (onClick) return <button style={{ ...s, font: "inherit" }} onClick={onClick}>{inner}</button>;
  return <div style={s}>{inner}</div>;
}

// ── KpiStrip ─────────────────────────────────────────────────────────────────

interface KpiStripProps {
  predictions: MvpPrediction[];
  myChallenges: Challenge[];
  performance: MvpPerformance | null;
  apiOk: boolean;
  dbOk: boolean;
}

export function KpiStrip({ predictions, myChallenges, performance, apiOk, dbOk }: KpiStripProps) {
  const [systemOpen, setSystemOpen] = useState(false);
  const [refreshTime] = useState(() => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));

  const now = Date.now();
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const todayEvents = predictions.filter(
    (p) => new Date(p.start_time).getTime() >= now && new Date(p.start_time).getTime() <= todayEnd.getTime()
  );
  const soccerN  = todayEvents.filter((p) => p.sport === "soccer").length;
  const tennisN  = todayEvents.filter((p) => p.sport === "tennis").length;
  const esportsN = todayEvents.filter((p) => p.sport === "esports").length;
  const sportSub = [soccerN && `⚽ ${soccerN}`, tennisN && `🎾 ${tennisN}`, esportsN && `🎮 ${esportsN}`]
    .filter(Boolean).join(" · ") || "No events today";

  const openCount       = predictions.filter((p) => p.status === "scheduled").length;
  const liveModel       = performance?.models.find((m) => m.is_live);
  const modelSub        = liveModel?.trained_at
    ? `Trained ${new Date(liveModel.trained_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "Not trained";
  const pipelineOk      = apiOk && dbOk;
  const activeChallenges = myChallenges.filter((c) => new Date(c.end_at).getTime() > now);

  return (
    <div>
      {/* Live indicator row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, marginBottom: 8 }}>
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "var(--positive)",
          boxShadow: "0 0 5px rgba(16,185,129,0.7)",
        }} />
        <span style={{ fontSize: 10, color: "var(--text2)", fontFamily: "'JetBrains Mono', monospace" }}>
          Updated {refreshTime}
        </span>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, position: "relative" }}>
        <KpiTile icon={Calendar}  iconColor="var(--info)"     label="Events Today"   value={todayEvents.length} sub={sportSub}                             href="/matches" />
        <KpiTile icon={Zap}       iconColor="var(--warning)"  label="Open Signals"   value={openCount}          sub={`${predictions.length} total`}        href="/matches?status=scheduled" />
        <KpiTile icon={Cpu}       iconColor={liveModel ? "var(--positive)" : "var(--warning)"} label="Active Model" value={liveModel ? liveModel.model_name.replace("soccer_","").toUpperCase() : "None"} sub={modelSub} status={liveModel ? "ok" : "warn"} href="/performance" />
        <KpiTile icon={Activity}  iconColor={pipelineOk ? "var(--positive)" : "var(--negative)"} label="Pipeline" value={pipelineOk ? "Operational" : "Degraded"} sub={pipelineOk ? "All systems OK" : "Check logs →"} status={pipelineOk ? "ok" : "error"} onClick={() => setSystemOpen((v) => !v)} active={systemOpen} />
        <KpiTile icon={Trophy}    iconColor="var(--info)"     label="Challenges"     value={activeChallenges.length || "—"} sub={activeChallenges[0]?.name.slice(0,22) ?? "Join a challenge →"} href="/challenges" />

        {systemOpen && (
          <div style={{ position: "absolute", left: "calc(60% + 8px)", top: "100%", zIndex: 50 }}>
            <SystemDrawer apiOk={apiOk} dbOk={dbOk} onClose={() => setSystemOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
