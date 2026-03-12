"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";
import Link from "next/link";
import { ExternalLink, BrainCircuit, TrendingUp, Calendar, Zap, ArrowRight, ChevronRight } from "lucide-react";
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
  const color = conf >= 0.7 ? "#2edb6c" : conf >= 0.5 ? "#f59e0b" : "#ef4444";
  const bg = conf >= 0.7 ? "bg-[#2edb6c]" : conf >= 0.5 ? "bg-[#f59e0b]" : "bg-[#ef4444]";
  const textCol = conf >= 0.7 ? "text-[#2d7f4f]" : conf >= 0.5 ? "text-[#b45309]" : "text-[#dc2626]";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-[#e8efe6] overflow-hidden">
        <div className={cn("h-full rounded-full", bg)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("font-mono text-xs font-bold tabular-nums w-8 text-right", textCol)}>{pct}%</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "live") return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0]/60 bg-[#dcfce7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#15803d]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />
      Live
    </span>
  );
  if (status === "scheduled") return (
    <span className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#dbeafe] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1d4ed8]">
      Upcoming
    </span>
  );
  return (
    <span className="inline-flex items-center rounded-full border border-[#d9e2d7] bg-[#f7f8f5] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#667066]">
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

  const stats = [
    { label: "Total predictions", value: String(items.length), icon: BrainCircuit, accent: "text-[#2d7f4f]", bg: "bg-[#f0faf4]", border: "border-[#c6e8d3]" },
    { label: "Today's picks", value: String(todayItems.length), icon: Calendar, accent: "text-[#1d4ed8]", bg: "bg-[#eff6ff]", border: "border-[#bfdbfe]" },
    { label: "Avg confidence", value: items.length > 0 ? `${Math.round(avgConf * 100)}%` : "—", icon: TrendingUp, accent: avgConf >= 0.7 ? "text-[#2d7f4f]" : avgConf >= 0.5 ? "text-[#b45309]" : "text-[#667066]", bg: "bg-[#f7f8f5]", border: "border-[#d9e2d7]" },
    { label: "High confidence", value: String(highConf), icon: Zap, accent: "text-[#7c3aed]", bg: "bg-[#f5f3ff]", border: "border-[#ddd6fe]" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, accent, bg, border }) => (
        <div key={label} className={cn("rounded-[24px] border p-5", bg, border)}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667066]">{label}</span>
            <div className={cn("rounded-xl p-1.5", bg, border, "border")}>
              <Icon size={13} className={accent} />
            </div>
          </div>
          <p className={cn("mt-3 font-mono text-[32px] font-bold leading-none tabular-nums", accent)}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────

const SPORTS = [
  { value: "all", label: "All sports" },
  { value: "soccer", label: "⚽ Soccer" },
  { value: "tennis", label: "🎾 Tennis" },
  { value: "esports", label: "🎮 Esports" },
  { value: "basketball", label: "🏀 Basketball" },
  { value: "baseball", label: "⚾ Baseball" },
];

const STATUSES = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Upcoming" },
  { value: "live", label: "Live" },
];

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const CONF_THRESHOLDS = [
  { value: "0", label: "All" },
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7b857b] shrink-0">{label}</span>
      <div className="flex items-center gap-1 rounded-full border border-[#d9e2d7] bg-[#f7f8f5] p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
              active === o.value
                ? "bg-[#111315] text-white shadow-sm"
                : "text-[#667066] hover:text-[#111315]"
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
  const conf = Math.round(pred.confidence * 100);
  const confColor = pred.confidence >= 0.7 ? "text-[#2d7f4f]" : pred.confidence >= 0.5 ? "text-[#b45309]" : "text-[#dc2626]";
  const confBg = pred.confidence >= 0.7 ? "bg-[#dcfce7] border-[#bbf7d0]" : pred.confidence >= 0.5 ? "bg-[#fef3c7] border-[#fde68a]" : "bg-[#fee2e2] border-[#fecaca]";

  return (
    <Link
      href={detailHref}
      className="group block overflow-hidden rounded-[28px] border border-[#d9e2d7] bg-white shadow-[0_4px_20px_rgba(17,19,21,0.05)] transition hover:border-[#b8d4c0] hover:shadow-[0_8px_30px_rgba(17,19,21,0.1)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[#edf2ea] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{emoji}</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667066] capitalize">{pred.sport}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={pred.status} />
          <span className="text-[11px] text-[#7b857b]">{fmtKickoff(pred.start_time)}</span>
        </div>
      </div>

      {/* Teams + probs */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Home */}
          <div>
            <p className="font-semibold text-[#111315] leading-tight">{pred.participants.home.name}</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#2d7f4f] tabular-nums">{hPct}%</p>
            {fo?.home_win && <p className="mt-0.5 font-mono text-xs text-[#7b857b]">{fo.home_win.toFixed(2)} odds</p>}
          </div>

          {/* Center */}
          <div className="flex flex-col items-center gap-1">
            {dPct != null && (
              <div className="rounded-xl border border-[#d9e2d7] bg-[#f7f8f5] px-3 py-1.5 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7b857b]">Draw</p>
                <p className="font-mono text-sm font-bold text-[#111315] tabular-nums">{dPct}%</p>
              </div>
            )}
            <span className="text-[11px] font-medium text-[#7b857b]">vs</span>
          </div>

          {/* Away */}
          <div className="text-right">
            <p className="font-semibold text-[#111315] leading-tight">{pred.participants.away.name}</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#b45309] tabular-nums">{aPct}%</p>
            {fo?.away_win && <p className="mt-0.5 font-mono text-xs text-[#7b857b]">{fo.away_win.toFixed(2)} odds</p>}
          </div>
        </div>

        {/* Prob bar */}
        <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-[#e8efe6]">
          <div className="h-full bg-[#2edb6c] transition-all" style={{ width: `${hPct}%` }} />
          {dPct != null && <div className="h-full bg-[#d9e2d7]" style={{ width: `${dPct}%` }} />}
          <div className="h-full flex-1 bg-[#f59e0b]" />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-[#edf2ea] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b857b]">Confidence</span>
          <ConfBar conf={pred.confidence} />
          <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums", confBg, confColor)}>
            {conf}%
          </span>
        </div>
        <div className="flex items-center gap-1 text-[12px] font-semibold text-[#2d7f4f] opacity-0 transition group-hover:opacity-100">
          View match <ChevronRight size={13} />
        </div>
      </div>
    </Link>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-[24px] border border-[#d9e2d7] bg-[#f7f8f5]">
        <BrainCircuit size={28} className="text-[#2d7f4f]" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-[#111315]">No predictions found</p>
        <p className="mt-1 text-sm text-[#667066] max-w-xs">Try a different sport, status, or date range.</p>
      </div>
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
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5 px-4 py-5 md:px-6">

      {/* Hero */}
      <div className="overflow-hidden rounded-[32px] border border-[#1f2a22] bg-[#111315] px-6 py-7 text-white shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(46,219,108,0.15),transparent_40%)]" />
        <div className="relative z-10 flex flex-col gap-1">
          <div className="inline-flex w-fit items-center rounded-full border border-[rgba(46,219,108,0.25)] bg-[rgba(46,219,108,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2edb6c]">
            Model predictions
          </div>
          <h1 className="mt-3 text-3xl font-bold text-white lg:text-4xl">AI-Powered Match Predictions</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
            Win probabilities, fair odds, and confidence scores generated by our machine learning models across every sport.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <KpiStrip items={items} />

      {/* Filters */}
      <div className="overflow-hidden rounded-[28px] border border-[#d9e2d7] bg-white p-5 shadow-[0_4px_20px_rgba(17,19,21,0.05)]">
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#667066]">
            Showing <span className="font-semibold text-[#111315]">{items.length}</span> prediction{items.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Cards grid */}
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
  );
}
