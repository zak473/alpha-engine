"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, Flame, Plus, Radio, Sparkles, Star, Trophy, Users } from "lucide-react";
import type { BettingFilter, BettingMatch, SportSlug } from "@/lib/betting-types";
import { SPORT_CONFIG } from "@/lib/betting-types";
import { cn } from "@/lib/utils";
import type { PickOut, PicksStatsOut } from "@/lib/api";
import { getPicksStats, getRecentWins } from "@/lib/api";

const TIPSTERS = [
  { name: "Jack", specialty: "Soccer Specialist", winRate: 58, roi: 19.3, streak: 5, picks: 32 },
  { name: "Mason", specialty: "Tennis Value Picks", winRate: 61, roi: 25.0, streak: 4, picks: 28 },
  { name: "Luca", specialty: "NBA Edges", winRate: 55, roi: 14.4, streak: 3, picks: 26 },
  { name: "Rio", specialty: "Esports Props", winRate: 62, roi: 21.9, streak: 6, picks: 18 },
];

function getSportSummary(matches: BettingMatch[], sport: SportSlug) {
  const sportMatches = matches.filter((m) => m.sport === sport && m.status !== "finished" && m.status !== "cancelled");
  const live = sportMatches.filter((m) => m.status === "live").length;
  const topEdge = Math.max(0, ...sportMatches.map((m) => m.edgePercent ?? 0));
  return { total: sportMatches.length, live, topEdge };
}

function getTopSelections(matches: BettingMatch[]) {
  const selections = matches.flatMap((match) =>
    match.allMarkets.flatMap((market) =>
      market.selections.map((selection) => ({
        match,
        market,
        selection,
        edge: (selection.edge ?? 0) * 100,
      }))
    )
  );

  return selections
    .sort((a, b) => b.edge - a.edge)
    .filter((item) => item.edge > 0)
    .slice(0, 4);
}

function SportAccessCard({
  sport,
  matches,
  active,
  onClick,
}: {
  sport: SportSlug;
  matches: BettingMatch[];
  active: boolean;
  onClick: () => void;
}) {
  const cfg = SPORT_CONFIG[sport];
  const summary = getSportSummary(matches, sport);

  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-[24px] border p-5 text-left transition-all duration-150 hover:-translate-y-[1px]",
        active && "shadow-[0_16px_34px_rgba(46,219,108,0.12)]"
      )}
      style={active ? {
        background: "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(245,251,246,1) 100%)",
        borderColor: "rgba(46,219,108,0.24)",
      } : {
        background: "#ffffff",
        borderColor: "rgba(17,33,23,0.08)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full text-xl" style={{ background: `${cfg.color}16`, color: cfg.color }}>
            {cfg.icon}
          </div>
          <div className="mt-3 text-[28px] font-semibold leading-none text-[#1d251f]">{cfg.label}</div>
          <div className="mt-1 text-sm text-[#657267]">{summary.live} live · {summary.total} markets</div>
        </div>
        <div className="rounded-full px-3 py-1 text-sm font-semibold" style={{ background: "rgba(17,33,23,0.05)", color: "#314136" }}>
          {summary.total}
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#7c897f]">Top edge</div>
          <div className="mt-1 text-[32px] font-semibold leading-none text-[#163d23]">+{summary.topEdge.toFixed(0)}%</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium text-[#1d251f]" style={{ borderColor: "rgba(17,33,23,0.08)", background: active ? "rgba(46,219,108,0.12)" : "rgba(17,33,23,0.03)" }}>
          View games <ArrowUpRight size={15} />
        </div>
      </div>
    </button>
  );
}

function TipsterCard({ tipster }: { tipster: (typeof TIPSTERS)[number] }) {
  const initials = tipster.name.slice(0, 2).toUpperCase();
  return (
    <div className="rounded-[22px] border p-4" style={{ background: "#ffffff", borderColor: "rgba(17,33,23,0.08)" }}>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dff7e7] text-lg font-semibold text-[#166534]">{initials}</div>
        <div>
          <div className="text-[30px] font-semibold leading-none text-[#18211c]">{tipster.name}</div>
          <div className="mt-1 text-sm text-[#6d786f]">{tipster.specialty}</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-[#f4f8f4] px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#7b887e]">Win rate</div>
          <div className="mt-1 text-2xl font-semibold text-[#18211c]">{tipster.winRate}%</div>
        </div>
        <div className="rounded-2xl bg-[#eff9f1] px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#7b887e]">ROI</div>
          <div className="mt-1 text-2xl font-semibold text-[#166534]">+{tipster.roi}%</div>
        </div>
        <div className="rounded-2xl bg-[#fff8ec] px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#7b887e]">Streak</div>
          <div className="mt-1 text-2xl font-semibold text-[#9a6700]">{tipster.streak}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border px-3 py-3" style={{ borderColor: "rgba(17,33,23,0.07)", background: "#fbfcfb" }}>
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#7b887e]">Weekly picks</div>
          <div className="mt-1 text-sm font-medium text-[#18211c]">{tipster.picks} active selections</div>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full bg-[#1fd06a] px-4 py-2 text-sm font-semibold text-[#10311d] transition hover:brightness-95">
          <Plus size={15} /> Follow
        </button>
      </div>
    </div>
  );
}

function PerformanceCard({ matches }: { matches: BettingMatch[] }) {
  const [stats, setStats] = useState<PicksStatsOut | null>(null);
  const liveCount = matches.filter((m) => m.status === "live").length;

  useEffect(() => {
    getPicksStats().then(setStats).catch(() => {});
  }, []);

  const rows: [string, string][] = stats
    ? [
        ["Record", `${stats.won}W – ${stats.lost}L`],
        ["ROI", `${stats.roi >= 0 ? "+" : ""}${(stats.roi * 100).toFixed(1)}%`],
        ["Win %", `${(stats.win_rate * 100).toFixed(0)}%`],
      ]
    : [
        ["Record", "—"],
        ["ROI", "—"],
        ["Win %", "—"],
      ];

  return (
    <div className="rounded-[28px] border p-5" style={{ background: "#ffffff", borderColor: "rgba(17,33,23,0.08)" }}>
      <div className="flex items-center gap-2 text-[#18211c]">
        <BarChart3 size={18} />
        <h3 className="text-[30px] font-semibold leading-none">Performance Snapshot</h3>
      </div>
      <div className="mt-5 space-y-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border-b pb-3" style={{ borderColor: "rgba(17,33,23,0.07)" }}>
            <span className="text-sm text-[#677269]">{label}</span>
            <span className="text-2xl font-semibold text-[#18211c]">{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[22px] bg-[#f5faf6] p-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#738076]">
          <Radio size={14} /> Tracked picks
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#dbe8de]">
          <div className="h-full rounded-full bg-[#2edb6c]" style={{ width: stats && stats.total > 0 ? `${Math.min(90, Math.round(stats.win_rate * 100))}%` : "0%" }} />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-[#4d594f]">
          <span>{liveCount} live</span>
          <span>{stats ? stats.settled : 0} graded</span>
        </div>
      </div>
    </div>
  );
}

function TopPicksCard({ matches }: { matches: BettingMatch[] }) {
  const picks = getTopSelections(matches);
  return (
    <div className="rounded-[28px] border p-5" style={{ background: "#ffffff", borderColor: "rgba(17,33,23,0.08)" }}>
      <div className="flex items-center gap-2 text-[#18211c]">
        <Sparkles size={18} />
        <h3 className="text-[30px] font-semibold leading-none">Top Picks Today</h3>
      </div>
      <div className="mt-5 space-y-3">
        {picks.slice(0, 3).map((pick) => (
          <div key={`${pick.match.id}-${pick.market.id}-${pick.selection.id}`} className="rounded-[20px] border p-4" style={{ borderColor: "rgba(17,33,23,0.07)", background: "#fbfcfb" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#18211c]">{pick.match.home.shortName} vs {pick.match.away.shortName}</div>
                <div className="mt-1 text-xs text-[#6d786f]">{pick.market.name} · {pick.selection.label}</div>
              </div>
              <div className="rounded-full bg-[#eff9f1] px-3 py-1 text-sm font-semibold text-[#166534]">+{pick.edge.toFixed(1)}%</div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-[#728074]">Odds {pick.selection.odds.toFixed(2)}</span>
              <span className="font-medium text-[#18211c]">{SPORT_CONFIG[pick.match.sport].label}</span>
            </div>
          </div>
        ))}
      </div>
      <button className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[#edf9f1] px-4 py-3 text-sm font-semibold text-[#166534] transition hover:brightness-95">
        See top matches
      </button>
    </div>
  );
}

function LastWinningPicks() {
  const [picks, setPicks] = useState<PickOut[]>([]);

  useEffect(() => {
    getRecentWins(5).then(setPicks).catch(() => {});
  }, []);

  return (
    <div className="rounded-[28px] border p-5" style={{ background: "#ffffff", borderColor: "rgba(17,33,23,0.08)" }}>
      <div className="flex items-center gap-2 text-[#18211c]">
        <Trophy size={18} />
        <h3 className="text-[30px] font-semibold leading-none">Last 5 winning picks</h3>
      </div>
      <div className="mt-5 space-y-3">
        {picks.length === 0 ? (
          <p className="text-sm text-[#748076] text-center py-4">No winning picks tracked yet</p>
        ) : (
          picks.map((pick) => (
            <div key={pick.id} className="flex items-center justify-between rounded-[18px] border px-4 py-3" style={{ borderColor: "rgba(17,33,23,0.07)", background: "#fbfcfb" }}>
              <div className="min-w-0 flex-1 pr-3">
                <div className="text-sm font-semibold text-[#18211c] truncate">{pick.selection_label}</div>
                <div className="text-xs text-[#748076] truncate">{pick.match_label}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-semibold text-[#166534]">WIN</div>
                <div className="text-xs text-[#748076]">@{pick.odds.toFixed(2)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function DashboardShowcase({
  matches,
  activeSport,
  filter,
  onSelectSport,
  onSetInPlay,
}: {
  matches: BettingMatch[];
  activeSport: SportSlug | "all";
  filter: BettingFilter;
  onSelectSport: (sport: SportSlug) => void;
  onSetInPlay: () => void;
}) {
  const inPlayActive = filter.status === "live";
  const featuredSports: SportSlug[] = ["soccer", "basketball", "baseball", "tennis", "esports"];
  const visibleSports = featuredSports.slice(0, 2);
  const hiddenCount = featuredSports.length - 2;

  return (
    <div className="space-y-5">
      <div className="rounded-[30px] border p-5 lg:p-6" style={{ background: "linear-gradient(180deg, #ffffff 0%, #f8fbf8 100%)", borderColor: "rgba(17,33,23,0.08)", boxShadow: "0 18px 40px rgba(15,23,42,0.04)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <button className={cn("inline-flex items-center gap-2 rounded-full border px-5 py-3 text-base font-semibold transition", !inPlayActive && "shadow-[0_12px_30px_rgba(46,219,108,0.10)]")} style={!inPlayActive ? { background: "#1fd06a", color: "#10311d", borderColor: "rgba(31,208,106,0.30)" } : { background: "#ffffff", color: "#243128", borderColor: "rgba(17,33,23,0.10)" }}>
            <Users size={17} /> All Sports
          </button>
          <button onClick={onSetInPlay} className={cn("inline-flex items-center gap-2 rounded-full border px-5 py-3 text-base font-semibold transition", inPlayActive && "shadow-[0_12px_30px_rgba(46,219,108,0.10)]")} style={inPlayActive ? { background: "#1fd06a", color: "#10311d", borderColor: "rgba(31,208,106,0.30)" } : { background: "#ffffff", color: "#243128", borderColor: "rgba(17,33,23,0.10)" }}>
            <Radio size={17} /> In Play
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-5 text-sm text-[#536157]">
            <span className="inline-flex items-center gap-2"><Flame size={15} className="text-[#17b357]" /> {matches.filter((m) => m.status === "live").length} live</span>
            <span>{matches.length} markets</span>
            <span className="font-semibold text-[#166534]">+{Math.max(...matches.map((m) => m.edgePercent ?? 0), 0).toFixed(1)}% top edge</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {visibleSports.map((sport) => (
            <SportAccessCard
              key={sport}
              sport={sport}
              matches={matches}
              active={activeSport === sport}
              onClick={() => onSelectSport(sport)}
            />
          ))}
          <Link
            href="/matches"
            className="flex flex-col items-center justify-center gap-3 rounded-[24px] border p-5 text-center transition-all duration-150 hover:-translate-y-[1px]"
            style={{ background: "#ffffff", borderColor: "rgba(17,33,23,0.08)", borderStyle: "dashed" }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(31,208,106,0.10)" }}>
              <ArrowUpRight size={20} style={{ color: "#1fd06a" }} />
            </div>
            <div>
              <div className="text-base font-semibold text-[#18211c]">See All Sports</div>
              <div className="mt-1 text-sm text-[#677269]">+{hiddenCount} more</div>
            </div>
          </Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.65fr_0.95fr]">
        <div className="rounded-[30px] border p-5 lg:p-6" style={{ background: "#ffffff", borderColor: "rgba(17,33,23,0.08)", boxShadow: "0 18px 40px rgba(15,23,42,0.04)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[38px] font-semibold leading-none text-[#18211c]">Follow Our Tipsters</div>
              <p className="mt-2 max-w-2xl text-base text-[#68756b]">See who’s in form, track their performance, and follow the analysts behind the strongest picks.</p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-full border px-5 py-3 text-base font-semibold text-[#166534]" style={{ borderColor: "rgba(31,208,106,0.30)", background: "#edf9f1" }}>
              <Star size={17} /> Follow
            </button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {TIPSTERS.map((tipster) => <TipsterCard key={tipster.name} tipster={tipster} />)}
          </div>
        </div>

        <div className="grid gap-5">
          <PerformanceCard matches={matches} />
          <TopPicksCard matches={matches} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="rounded-[30px] border p-5 lg:p-6" style={{ background: "#ffffff", borderColor: "rgba(17,33,23,0.08)", boxShadow: "0 18px 40px rgba(15,23,42,0.04)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[#18211c]">
              <Sparkles size={18} className="text-[#17b357]" />
              <h3 className="text-[30px] font-semibold leading-none">Featured board</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#748076]">
              <span className="rounded-full bg-[#eff9f1] px-3 py-1 font-semibold text-[#166534]">Top Pick Today</span>
              <span className="rounded-full bg-[#fff8ec] px-3 py-1 font-semibold text-[#9a6700]">Safest Pick</span>
              <span className="rounded-full bg-[#f3f7fd] px-3 py-1 font-semibold text-[#34568f]">Best Value</span>
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {getTopSelections(matches).slice(0, 3).map((pick, index) => (
              <div key={`${pick.match.id}-${index}`} className="rounded-[24px] border p-4" style={{ borderColor: "rgba(17,33,23,0.08)", background: index === 0 ? "linear-gradient(180deg, #f5fbf6 0%, #ffffff 100%)" : "#fbfcfb" }}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#7c897f]">{index === 0 ? "Top Pick Today" : index === 1 ? "Safest Pick" : "Best Value Pick"}</div>
                <div className="mt-3 text-xl font-semibold text-[#18211c]">{pick.match.home.name} vs {pick.match.away.name}</div>
                <div className="mt-2 text-sm text-[#667267]">{pick.market.name} · {pick.selection.label}</div>
                <div className="mt-5 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#7c897f]">Odds</div>
                    <div className="mt-1 text-2xl font-semibold text-[#18211c]">{pick.selection.odds.toFixed(2)}</div>
                  </div>
                  <div className="rounded-full bg-[#eff9f1] px-3 py-1.5 text-sm font-semibold text-[#166534]">+{pick.edge.toFixed(1)}% edge</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <LastWinningPicks />
      </div>
    </div>
  );
}
