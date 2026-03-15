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

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.length > 3 && nb.includes(na)) return true;
  if (nb.length > 3 && na.includes(nb)) return true;
  const wa = na.split(" ").filter((w) => w.length > 2);
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wa.some((w) => wb.has(w))) return true;
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

  // Fetch match detail
  if (bestId) {
    try {
      const detailRes = await fetch(
        `${API_BASE}/sports/${sport}/matches/${bestId}`,
        { cache: "no-store" }
      );
      info.detailStatus = detailRes.status;
      if (detailRes.ok) {
        const detail = await detailRes.json();
        // Show which fields have data
        info.detailFields = Object.entries(detail).reduce((acc, [k, v]) => {
          (acc as Record<string, unknown>)[k] = v === null ? "null" : Array.isArray(v) ? `array(${(v as unknown[]).length})` : typeof v === "object" ? "object" : v;
          return acc;
        }, {} as Record<string, unknown>);
      } else {
        info.detailBody = await detailRes.text();
      }
    } catch (e) {
      info.detailError = String(e);
    }
  }

  return NextResponse.json(info, { status: 200 });
}
