"use client";

import Link from "next/link";
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormStreak } from "@/components/charts/FormStreak";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EloPanel {
  rating: number;
  rating_change?: number | null;
}

interface FormPanel {
  last_5?: Array<{ result: "W" | "D" | "L" }> | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  form_pts?: number | null;
  days_rest?: number | null;
  back_to_back?: boolean | null;
  injury_count?: number | null;
}

export interface SportMatchHeaderProps {
  sport: string;
  league: string;
  season?: string | null;
  status: string;
  kickoffUtc: string;
  liveClock?: string | null;
  home: { name: string; logo_url?: string | null };
  away: { name: string; logo_url?: string | null };
  homeScore?: number | null;
  awayScore?: number | null;
  outcome?: string | null;
  probabilities?: { home_win: number; draw?: number | null; away_win: number } | null;
  eloHome?: EloPanel | null;
  eloAway?: EloPanel | null;
  formHome?: FormPanel | null;
  formAway?: FormPanel | null;
  venue?: string | null;
  /** Extra content rendered below the score (period scores, set scores, etc.) */
  centerExtras?: React.ReactNode;
  /** Extra content rendered below team name on home side */
  homeExtras?: React.ReactNode;
  /** Extra content rendered below team name on away side */
  awayExtras?: React.ReactNode;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function Delta({ v }: { v: number | null | undefined }) {
  if (v == null) return null;
  return (
    <span className={cn("font-mono text-[11px]", v >= 0 ? "text-emerald-400" : "text-red-400")}>
      {v >= 0 ? "+" : ""}{v.toFixed(1)}
    </span>
  );
}

function formResults(form: FormPanel): Array<"W" | "D" | "L"> {
  if (form.last_5?.length) return form.last_5.map(g => g.result);
  return [
    ...Array(form.wins ?? 0).fill("W" as const),
    ...Array(form.draws ?? 0).fill("D" as const),
    ...Array(form.losses ?? 0).fill("L" as const),
  ].slice(0, 5) as Array<"W" | "D" | "L">;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    live:      "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
    scheduled: "bg-blue-500/20 border-blue-500/30 text-blue-400",
    finished:  "bg-white/5 border-white/10 text-white/50",
    cancelled: "bg-red-500/20 border-red-500/30 text-red-400",
  };
  const cls = cfg[status.toLowerCase()] ?? cfg.scheduled;
  const isLive = status.toLowerCase() === "live";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", cls)}>
      {isLive && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {status.toUpperCase()}
    </span>
  );
}

// ─── Team block ───────────────────────────────────────────────────────────────

function TeamBlock({
  name, logo_url, elo, form, side, extras,
}: {
  name: string;
  logo_url?: string | null;
  elo?: EloPanel | null;
  form?: FormPanel | null;
  side: "home" | "away";
  extras?: React.ReactNode;
}) {
  const isHome = side === "home";
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", !isHome && "items-end text-right")}>
      <div className={cn("flex items-center gap-4", !isHome && "flex-row-reverse")}>
        {logo_url ? (
          <img src={logo_url} alt={name} className="h-14 w-14 rounded-[16px] border border-white/10 bg-white/[0.06] p-1.5 object-contain shadow-lg flex-shrink-0" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-[16px] border border-white/10 bg-white/10 text-sm font-bold text-white flex-shrink-0">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[22px] font-bold leading-tight text-white md:text-[28px]">{name}</p>
          {elo && (
            <div className={cn("mt-1.5 flex items-center gap-2", !isHome && "justify-end")}>
              <span className="font-mono text-[20px] font-bold tabular-nums text-emerald-400 md:text-[24px]">
                {Math.round(elo.rating)}
              </span>
              <Delta v={elo.rating_change} />
            </div>
          )}
        </div>
      </div>

      {form && (
        <div className={cn("flex flex-wrap items-center gap-2", !isHome && "justify-end")}>
          <FormStreak results={formResults(form)} size="sm" />
          {form.form_pts != null && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-mono text-white/60">
              {form.form_pts.toFixed(0)} pts / 5
            </span>
          )}
          {form.days_rest != null && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-mono text-white/60">
              {Math.round(form.days_rest)}d rest
            </span>
          )}
          {form.back_to_back && (
            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400">
              B2B
            </span>
          )}
        </div>
      )}

      {extras && <div className={cn(!isHome && "flex justify-end")}>{extras}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SportMatchHeader({
  sport, league, season, status, kickoffUtc, liveClock,
  home, away, homeScore, awayScore, outcome,
  probabilities, eloHome, eloAway, formHome, formAway,
  venue, centerExtras, homeExtras, awayExtras,
}: SportMatchHeaderProps) {
  const isLive = status.toLowerCase() === "live";
  const isFinished = status.toLowerCase() === "finished";

  const homeProb = probabilities ? Math.round(probabilities.home_win * 100) : null;
  const drawProb = probabilities?.draw != null ? Math.round(probabilities.draw * 100) : null;
  const awayProb = probabilities ? Math.round(probabilities.away_win * 100) : null;

  const backLabel = sport.charAt(0).toUpperCase() + sport.slice(1);

  return (
    <div className="overflow-hidden rounded-[34px] border border-white/8 bg-white/[0.04] text-white shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
      {/* Top bar */}
      <div className="border-b border-white/8 px-5 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href={`/sports/${sport}/matches`}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft size={13} />
            Back to {backLabel}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
              {league}{season ? ` · ${season}` : ""}
            </span>
            <StatusBadge status={status} />
          </div>
        </div>
      </div>

      {/* 3-column grid */}
      <div className="grid gap-5 px-5 py-6 md:grid-cols-[1fr_320px_1fr] md:items-center md:px-6 md:py-7">
        <TeamBlock name={home.name} logo_url={home.logo_url} elo={eloHome} form={formHome} side="home" extras={homeExtras} />

        {/* Center block */}
        <div className="flex flex-col items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          {isLive && (
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live{liveClock ? ` · ${liveClock}` : ""}
            </span>
          )}

          <div className="flex items-center gap-3">
            <span className="font-mono text-5xl font-bold tabular-nums text-white md:text-6xl">
              {homeScore ?? (isLive ? "0" : "—")}
            </span>
            <span className="font-mono text-2xl text-white/25">:</span>
            <span className="font-mono text-5xl font-bold tabular-nums text-white md:text-6xl">
              {awayScore ?? (isLive ? "0" : "—")}
            </span>
          </div>

          {isFinished && outcome && (
            <span className="mt-3 inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
              {outcome === "home_win" || outcome === "H"
                ? `${home.name.split(" ")[0]} Win`
                : outcome === "away_win" || outcome === "A"
                ? `${away.name.split(" ")[0]} Win`
                : "Draw"}
            </span>
          )}

          {centerExtras && <div className="mt-3 w-full">{centerExtras}</div>}

          {probabilities && (
            <div className="mt-4 w-full max-w-[220px]">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Win probability</div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-emerald-500" style={{ width: `${homeProb ?? 0}%` }} />
                {drawProb != null && drawProb > 0 && (
                  <div className="h-full bg-white/25" style={{ width: `${drawProb}%` }} />
                )}
                <div className="h-full bg-amber-400 flex-1" />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[11px] font-semibold tabular-nums">
                <span className="text-emerald-400">{homeProb ?? "—"}%</span>
                {drawProb != null && <span className="text-white/45">{drawProb}%</span>}
                <span className="text-amber-400">{awayProb ?? "—"}%</span>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col items-center gap-1">
            <span className="flex items-center gap-1 text-[11px] text-white/50">
              <Calendar size={11} />
              {fmtDate(kickoffUtc)}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-white/50">
              <Clock size={11} />
              {fmtTime(kickoffUtc)}
            </span>
            {venue && (
              <span className="flex items-center gap-1 text-[11px] text-white/50">
                <MapPin size={11} />
                {venue}
              </span>
            )}
          </div>
        </div>

        <TeamBlock name={away.name} logo_url={away.logo_url} elo={eloAway} form={formAway} side="away" extras={awayExtras} />
      </div>
    </div>
  );
}
