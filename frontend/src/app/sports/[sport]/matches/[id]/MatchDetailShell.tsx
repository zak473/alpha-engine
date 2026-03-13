"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin, Sparkles } from "lucide-react";
import type { SportMatchDetail } from "@/lib/types";
import type { SportSlug } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

function Avatar({ name, src }: { name: string; src?: string | null }) {
  if (src) return <img src={src} alt={name} className="h-16 w-16 rounded-full border border-white/10 bg-white/5 object-contain p-1" />;
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-semibold text-white/65">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/8 bg-[#18181b] p-5 lg:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-white/38">{title}</div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-black/15 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-[-0.05em] text-white", tone)}>{value}</div>
    </div>
  );
}

function ProbCard({ label, prob, tone }: { label: string; prob?: number | null; tone: string }) {
  const pct = prob != null ? Math.round(prob * 100) : null;
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/15 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className={cn("mt-2 text-3xl font-semibold tracking-[-0.05em]", tone)}>{pct != null ? `${pct}%` : "—"}</div>
      <div className="mt-3 h-2 rounded-full bg-white/[0.06]">
        <div className={cn("h-full rounded-full", tone.replace("text-", "bg-"))} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

function scoreState(status: string) {
  if (status === "live") return "Live";
  if (status === "finished") return "Final";
  return "Upcoming";
}

function valueForDisplay(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  return String(value).replace(/_/g, " ");
}

export function MatchDetailShell({ match }: { match: SportMatchDetail; sport?: SportSlug }) {
  const probability = match.probabilities;
  const hasDraw = typeof probability?.draw === "number" && probability.draw > 0;
  const context = match.context;
  const statRows = Array.from(
    new Set([
      ...Object.keys((match.stats_home ?? {}) as Record<string, unknown>),
      ...Object.keys((match.stats_away ?? {}) as Record<string, unknown>),
    ])
  ).slice(0, 12);

  const keyDrivers = (match.key_drivers ?? []).slice(0, 6);

  return (
    <div className="grid gap-6 pb-10">
      <section className="overflow-hidden rounded-[32px] border border-white/8 bg-[#18181b] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.24)] lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/sports/${match.sport}/matches`} className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-[#27272a] px-4 py-2 text-sm text-white/65 transition hover:text-white">
            <ArrowLeft size={14} />
            Back to matches
          </Link>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/8 bg-[#27272a] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/50">{match.league}</span>
            <span className="rounded-full border border-emerald-300/18 bg-emerald-300/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-emerald-200">{scoreState(match.status)}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_auto_1fr] xl:items-center">
          <div className="flex items-center gap-4">
            <Avatar name={match.home.name} src={match.home.logo_url} />
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Team A</div>
              <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white">{match.home.name}</div>
              <div className="mt-1 text-sm text-white/48">{match.elo_home?.rating != null ? `ELO ${Math.round(match.elo_home.rating)}` : "No rating yet"}</div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-black/20 px-6 py-5 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/18 bg-emerald-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200">
              <Sparkles size={12} />
              Match centre
            </div>
            <div className="mt-4 text-6xl font-semibold tracking-[-0.08em] text-white">
              <span className={match.status === "live" ? "text-emerald-300" : ""}>{match.home_score ?? 0}</span>
              <span className="px-3 text-white/18">:</span>
              <span className={match.status === "live" ? "text-emerald-300" : ""}>{match.away_score ?? 0}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-white/50">
              <span className="inline-flex items-center gap-2"><CalendarDays size={14} /> {formatDate(match.kickoff_utc, "long")}</span>
              {match.live_clock ? <span className="inline-flex items-center gap-2"><Clock3 size={14} /> {match.live_clock}</span> : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-4">
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Team B</div>
              <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white">{match.away.name}</div>
              <div className="mt-1 text-sm text-white/48">{match.elo_away?.rating != null ? `ELO ${Math.round(match.elo_away.rating)}` : "No rating yet"}</div>
            </div>
            <Avatar name={match.away.name} src={match.away.logo_url} />
          </div>
        </div>
      </section>

      <section className={cn("grid gap-4", hasDraw ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        <ProbCard label={`${match.home.name} win`} prob={probability?.home_win} tone="text-emerald-300" />
        {hasDraw ? <ProbCard label="Draw" prob={probability?.draw} tone="text-amber-300" /> : null}
        <ProbCard label={`${match.away.name} win`} prob={probability?.away_win} tone="text-violet-300" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StatCard label="Model confidence" value={match.confidence != null ? `${match.confidence}%` : "—"} tone={match.confidence != null && match.confidence >= 60 ? "text-emerald-300" : undefined} />
        <StatCard label="Fair odds A" value={match.fair_odds?.home_win != null ? match.fair_odds.home_win.toFixed(2) : "—"} />
        <StatCard label="Fair odds B" value={match.fair_odds?.away_win != null ? match.fair_odds.away_win.toFixed(2) : "—"} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Section title="Match overview">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-[20px] border border-white/8 bg-black/15 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">League</div>
              <div className="mt-2 text-sm text-white/78">{match.league}</div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/15 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Status</div>
              <div className="mt-2 text-sm text-white/78">{scoreState(match.status)}</div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/15 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Venue</div>
              <div className="mt-2 text-sm text-white/78">{context?.venue_name || context?.venue_city || "—"}</div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/15 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Weather</div>
              <div className="mt-2 text-sm text-white/78">{context?.weather_desc || "—"}</div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/15 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Attendance</div>
              <div className="mt-2 text-sm text-white/78">{context?.attendance ? context.attendance.toLocaleString() : "—"}</div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/15 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Neutral site</div>
              <div className="mt-2 text-sm text-white/78">{context?.neutral_site ? "Yes" : "No"}</div>
            </div>
          </div>
        </Section>

        <Section title="Model drivers">
          {keyDrivers.length ? (
            <div className="space-y-3">
              {keyDrivers.map((driver, index) => {
                const pct = Math.round(driver.importance * 100);
                return (
                  <div key={`${driver.feature}-${index}`} className="rounded-[20px] border border-white/8 bg-black/15 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{driver.feature}</div>
                        <div className="mt-1 text-xs text-white/45">Value: {valueForDisplay(driver.value)}</div>
                      </div>
                      <div className="text-sm font-semibold text-emerald-200">{pct}%</div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-emerald-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-white/10 bg-[#18181b] p-6 text-sm text-white/50">No driver breakdown has been provided for this match yet.</div>
          )}
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Section title="Stat comparison">
          {statRows.length ? (
            <div className="space-y-2">
              {statRows.map((key) => (
                <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-[18px] border border-white/8 bg-black/15 px-4 py-3">
                  <div className="text-right text-sm text-white/72">{valueForDisplay((match.stats_home as Record<string, unknown> | null)?.[key])}</div>
                  <div className="text-center text-[11px] uppercase tracking-[0.18em] text-white/38">{key.replace(/_/g, " ")}</div>
                  <div className="text-sm text-white/72">{valueForDisplay((match.stats_away as Record<string, unknown> | null)?.[key])}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-white/10 bg-[#18181b] p-6 text-sm text-white/50">Detailed stat splits are not available for this fixture.</div>
          )}
        </Section>

        <Section title="Head to head & context">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="Meetings" value={match.h2h?.total_matches != null ? String(match.h2h.total_matches) : "—"} />
            <StatCard label={`${match.home.name} wins`} value={match.h2h?.home_wins != null ? String(match.h2h.home_wins) : match.h2h?.player_a_wins != null ? String(match.h2h.player_a_wins) : match.h2h?.team_a_wins != null ? String(match.h2h.team_a_wins) : "—"} />
            <StatCard label={`${match.away.name} wins`} value={match.h2h?.away_wins != null ? String(match.h2h.away_wins) : match.h2h?.player_b_wins != null ? String(match.h2h.player_b_wins) : match.h2h?.team_b_wins != null ? String(match.h2h.team_b_wins) : "—"} />
            <StatCard label="Draws" value={match.h2h?.draws != null ? String(match.h2h.draws) : "—"} />
          </div>
          <div className="mt-4 rounded-[20px] border border-white/8 bg-black/15 p-4 text-sm text-white/58">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
              <MapPin size={12} />
              Match context
            </div>
            <div className="mt-2">
              {context?.venue_name || context?.venue_city
                ? `${context?.venue_name ?? ""}${context?.venue_name && context?.venue_city ? ", " : ""}${context?.venue_city ?? ""}`
                : "Venue context not supplied yet."}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
