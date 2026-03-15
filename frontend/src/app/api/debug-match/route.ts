import { NextResponse } from "next/server";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;
const SGO_KEY = process.env.SGO_API_KEY ?? "";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|afc|cf|ac|as|sc|cd|rsc|fk|sk|bk|hc|hv)\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_TEAM_WORDS = new Set(["united", "city", "town", "athletic", "sports", "club", "wanderers", "rovers", "county"]);

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.length > 3 && nb.includes(na)) return true;
  if (nb.length > 3 && na.includes(nb)) return true;
  const wa = na.split(" ").filter((w) => w.length > 2 && !GENERIC_TEAM_WORDS.has(w));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2 && !GENERIC_TEAM_WORDS.has(w)));
  if (wa.length > 0 && wa.some((w) => wb.has(w))) return true;
  return false;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eventID = searchParams.get("eventID");
  const sport = searchParams.get("sport") ?? "soccer";

  const info: Record<string, unknown> = {
    API_BASE,
    deploy_time: new Date().toISOString(),
  };

  let sgoHome = searchParams.get("home") ?? "";
  let sgoAway = searchParams.get("away") ?? "";

  if (eventID) {
    try {
      const sgoRes = await fetch(
        `https://api.sportsgameodds.com/v2/events/?apiKey=${SGO_KEY}&eventID=${eventID}`,
        { cache: "no-store" }
      );
      info.sgoStatus = sgoRes.status;
      if (sgoRes.ok) {
        const sgoData = await sgoRes.json();
        const ev = sgoData.data?.[0];
        if (ev) {
          sgoHome = ev.teams?.home?.names?.long ?? "";
          sgoAway = ev.teams?.away?.names?.long ?? "";
          info.sgoHome = sgoHome;
          info.sgoAway = sgoAway;
        }
      }
    } catch (e) {
      info.sgoError = String(e);
    }
  }

  // Search backend
  let bestId: string | null = null;
  if (sgoHome) {
    try {
      const res = await fetch(
        `${API_BASE}/matches/search?q=${encodeURIComponent(sgoHome)}&limit=20`,
        { cache: "no-store" }
      );
      info.searchStatus = res.status;
      if (res.ok) {
        const results = await res.json();
        const candidates = results.filter((r: { type: string; sport: string; title: string }) =>
          r.type === "match" &&
          r.sport === sport &&
          teamsMatch(sgoAway, r.title.split(" vs ").slice(-1)[0] ?? "")
        );
        info.candidates = candidates.map((r: { id: string; title: string; subtitle: string }) => ({
          id: r.id, title: r.title, subtitle: r.subtitle,
        }));
        bestId = candidates[0]?.id ?? null;
        info.bestId = bestId;
      }
    } catch (e) {
      info.searchError = String(e);
    }
  }

  // Fetch match detail for all candidates (up to 3)
  const detailResults: unknown[] = [];
  for (const c of (info.candidates as Array<{ id: string; title: string }> ?? []).slice(0, 3)) {
    try {
      const detailRes = await fetch(
        `${API_BASE}/sports/${sport}/matches/${c.id}`,
        { cache: "no-store" }
      );
      if (detailRes.ok) {
        const detail = await detailRes.json();
        detailResults.push({
          id: c.id, title: c.title,
          fields: Object.entries(detail).reduce((acc, [k, v]) => {
            (acc as Record<string, unknown>)[k] = v === null ? "null" : Array.isArray(v) ? `array(${(v as unknown[]).length})` : typeof v === "object" ? "object" : v;
            return acc;
          }, {} as Record<string, unknown>),
        });
      } else {
        detailResults.push({ id: c.id, title: c.title, status: detailRes.status });
      }
    } catch (e) {
      detailResults.push({ id: c.id, title: c.title, error: String(e) });
    }
  }
  info.detailResults = detailResults;
  info.bestId = (info.candidates as Array<{ id: string }> ?? [])[0]?.id ?? null;

  return NextResponse.json(info, { status: 200 });
}
