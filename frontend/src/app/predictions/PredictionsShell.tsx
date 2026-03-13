"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";
import Link from "next/link";
import { BrainCircuit, TrendingUp, Calendar, Zap, ChevronRight } from "lucide-react";
import type { MvpPrediction, MvpPredictionList } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────

const SPORT_SLUGS: Record<string, string> = {
  soccer: "soccer", tennis: "tennis", esports: "esports",
  basketball: "basketball", baseball: "baseball",
};

const SPORT_EMOJI: Record<string, string> = {
  soccer: "⚽", tennis: "🎾", esports: "🎮", basketball: "🏀", baseball: "⚾",
};

function fmtKickoff(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) +
    " UTC"
  );
}

function ConfBar({ conf }: { conf: number }) {
  const pct = Math.round(conf * 100);
  const bg = conf >= 0.7 ? "bg-emerald-400" : conf >= 0.5 ? "bg-amber-400" : "bg-red-400";
  const textCol = conf >= 0.7 ? "text-emerald-300" : conf >= 0.5 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={cn("h-full rounded-full", bg)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("font-mono text-xs font-bold tabular-nums w-8 text-right", textCol)}>{pct}%</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "live") return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Live
    </span>
  );
  if (status === "scheduled") return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
      Upcoming
    </span>
  );
  return (
    <span className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
      Finished
    </span>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────

function KpiStrip({ items }: { items: MvpPrediction[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayItems = items.filter((p) => p.start_time.slice(0, 10) === today);
  const avgConf = items.length > 0
    ? items.reduce((s, p) => s + p.confidence, 0) / items.length : 0;
  const highConf = items.filter((p) => p.confidence >= 0.7).length;

  const avgAccent = avgConf >= 0.7 ? "text-emerald-300" : avgConf >= 0.5 ? "text-amber-400" : "text-white/50";

  const stats = [
    { label: "Total predictions", value: String(items.length),          icon: BrainCircuit, accent: "text-emerald-300" },
    { label: "Today's picks",     value: String(todayItems.length),      icon: Calendar,     accent: "text-blue-300"   },
    { label: "Avg confidence",    value: items.length > 0 ? `${Math.round(avgConf * 100)}%` : "—", icon: TrendingUp, accent: avgAccent },
    { label: "High confidence",   value: String(highConf),               icon: Zap,          accent: "text-purple-300" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, accent }) => (
        <div key={label} className="rounded-[22px] border border-white/8 bg-white/[0.05] px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{label}</span>
            <Icon size={13} className={cn(accent, "opacity-70")} />
          </div>
          <p className={cn("mt-3 font-mono text-[32px] font-semibold leading-none tabular-nums tracking-[-0.05em] text-white")}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────

const SPORTS = [
  { value: "all",        label: "All sports"    },
  { value: "soccer",     label: "⚽ Soccer"     },
  { value: "tennis",     label: "🎾 Tennis"     },
  { value: "esports",    label: "🎮 Esports"    },
  { value: "basketball", label: "🏀 Basketball" },
  { value: "baseball",   label: "⚾ Baseball"   },
];

const STATUSES = [
  { value: "all",       label: "All"      },
  { value: "scheduled", label: "Upcoming" },
  { value: "live",      label: "Live"     },
];

const RANGES = [
  { value: "today", label: "Today"   },
  { value: "7d",    label: "7 days"  },
  { value: "30d",   label: "30 days" },
];

const CONF_THRESHOLDS = [
  { value: "0",   label: "All"  },
  { value: "0.5", label: "50%+" },
  { value: "0.6", label: "60%+" },
  { value: "0.7", label: "70%+" },
  { value: "0.8", label: "80%+" },
];

function PillGroup<T extends string>({
  label, options, active, onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38 shrink-0">{label}</span>
      <div className="flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
              active === o.value
                ? "bg-[#2edb6c] text-[#07110d] shadow-sm"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Prediction Card ───────────────────────────────────────────────────────

function PredictionCard({ pred }: { pred: MvpPrediction }) {
  const sportSlug = SPORT_SLUGS[pred.sport] ?? pred.sport;
  const detailHref = `/sports/${sportSlug}/matches/${pred.event_id}`;
  const emoji = SPORT_EMOJI[pred.sport] ?? "🏆";
  const p = pred.probabilities;
  const fo = pred.fair_odds;
  const hPct = Math.round(p.home_win * 100);
  const aPct = Math.round(p.away_win * 100);
  const dPct = p.draw != null ? Math.round(p.draw * 100) : null;
  const isLive = pred.status === "live";
  const confColor = pred.confidence >= 0.7 ? "text-emerald-300" : pred.confidence >= 0.5 ? "text-amber-400" : "text-red-400";
  const confBg   = pred.confidence >= 0.7 ? "bg-emerald-400/10 border-emerald-400/20" : pred.confidence >= 0.5 ? "bg-amber-400/10 border-amber-400/20" : "bg-red-400/10 border-red-400/20";

  return (
    <Link
      href={detailHref}
      className={cn(
        "group rounded-[28px] border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/25 hover:shadow-[0_24px_60px_rgba(0,0,0,0.26)]",
        isLive
          ? "bg-[linear-gradient(180deg,rgba(12,28,20,0.98),rgba(8,18,14,0.98))] border-emerald-400/20"
          : "bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] border-white/8"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
            <span>{emoji}</span>
            {pred.sport}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={pred.status} />
          <span className="text-[11px] text-white/35">{fmtKickoff(pred.start_time)}</span>
        </div>
      </div>

      {/* Teams + probs */}
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Home */}
        <div>
          <p className="text-sm font-semibold text-white leading-tight">{pred.participants.home.name}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-300 tabular-nums">{hPct}%</p>
          {fo?.home_win && <p className="mt-0.5 font-mono text-xs text-white/35">{fo.home_win.toFixed(2)} odds</p>}
        </div>

        {/* Center */}
        <div className="flex flex-col items-center gap-1">
          {dPct != null && (
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Draw</p>
              <p className="font-mono text-sm font-bold text-white tabular-nums">{dPct}%</p>
            </div>
          )}
          <span className="text-[11px] font-medium text-white/35">vs</span>
        </div>

        {/* Away */}
        <div className="text-right">
          <p className="text-sm font-semibold text-white leading-tight">{pred.participants.away.name}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-400 tabular-nums">{aPct}%</p>
          {fo?.away_win && <p className="mt-0.5 font-mono text-xs text-white/35">{fo.away_win.toFixed(2)} odds</p>}
        </div>
      </div>

      {/* Prob bar */}
      <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-emerald-400 transition-all" style={{ width: `${hPct}%` }} />
        {dPct != null && <div className="h-full bg-white/20" style={{ width: `${dPct}%` }} />}
        <div className="h-full flex-1 bg-amber-400" />
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Confidence</span>
          <ConfBar conf={pred.confidence} />
          <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums", confBg, confColor)}>
            {Math.round(pred.confidence * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1 text-[12px] font-semibold text-white/72 opacity-0 transition group-hover:opacity-100">
          View match <ChevronRight size={13} />
        </div>
      </div>
    </Link>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
      <BrainCircuit size={28} className="text-white/35" />
      <div className="mt-4 text-xl font-semibold text-white">No predictions found</div>
      <div className="mt-2 max-w-md text-sm text-white/50">Try a different sport, status, or date range.</div>
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

  const sport  = searchParams.get("sport")  ?? initialSport;
  const status = searchParams.get("status") ?? initialStatus;
  const range  = searchParams.get("range")  ?? initialRange;

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
    <div className="pb-12">

      {/* Hero */}
      <section className="overflow-hidden rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(54,242,143,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.24)] backdrop-blur xl:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-300/16 bg-emerald-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              Model predictions
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white lg:text-[2.7rem]">AI-Powered Match Predictions</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58">
              Win probabilities, fair odds, and confidence scores generated by our machine learning models across every sport.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-white/[0.05] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Total predictions</div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">{items.length}</div>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-white/[0.05] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">High confidence</div>
              <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-emerald-300">
                {items.filter((p) => p.confidence >= 0.7).length}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI strip */}
      <div className="mt-4">
        <KpiStrip items={items} />
      </div>

      {/* Filters */}
      <div className="mt-4 overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03] p-4">
        <div className="flex flex-wrap gap-4">
          <PillGroup
            label="Sport"
            options={SPORTS as { value: string; label: string }[]}
            active={sport}
            onChange={(v) => navigate({ sport: v })}
          />
          <PillGroup
            label="Status"
            options={STATUSES as { value: string; label: string }[]}
            active={status}
            onChange={(v) => navigate({ status: v })}
          />
          <PillGroup
            label="Range"
            options={RANGES as { value: string; label: string }[]}
            active={range}
            onChange={(v) => navigate({ range: v })}
          />
          <PillGroup
            label="Min confidence"
            options={CONF_THRESHOLDS as { value: string; label: string }[]}
            active={minConf}
            onChange={setMinConf}
          />
        </div>
      </div>

      {/* Results count */}
      {items.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-white/50">
            Showing <span className="font-semibold text-white">{items.length}</span> prediction{items.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Cards grid */}
      <div className="mt-4">
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((pred) => (
              <PredictionCard key={pred.event_id} pred={pred} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
