import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { colors } from "./tokens";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

export function fmtPct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

export function fmtRating(n: number): string {
  return Math.round(n).toLocaleString();
}

export function fmtDelta(n: number, prefix = ""): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${prefix}${fmt(n)}`;
}

export function sportColor(sport: string): string {
  switch (sport) {
    case "soccer":  return colors.accentBlue;
    case "tennis":  return colors.accentGreen;
    case "esports": return colors.accentPurple;
    default:        return colors.textMuted;
  }
}

/* ─── New formatters ─────────────────────────────────────────── */

/** 0.534 → "53.4%" */
export function formatProbability(p: number, decimals = 1): string {
  return `${(p * 100).toFixed(decimals)}%`;
}

/** Decimal odds: 1.923 → "1.92" */
export function formatOdds(odds: number): string {
  return odds.toFixed(2);
}

/** +3.2% or -1.4% with optional suffix */
export function formatDelta(n: number, suffix = "", decimals = 1): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}${suffix}`;
}

/**
 * Format ISO date string.
 * mode "short"    → "14 Mar"
 * mode "long"     → "14 Mar 2026, 18:30"
 * mode "relative" → "2h ago", "3d ago", "just now"
 */
export function formatDate(iso: string, mode: "short" | "long" | "relative" = "short"): string {
  const d = new Date(iso);
  if (mode === "relative") {
    const diff = Date.now() - d.getTime();
    const abs = Math.abs(diff);
    const future = diff < 0;
    const suffix = future ? "" : " ago";
    if (abs < 60_000) return "just now";
    if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m${suffix}`;
    if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h${suffix}`;
    return `${Math.floor(abs / 86_400_000)}d${suffix}`;
  }
  if (mode === "long") {
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleString("en-GB", { day: "numeric", month: "short" });
}

/** +43.2u or -8.4u (betting units) */
export function formatMoney(units: number, decimals = 1): string {
  const sign = units >= 0 ? "+" : "";
  return `${sign}${units.toFixed(decimals)}u`;
}

/** Accepts 0–1 or 0–100 range. 0.584 → "58.4%" | 58.4 → "58.4%" */
export function formatPercent(n: number, decimals = 1): string {
  const pct = n > 1 ? n : n * 100;
  return `${pct.toFixed(decimals)}%`;
}

export function sportLabel(sport: string): string {
  switch (sport) {
    case "soccer":  return "Soccer";
    case "tennis":  return "Tennis";
    case "esports": return "Esports";
    default:        return sport;
  }
}

export function outcomeLabel(outcome?: string): string {
  switch (outcome) {
    case "home_win": return "Home Win";
    case "away_win": return "Away Win";
    case "draw":     return "Draw";
    default:         return "—";
  }
}

export function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Finished";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
