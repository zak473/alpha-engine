"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BellRing,
  ChevronRight,
  Clock3,
  Flame,
  Sparkles,
  Target,
  Trophy,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useBetting } from "@/components/betting/BettingContext";
import { SPORT_CONFIG, type QueueSelection, type SportSlug } from "@/lib/betting-types";
import {
  getChallenges,
  getLiveMatches,
  getPerformance,
  getPicksStats,
  getPredictions,
  getTipsters,
  type LiveMatchOut,
  type PicksStatsOut,
  type TipsterProfile,
} from "@/lib/api";
import type { Challenge, MvpPerformance, MvpPrediction } from "@/lib/types";

type OutcomeKey = "home_win" | "draw" | "away_win";

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

function formatPct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ND";
}

function avatarColor(name: string) {
  const palette = ["#00FF84", "#7dd3fc", "#f59e0b", "#a78bfa", "#22c55e", "#f97316"];
  const seed = Array.from(name).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return palette[seed % palette.length];
}

function getBestPick(pred: MvpPrediction): { label: string; key: OutcomeKey; prob: number } {
  const { home_win, draw, away_win } = pred.probabilities;
  const options: Array<{ label: string; key: OutcomeKey; prob: number }> = [
    { label: pred.participants.home.name, key: "home_win", prob: home_win },
    { label: pred.participants.away.name, key: "away_win", prob: away_win },
  ];
  if (pred.sport === "soccer") options.push({ label: "Draw", key: "draw", prob: draw });
  return options.reduce((best, current) => (current.prob > best.prob ? current : best));
}

function getEdge(pred: MvpPrediction, key: OutcomeKey): number | null {
  const market = pred.market_odds?.[key];
  if (!market || market <= 1) return null;
  return pred.probabilities[key] - 1 / market;
}

function getPickType(pred: MvpPrediction): { label: string; color: string } {
  const best = getBestPick(pred);
  const edge = getEdge(pred, best.key);
  const marketOdds = pred.market_odds?.[best.key] ?? pred.fair_odds[best.key] ?? 2;
  const hoursUntil = (new Date(pred.start_time).getTime() - Date.now()) / 3600000;

  if (pred.status === "live" || hoursUntil < 2) return { label: "Live target", color: "#00FF84" };
  if (edge !== null && edge > 0.06 && marketOdds > 1.85) return { label: "Value pick", color: "#7dd3fc" };
  if (pred.confidence >= 0.68 && marketOdds < 2) return { label: "Safe play", color: "#f6c453" };
  return { label: "Form pick", color: "#00FF84" };
}

function buildQueueItem(pred: MvpPrediction, best: ReturnType<typeof getBestPick>): QueueSelection {
  const edge = getEdge(pred, best.key);
  return {
    id: `pred:${pred.event_id}:${best.key}`,
    matchId: pred.event_id,
    matchLabel: `${pred.participants.home.name} vs ${pred.participants.away.name}`,
    sport: pred.sport as SportSlug,
    league: pred.league,
    marketId: "1x2",
    marketName: "Match result",
    selectionId: best.key,
    selectionLabel: best.label,
    odds: pred.market_odds?.[best.key] ?? pred.fair_odds[best.key] ?? 2,
    edge: edge !== null ? edge * 100 : undefined,
    startTime: pred.start_time,
    addedAt: new Date().toISOString(),
  };
}

function modelAccuracyForSport(performance: MvpPerformance | null, sport: string) {
  const liveModel = performance?.models.find((model) => model.sport === sport && model.is_live && model.accuracy !== null);
  if (!liveModel?.accuracy) return null;
  return {
    accuracy: Math.round(liveModel.accuracy * 100),
    sample: liveModel.n_predictions,
  };
}

function LiveTicker({ matches }: { matches: LiveMatchOut[] }) {
  if (!matches.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 lg:px-5">
      <div className="mr-1 flex items-center gap-2 whitespace-nowrap rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Live now
      </div>
      {matches.map((match) => {
        const cfg = SPORT_CONFIG[(match.sport as SportSlug) ?? "soccer"] ?? SPORT_CONFIG.soccer;
        return (
          <div
            key={match.id}
            className="flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-white/80"
            style={{ borderColor: `${cfg.color}35`, background: "rgba(255,255,255,0.03)" }}
          >
            <span>{cfg.icon}</span>
            <span className="font-semibold text-white">{match.home_name}</span>
            <span className="text-white/40">vs</span>
            <span className="font-semibold text-white">{match.away_name}</span>
            {(match.home_score !== null && match.away_score !== null) ? (
              <span className="rounded-full bg-white/5 px-2 py-0.5 font-bold text-emerald-300">
                {match.home_score}-{match.away_score}
              </span>
            ) : null}
            {match.live_clock ? <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">{match.live_clock}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function HeroCard({ prediction, performance }: { prediction: MvpPrediction; performance: MvpPerformance | null }) {
  const { addToQueue, isInQueue } = useBetting();
  const best = getBestPick(prediction);
  const edge = getEdge(prediction, best.key);
  const cfg = SPORT_CONFIG[(prediction.sport as SportSlug) ?? "soccer"] ?? SPORT_CONFIG.soccer;
  const queueId = `pred:${prediction.event_id}:${best.key}`;
  const inQueue = isInQueue(queueId);
  const confidence = Math.round(prediction.confidence * 100);
  const modelInfo = modelAccuracyForSport(performance, prediction.sport);
  const split = [
    { label: prediction.participants.home.name.split(" ").slice(-1)[0], value: Math.round(prediction.probabilities.home_win * 100) },
    ...(prediction.sport === "soccer" ? [{ label: "Draw", value: Math.round(prediction.probabilities.draw * 100) }] : []),
    { label: prediction.participants.away.name.split(" ").slice(-1)[0], value: Math.round(prediction.probabilities.away_win * 100) },
  ];

  return (
    <section className="sportsbook-card overflow-hidden">
      <div className="border-b border-white/8 px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
              <span className="rounded-full border px-2 py-1" style={{ borderColor: `${cfg.color}35`, color: cfg.color }}>
                {cfg.icon} {cfg.label}
              </span>
              <span>{prediction.league}</span>
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-[-0.03em] text-white lg:text-[32px]">
                {prediction.participants.home.name}
                <span className="mx-2 text-white/35">vs</span>
                {prediction.participants.away.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/62">
                <span className="inline-flex items-center gap-1.5"><Clock3 size={13} />{formatKickoff(prediction.start_time)}</span>
                {modelInfo ? (
                  <span>
                    Model: <span className="font-semibold text-[#f6c453]">{modelInfo.accuracy}% accurate</span>
                    {modelInfo.sample ? ` on ${modelInfo.sample.toLocaleString()} ${prediction.sport} predictions` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-w-[110px] text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Signal strength</div>
            <div className="mt-1 text-4xl font-black tracking-[-0.05em] text-[#00FF84]">{confidence}%</div>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 lg:px-5 lg:py-5">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/40">Model recommends</div>
              <div className="mt-1 text-lg font-bold text-white">{best.label}</div>
            </div>
            <div className="text-sm font-semibold text-white/60">
              {prediction.market_odds?.[best.key] ? `Odds ${prediction.market_odds[best.key].toFixed(2)}` : "Fair line"}
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full"
              style={{ width: `${confidence}%`, background: "linear-gradient(90deg, #f6c453 0%, #97ea58 55%, #00FF84 100%)" }}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-white/58">
            {split.map((item) => (
              <span key={item.label}><span className="font-bold text-white">{item.value}%</span> {item.label}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => addToQueue(buildQueueItem(prediction, best))}
            className="inline-flex items-center gap-2 rounded-xl bg-[#00FF84] px-4 py-2.5 text-sm font-bold text-[#07110d] transition-transform hover:-translate-y-0.5"
          >
            <Zap size={14} />
            {inQueue ? "Tailed" : "Tail This Pick"}
          </button>
          <Link
            href={`/sports/${prediction.sport}/matches/${prediction.event_id}`}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white/78 transition-colors hover:text-white"
          >
            Why this pick <ChevronRight size={14} />
          </Link>
          {edge !== null ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
              <TrendingUp size={14} />
              {formatPct(edge * 100)} edge
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function IntelCard({ prediction }: { prediction: MvpPrediction }) {
  const { addToQueue, isInQueue } = useBetting();
  const best = getBestPick(prediction);
  const pickType = getPickType(prediction);
  const confidence = Math.round(prediction.confidence * 100);
  const queueId = `pred:${prediction.event_id}:${best.key}`;
  const inQueue = isInQueue(queueId);
  const cfg = SPORT_CONFIG[(prediction.sport as SportSlug) ?? "soccer"] ?? SPORT_CONFIG.soccer;

  return (
    <article className="sportsbook-card p-4 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <span style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>
        </div>
        <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ background: `${pickType.color}18`, color: pickType.color }}>
          {pickType.label}
        </span>
      </div>

      <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-5 text-white">
        {prediction.participants.home.name} vs {prediction.participants.away.name}
      </h3>
      <div className="mt-1 text-xs text-white/48">{formatKickoff(prediction.start_time)}</div>

      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-white/62">
        <span>
          Pick: <span className="font-semibold text-white">{best.label}</span>
        </span>
        <span className="font-bold" style={{ color: confidence >= 70 ? "#00FF84" : confidence >= 60 ? "#f6c453" : "rgba(255,255,255,0.56)" }}>
          {confidence}%
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full"
          style={{ width: `${confidence}%`, background: confidence >= 70 ? "linear-gradient(90deg,#7ef7b4,#00FF84)" : "linear-gradient(90deg,#f6c453,#9fd84e)" }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white/84">
          {(prediction.market_odds?.[best.key] ?? prediction.fair_odds[best.key] ?? 0).toFixed(2)}
        </span>
        <button
          onClick={() => addToQueue(buildQueueItem(prediction, best))}
          className="rounded-lg bg-[#00FF84] px-3 py-1.5 text-xs font-bold text-[#07110d]"
        >
          {inQueue ? "Tailed" : "Tail"}
        </button>
      </div>
    </article>
  );
}

function MetricTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/38">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-[-0.04em]" style={{ color: accent ?? "#ffffff" }}>{value}</div>
    </div>
  );
}

function YourEdgeCard({ stats }: { stats: PicksStatsOut | null }) {
  return (
    <section className="sportsbook-card p-4 lg:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Target size={15} className="text-[#00FF84]" />
          Your Edge
        </div>
        <Link href="/record" className="text-xs text-white/50 transition-colors hover:text-white">
          Full record <ChevronRight size={12} className="inline" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="Win rate" value={stats ? `${Math.round(stats.win_rate * 100)}%` : "—"} accent="#00FF84" />
        <MetricTile label="ROI" value={stats ? formatPct(stats.roi * 100) : "—"} accent={(stats?.roi ?? 0) >= 0 ? "#00FF84" : "#ff6b6b"} />
        <MetricTile label="Settled" value={stats ? `${stats.settled}` : "—"} />
        <MetricTile label="Pending" value={stats ? `${stats.pending}` : "—"} />
      </div>
    </section>
  );
}

function ChallengeCard({ challenge }: { challenge: Challenge | null }) {
  const daysLeft = challenge ? Math.max(0, Math.ceil((new Date(challenge.end_at).getTime() - Date.now()) / 86400000)) : null;

  return (
    <section className="sportsbook-card p-4 lg:p-5" style={{ background: "linear-gradient(180deg, rgba(255,194,87,0.08), rgba(255,255,255,0.02)), rgba(8,13,21,0.88)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Trophy size={15} className="text-[#f6c453]" />
            Live Challenge
          </div>
          <div className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">{challenge?.max_members ?? 10}k</div>
          <div className="mt-1 text-xs text-white/55">
            {challenge ? `${challenge.sport_scope.join(" · ")} · ${challenge.member_count} competitor${challenge.member_count === 1 ? "" : "s"}` : "All sports · 1 competitor"}
          </div>
        </div>
        {daysLeft !== null ? (
          <span className="rounded-full border border-amber-300/15 bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
            {daysLeft}d left
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Link href="/challenges" className="inline-flex items-center justify-center rounded-xl border border-amber-200/20 bg-transparent px-4 py-3 text-sm font-semibold text-amber-100/90">
          View Standing
        </Link>
        <Link href="/predictions" className="inline-flex items-center justify-center rounded-xl bg-[#ffc25b] px-4 py-3 text-sm font-bold text-[#271807]">
          <Flame size={14} className="mr-2" />Make Pick
        </Link>
      </div>
    </section>
  );
}

function CommunityRow({ tipsters }: { tipsters: TipsterProfile[] }) {
  if (!tipsters.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users size={15} className="text-[#00FF84]" />
          Community <span className="text-white/40">— top tipsters by ROI</span>
        </div>
        <Link href="/tipsters" className="text-xs text-white/50 transition-colors hover:text-white">
          All tipsters <ChevronRight size={12} className="inline" />
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {tipsters.map((tipster) => {
          const color = avatarColor(tipster.display_name || tipster.username);
          return (
            <article key={tipster.id} className="sportsbook-card flex items-center gap-3 p-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-black"
                style={{ background: `${color}20`, color }}
              >
                {initials(tipster.display_name || tipster.username)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">@{tipster.username}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                  <span style={{ color: tipster.roi >= 0 ? "#00FF84" : "#ff6b6b" }}>{formatPct(tipster.roi * 100)}</span>
                  <span>{Math.round(tipster.overall_win_rate * 100)}% win</span>
                  <span>{tipster.total_picks} picks</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FooterStrip({ performance, queueCount }: { performance: MvpPerformance | null; queueCount: number }) {
  const liveModels = performance?.models.filter((model) => model.is_live) ?? [];
  const bestLiveModel = [...liveModels].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0];

  return (
    <section className="sportsbook-card flex flex-col gap-3 px-4 py-4 text-sm text-white/62 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
          <Activity size={12} /> Models live
        </span>
        {bestLiveModel ? (
          <span>
            Best live model <span className="font-semibold text-white">{bestLiveModel.sport}</span> at <span className="font-semibold text-[#00FF84]">{Math.round((bestLiveModel.accuracy ?? 0) * 100)}%</span> accuracy
          </span>
        ) : (
          <span>Real-time model monitoring active</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs lg:text-sm">
        <span className="rounded-full border border-white/8 px-3 py-1">{liveModels.length} live model{liveModels.length === 1 ? "" : "s"}</span>
        <span className="rounded-full border border-white/8 px-3 py-1">{queueCount} in queue</span>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 pb-8">
      <div className="sportsbook-card h-16 animate-pulse bg-white/[0.03]" />
      <div className="sportsbook-card h-[280px] animate-pulse bg-white/[0.03]" />
      <div className="grid gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="sportsbook-card h-[190px] animate-pulse bg-white/[0.03]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="sportsbook-card h-[230px] animate-pulse bg-white/[0.03]" />
        <div className="sportsbook-card h-[230px] animate-pulse bg-white/[0.03]" />
      </div>
    </div>
  );
}

export function DashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { queue } = useBetting();

  const [showSuccess, setShowSuccess] = useState(false);
  const [predictions, setPredictions] = useState<MvpPrediction[]>([]);
  const [pickStats, setPickStats] = useState<PicksStatsOut | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [tipsters, setTipsters] = useState<TipsterProfile[]>([]);
  const [performance, setPerformance] = useState<MvpPerformance | null>(null);
  const [liveMatches, setLiveMatches] = useState<LiveMatchOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      setShowSuccess(true);
      router.replace("/dashboard", { scroll: false });
      const timer = setTimeout(() => setShowSuccess(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split("T")[0];
      const inTwoDays = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
      setLoading(true);

      const [predsR, statsR, challengeR, tipstersR, perfR, liveR] = await Promise.allSettled([
        getPredictions({ date_from: today, date_to: inTwoDays, limit: 12 }),
        getPicksStats().catch(() => null),
        getChallenges({ mine: true }).catch(() => []),
        getTipsters().catch(() => []),
        getPerformance().catch(() => null),
        getLiveMatches().catch(() => []),
      ]);

      setPredictions(predsR.status === "fulfilled" ? predsR.value.items : []);
      setPickStats(statsR.status === "fulfilled" ? statsR.value : null);
      setChallenges(challengeR.status === "fulfilled" ? (challengeR.value as Challenge[]) : []);
      setTipsters(tipstersR.status === "fulfilled" ? tipstersR.value : []);
      setPerformance(perfR.status === "fulfilled" ? perfR.value : null);
      setLiveMatches(liveR.status === "fulfilled" ? liveR.value : []);
      setLoading(false);
    };

    load();
  }, []);

  const sortedPredictions = useMemo(() => {
    return [...predictions].sort((a, b) => {
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      return b.confidence - a.confidence;
    });
  }, [predictions]);

  const featuredPrediction = sortedPredictions[0] ?? null;
  const intelCards = sortedPredictions.slice(1, 5);
  const featuredChallenge = challenges[0] ?? null;
  const topTipsters = useMemo(() => [...tipsters].sort((a, b) => b.roi - a.roi).slice(0, 3), [tipsters]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-4 pb-10">
      {showSuccess ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <BellRing size={16} />
          <div>
            <div className="font-semibold">You&apos;re now a Pro member</div>
            <div className="text-xs text-emerald-200/70">Your subscription is active and the premium dashboard is unlocked.</div>
          </div>
        </div>
      ) : null}

      <section className="sportsbook-card overflow-hidden">
        <div className="grid gap-5 border-b border-white/8 px-4 py-5 lg:px-5 xl:grid-cols-[minmax(0,1.15fr)_320px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
              <Sparkles size={12} /> Never In Doubt workspace
            </div>
            <h1 className="mt-4 text-[34px] font-black tracking-[-0.05em] text-white sm:text-[42px]">
              Find today&apos;s strongest picks faster.
            </h1>
            <p className="mt-3 max-w-[60ch] text-[14px] leading-6 text-white/56">
              Start with the sharpest model read, jump straight into the wider board, and keep your record moving without hunting through separate screens.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/predictions" className="inline-flex items-center gap-2 rounded-xl bg-[#00FF84] px-4 py-2.5 text-sm font-bold text-[#07110d] transition-transform hover:-translate-y-0.5">
                Open predictions <ArrowRight size={14} />
              </Link>
              <Link href="/performance" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white/78 transition-colors hover:text-white">
                View performance <ChevronRight size={14} />
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-white/65">
                <Sparkles size={12} /> Search picks, matches, tipsters
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-2 text-emerald-300">
                <Activity size={12} /> {liveMatches.filter((match) => match.is_live).length} live now
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-2 text-emerald-300">
                <Zap size={12} /> {sortedPredictions.length} reads in the next 48h
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <MetricTile label="Top board" value={featuredPrediction ? `${Math.round(featuredPrediction.confidence * 100)}%` : "Quiet"} accent="#00FF84" />
            <MetricTile label="Live matches" value={`${liveMatches.filter((match) => match.is_live).length}`} />
            <MetricTile label="Community boards" value={`${topTipsters.length}`} accent="#f6c453" />
          </div>
        </div>

        <LiveTicker matches={liveMatches.filter((match) => match.is_live).slice(0, 8)} />
      </section>

      {featuredPrediction ? <HeroCard prediction={featuredPrediction} performance={performance} /> : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-white/42">Today&apos;s intel</div>
          <Link href="/predictions" className="text-xs text-white/50 transition-colors hover:text-white">
            View all <ArrowRight size={12} className="inline" />
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {intelCards.map((prediction) => (
            <IntelCard key={prediction.event_id} prediction={prediction} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <YourEdgeCard stats={pickStats} />
        <ChallengeCard challenge={featuredChallenge} />
      </div>

      <CommunityRow tipsters={topTipsters} />
      <FooterStrip performance={performance} queueCount={queue.length} />
    </div>
  );
}
