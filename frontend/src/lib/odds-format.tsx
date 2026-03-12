"use client";

import { createContext, useContext, useState, useCallback } from "react";

export type OddsFormat = "decimal" | "fractional" | "american";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function formatOdds(decimal: number, format: OddsFormat): string {
  if (format === "fractional") {
    const numerator = decimal - 1;
    const precision = 100;
    const n = Math.round(numerator * precision);
    const d = precision;
    const g = gcd(Math.abs(n), d);
    return `${n / g}/${d / g}`;
  }
  if (format === "american") {
    if (decimal >= 2) return `+${Math.round((decimal - 1) * 100)}`;
    return `${Math.round(-100 / (decimal - 1))}`;
  }
  return decimal.toFixed(2);
}

interface OddsFormatContextValue {
  format: OddsFormat;
  setFormat: (f: OddsFormat) => void;
  fmt: (odds: number) => string;
}

const OddsFormatContext = createContext<OddsFormatContextValue>({
  format: "decimal",
  setFormat: () => {},
  fmt: (o) => o.toFixed(2),
});

export function OddsFormatProvider({ children }: { children: React.ReactNode }) {
  const [format, setFormatState] = useState<OddsFormat>(() => {
    if (typeof window === "undefined") return "decimal";
    return (localStorage.getItem("ae_odds_format") as OddsFormat) ?? "decimal";
  });

  const setFormat = useCallback((f: OddsFormat) => {
    setFormatState(f);
    try { localStorage.setItem("ae_odds_format", f); } catch {}
  }, []);

  const fmt = useCallback((odds: number) => formatOdds(odds, format), [format]);

  return (
    <OddsFormatContext.Provider value={{ format, setFormat, fmt }}>
      {children}
    </OddsFormatContext.Provider>
  );
}

export function useOddsFormat() {
  return useContext(OddsFormatContext);
}
