"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  leagueIDForName,
  fetchOddsEvents,
  findMatchingEvent,
  americanToDecimal,
  type SGOEvent,
  type SGOOdd,
} from "@/lib/odds";
import { cn } from "@/lib/utils";

interface Props {
  league: string;
  homeName: string;
  awayName: string;
  hasDraw?: boolean;
  isLive?: boolean;
}

// Non-team stat entity IDs
const TEAM_ENTITIES = new Set(["home", "away", "all", "draw", "not_draw", "home+draw", "away+draw"]);

interface OddsMarket {
  name: string;
  selections: { label: string; odds: number | null; sub?: string }[];
}

function spreadSub(odd: SGOOdd): string | undefined {
  if (odd.bookSpread == null) return undefined;
  const n = parseFloat(odd.bookSpread);
  return `${n > 0 ? "+" : ""}${n}`;
}

function buildAllMarkets(event: SGOEvent, homeName: string, awayName: string): OddsMarket[] {
  const odds = event.odds;
  const markets: OddsMarket[] = [];

  function tryMarket(
    name: string,
    homeKey: string,
    awayKey: string,
    opts: { drawKey?: string; isOU?: boolean } = {}
  ) {
    const o1 = odds[homeKey];
    const o2 = odds[awayKey];
    if (!o1?.bookOddsAvailable || !o2?.bookOddsAvailable) return;
    const p1 = americanToDecimal(o1.bookOdds);
    const p2 = americanToDecimal(o2.bookOdds);
    if (p1 == null || p2 == null) return;

    if (opts.isOU) {
      const line = o1.bookOverUnder ?? "";
      markets.push({
        name,
        selections: [
          { label: `Over${line ? ` ${line}` : ""}`,  odds: p1 },
          { label: `Under${line ? ` ${line}` : ""}`, odds: p2 },
        ],
      });
      return;
    }

    const sels: OddsMarket["selections"] = [
      { label: homeName, odds: p1, sub: spreadSub(o1) },
    ];
    if (opts.drawKey) {
      const od = odds[opts.drawKey];
      if (od?.bookOddsAvailable) {
        const dp = americanToDecimal(od.bookOdds);
        if (dp != null) sels.push({ label: "Draw", odds: dp });
      }
    }
    sels.push({ label: awayName, odds: p2, sub: spreadSub(o2) });
    markets.push({ name, selections: sels });
  }

  // Full game
  tryMarket("Moneyline",    "points-home-game-ml-home",    "points-away-game-ml-away");
  tryMarket("1X2",          "points-home-reg-ml3way-home", "points-away-reg-ml3way-away", { drawKey: "points-all-reg-ml3way-draw" });
  tryMarket("Spread",       "points-home-game-sp-home",    "points-away-game-sp-away");
  tryMarket("Total",        "points-all-game-ou-over",     "points-all-game-ou-under",    { isOU: true });
  tryMarket("Home Total",   "points-home-game-ou-over",    "points-home-game-ou-under",   { isOU: true });
  tryMarket("Away Total",   "points-away-game-ou-over",    "points-away-game-ou-under",   { isOU: true });
  // Halves
  tryMarket("1H Moneyline", "points-home-1h-ml-home",      "points-away-1h-ml-away");
  tryMarket("1H Spread",    "points-home-1h-sp-home",      "points-away-1h-sp-away");
  tryMarket("1H Total",     "points-all-1h-ou-over",       "points-all-1h-ou-under",      { isOU: true });
  tryMarket("2H Moneyline", "points-home-2h-ml-home",      "points-away-2h-ml-away");
  tryMarket("2H Spread",    "points-home-2h-sp-home",      "points-away-2h-sp-away");
  tryMarket("2H Total",     "points-all-2h-ou-over",       "points-all-2h-ou-under",      { isOU: true });
  // Quarters
  for (const q of ["1q", "2q", "3q", "4q"]) {
    const n = q.toUpperCase();
    tryMarket(`${n} Moneyline`, `points-home-${q}-ml-home`, `points-away-${q}-ml-away`);
    tryMarket(`${n} Spread`,    `points-home-${q}-sp-home`, `points-away-${q}-sp-away`);
    tryMarket(`${n} Total`,     `points-all-${q}-ou-over`,  `points-all-${q}-ou-under`,  { isOU: true });
  }
  // Periods (hockey)
  for (const p of ["1p", "2p", "3p"]) {
    const n = p.toUpperCase();
    tryMarket(`${n} Moneyline`, `points-home-${p}-ml-home`, `points-away-${p}-ml-away`);
    tryMarket(`${n} Spread`,    `points-home-${p}-sp-home`, `points-away-${p}-sp-away`);
    tryMarket(`${n} Total`,     `points-all-${p}-ou-over`,  `points-all-${p}-ou-under`,  { isOU: true });
  }

  // Player props
  type PropAccum = { over?: { odds: number; line: string }; under?: { odds: number; line: string } };
  const playerProps = new Map<string, PropAccum>();
  const propNames = new Map<string, string>();

  for (const odd of Object.values(odds)) {
    if (!odd.bookOddsAvailable) continue;
    if (TEAM_ENTITIES.has(odd.statEntityID)) continue;
    if (odd.betTypeID !== "ou") continue;

    const key = `${odd.statEntityID}::${odd.statID}`;
    if (!playerProps.has(key)) {
      playerProps.set(key, {});
      const nameParts = odd.statEntityID.split("_");
      const nameOnly = nameParts.slice(0, nameParts.length > 2 ? -2 : nameParts.length);
      const name = nameOnly.map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
      const stat = odd.statID.charAt(0).toUpperCase() + odd.statID.slice(1);
      propNames.set(key, `${name} ${stat}`);
    }
    const prop = playerProps.get(key)!;
    const oddsVal = americanToDecimal(odd.bookOdds);
    if (oddsVal == null) continue;
    const line = odd.bookOverUnder ?? "";
    if (odd.sideID === "over")  prop.over  = { odds: oddsVal, line };
    if (odd.sideID === "under") prop.under = { odds: oddsVal, line };
  }

  for (const [key, prop] of Array.from(playerProps.entries())) {
    if (!prop.over && !prop.under) continue;
    const line = prop.over?.line || prop.under?.line || "";
    markets.push({
      name: propNames.get(key) ?? key,
      selections: [
        ...(prop.over  ? [{ label: `Over ${line}`,  odds: prop.over.odds  }] : []),
        ...(prop.under ? [{ label: `Under ${line}`, odds: prop.under.odds }] : []),
      ],
    });
  }

  return markets;
}

function OddsChip({ label, odds, sub, tone }: { label: string; odds: number | null; sub?: string; tone?: string }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] border border-white/8 bg-black/15 px-4 py-4 text-center">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-[-0.05em]", odds != null ? (tone ?? "text-white") : "text-white/25")}>
        {odds != null ? odds.toFixed(2) : "—"}
      </div>
      {sub != null && <div className="mt-1 text-[11px] text-white/35">{sub}</div>}
    </div>
  );
}

function MarketBlock({ market }: { market: OddsMarket }) {
  const cols = market.selections.length === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/35">{market.name}</div>
      <div className={cn("grid gap-3", cols)}>
        {market.selections.map((sel, i) => (
          <OddsChip
            key={i}
            label={sel.label}
            odds={sel.odds}
            sub={sel.sub}
            tone={i === 0 ? "text-emerald-300" : i === market.selections.length - 1 ? "text-violet-300" : "text-amber-300"}
          />
        ))}
      </div>
    </div>
  );
}

export function LiveOddsWidget({ league, homeName, awayName, isLive }: Props) {
  const [markets, setMarkets] = useState<OddsMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookmaker, setBookmaker] = useState<string | null>(null);

  useEffect(() => {
    const leagueID = leagueIDForName(league);
    if (!leagueID) { setLoading(false); return; }

    const load = () =>
      fetchOddsEvents(leagueID, isLive).then((events) => {
        const event = findMatchingEvent(events, homeName, awayName);
        if (event) {
          setMarkets(buildAllMarkets(event, homeName, awayName));
          // Find a bookmaker name for attribution
          const mlOdd = event.odds["points-home-game-ml-home"] ?? event.odds["points-home-reg-ml3way-home"];
          if (mlOdd) {
            const bm = Object.entries(mlOdd.byBookmaker).find(([, v]) => v.available);
            if (bm) setBookmaker(bm[0]);
          }
        }
        setLoading(false);
      });

    load();
    if (isLive) {
      const iv = setInterval(load, 60_000);
      return () => clearInterval(iv);
    }
  }, [league, homeName, awayName, isLive]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/40">
        <Loader2 size={14} className="animate-spin" />
        Loading market odds…
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/40">
        No market odds available for this fixture.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {markets.map((mkt, i) => <MarketBlock key={i} market={mkt} />)}
      {bookmaker && (
        <div className="text-right text-[10px] text-white/25">
          Best odds · SportsGameOdds · {bookmaker}
        </div>
      )}
    </div>
  );
}
