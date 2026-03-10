"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";
import Link from "next/link";
import { ExternalLink, BrainCircuit, TrendingUp, Calendar, Zap } from "lucide-react";
import type { MvpPrediction, MvpPredictionList } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────

const SPORT_SLUGS: Record<string, string> = {
  soccer: "soccer", tennis: "tennis", esports: "esports",
  basketball: "basketball", baseball: "baseball",
};

function fmtKickoff(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

function confidenceBar(conf: number) {
  const pct = Math.round(conf * 100);
  const color =
    conf >= 0.7 ? "var(--positive)" :
    conf >= 0.5 ? "var(--warning)" : "var(--negative)";
  return (
    <div className="flex flex-col gap-0.5 min-w-[70px]">
      <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div style={{ width: `${pct}%`, background: color, borderRadius: "inherit" }} />
      </div>
      <span className="text-[10px] font-mono tabular-nums font-semibold" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

function probChips(pHome: number, pAway: number, pDraw?: number | null) {
  const h = Math.round(pHome * 100);
  const a = Math.round(pAway * 100);
  const d = pDraw != null ? Math.round(pDraw * 100) : null;
  return (
    <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
      <span className="font-semibold" style={{ color: "var(--info)" }}>{h}%</span>
      {d != null && <span className="text-t1">/ {d}%</span>}
      <span className="text-t2">/</span>
      <span className="font-semibold" style={{ color: "var(--warning)" }}>{a}%</span>
    </div>
  );
}

function fairOddsChips(oddsHome: number, oddsAway: number, oddsDraw?: number | null) {
  return (
    <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-t1">
      <span>{oddsHome.toFixed(2)}</span>
      {oddsDraw != null && <span>/ {oddsDraw.toFixed(2)}</span>}
      <span className="text-t2">/</span>
      <span>{oddsAway.toFixed(2)}</span>
    </div>
  );
}

function statusBadge(status: string) {
  const cfg: Record<string, { bg: string; color: string }> = {
    live:      { bg: "var(--positive-dim)",  color: "var(--positive)" },
    scheduled: { bg: "var(--info-dim)",       color: "var(--info)"     },
    finished:  { bg: "rgba(255,255,255,0.05)", color: "var(--text1)" },
  };
  const c = cfg[status] ?? cfg.finished;
  return (
    <span className="badge" style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}28` }}>
      {status === "scheduled" ? "upcoming" : status}
    </span>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────

function KpiStrip({ items }: { items: MvpPrediction[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayItems = items.filter((p) => p.start_time.slice(0, 10) === today);
  const avgConf = items.length > 0
    ? items.reduce((s, p) => s + p.confidence, 0) / items.length
    : 0;
  const confColor = avgConf >= 0.7 ? "var(--positive)" : avgConf >= 0.5 ? "var(--warning)" : "var(--text0)";

  return (
    <div className="grid grid-cols-3 gap-3 px-4 pt-4 pb-3 lg:px-6">
      {[
        {
          label: "Predictions",
          value: String(items.length),
          icon: <BrainCircuit size={14} />,
          color: "var(--accent)",
        },
        {
          label: "Today",
          value: String(todayItems.length),
          icon: <Calendar size={14} />,
          color: "var(--info)",
        },
        {
          label: "Avg confidence",
          value: items.length > 0 ? `${Math.round(avgConf * 100)}%` : "—",
          icon: <Zap size={14} />,
          color: confColor,
        },
      ].map(({ label, value, icon, color }) => (
        <div key={label} className="stat-card">
          <div className="flex items-center gap-2 mb-2" style={{ color: "var(--text1)" }}>
            {icon}
            <span className="label text-[10px]">{label}</span>
          </div>
          <p className="metric-hero text-xl" style={{ color }}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────

const SPORTS = [
  { value: "all",        label: "All"        },
  { value: "soccer",     label: "Soccer"     },
  { value: "tennis",     label: "Tennis"     },
  { value: "esports",    label: "Esports"    },
  { value: "basketball", label: "Basketball" },
  { value: "baseball",   label: "Baseball"   },
];

const STATUSES = [
  { value: "all",       label: "All"      },
  { value: "scheduled", label: "Upcoming" },
  { value: "live",      label: "Live"     },
];

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d",    label: "7 days" },
  { value: "30d",   label: "30 days" },
];

const CONF_THRESHOLDS = [
  { value: "0",   label: "All" },
  { value: "0.5", label: "50%+" },
  { value: "0.6", label: "60%+" },
  { value: "0.7", label: "70%+" },
  { value: "0.8", label: "80%+" },
];

function SegGroup<T extends string>({
  options, active, onChange,
}: {
  options: { value: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs-segmented">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="tab-seg-item"
          data-active={active === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────

interface Props {
  initialData: MvpPredictionList;
  initialSport: string;
  initialStatus: string;
  initialRange: string;
}

export function PredictionsShell({ initialData, initialSport, initialStatus, initialRange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [minConf, setMinConf] = useState("0");

  const sport = searchParams.get("sport") ?? initialSport;
  const status = searchParams.get("status") ?? initialStatus;
  const range = searchParams.get("range") ?? initialRange;

  function navigate(updates: Record<string, string>) {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === "all" && k !== "range") p.delete(k); else p.set(k, v);
    });
    startTransition(() => {
      router.replace(`/predictions${p.size ? `?${p}` : ""}`, { scroll: false });
    });
  }

  const threshold = parseFloat(minConf);
  const items = threshold > 0
    ? initialData.items.filter((p) => p.confidence >= threshold)
    : initialData.items;

  return (
    <div className="flex flex-col">
      <KpiStrip items={items} />

      {/* Filter bar */}
      <div
        className="flex flex-col gap-3 px-4 lg:px-6 py-3 border-b"
        style={{ borderColor: "var(--border0)" }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="label">Sport</span>
            <SegGroup
              options={SPORTS as { value: string; label: string }[]}
              active={sport}
              onChange={(v) => navigate({ sport: v })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="label">Status</span>
            <SegGroup
              options={STATUSES as { value: string; label: string }[]}
              active={status}
              onChange={(v) => navigate({ status: v })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="label">Range</span>
            <SegGroup
              options={RANGES as { value: string; label: string }[]}
              active={range}
              onChange={(v) => navigate({ range: v })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="label">Confidence</span>
            <SegGroup
              options={CONF_THRESHOLDS as { value: string; label: string }[]}
              active={minConf}
              onChange={setMinConf}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div style={{
            width: 56, height: 56, borderRadius: "var(--radius-xl)",
            background: "var(--accent-dim)", border: "1px solid var(--accent-ring)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BrainCircuit size={24} style={{ color: "var(--accent)" }} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-t0 mb-1">No predictions found</p>
            <p className="text-xs text-t1 max-w-xs">Try a different sport, status, or date range.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>Match</th>
                <th className="hidden sm:table-cell">Sport</th>
                <th className="hidden md:table-cell">Kickoff</th>
                <th className="text-center">Status</th>
                <th className="col-right">Prob H/A</th>
                <th className="col-right hidden lg:table-cell">Fair Odds H/A</th>
                <th className="col-right">Confidence</th>
                <th className="col-right hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {items.map((pred) => {
                const sportSlug = SPORT_SLUGS[pred.sport] ?? pred.sport;
                const detailHref = `/sports/${sportSlug}/matches/${pred.event_id}`;
                return (
                  <tr
                    key={pred.event_id}
                    className="tr-hover"
                    onClick={() => window.open(detailHref, "_blank")}
                  >
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-t0 font-semibold text-sm leading-tight">
                          {pred.participants.home.name}
                        </span>
                        <span className="text-t1 text-xs">vs {pred.participants.away.name}</span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className="badge badge-muted capitalize">{pred.sport}</span>
                    </td>
                    <td className="hidden md:table-cell text-t1 text-xs whitespace-nowrap">
                      {fmtKickoff(pred.start_time)}
                    </td>
                    <td className="text-center">
                      {statusBadge(pred.status)}
                    </td>
                    <td className="col-right">
                      {probChips(pred.probabilities.home_win, pred.probabilities.away_win, pred.probabilities.draw)}
                    </td>
                    <td className="col-right hidden lg:table-cell">
                      {fairOddsChips(pred.fair_odds.home_win, pred.fair_odds.away_win, pred.fair_odds.draw)}
                    </td>
                    <td className="col-right">
                      {confidenceBar(pred.confidence)}
                    </td>
                    <td className="col-right hidden md:table-cell">
                      <Link
                        href={detailHref}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: "var(--accent)", display: "inline-flex" }}
                        target="_blank"
                      >
                        <ExternalLink size={13} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
