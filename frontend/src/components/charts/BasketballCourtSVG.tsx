"use client";

import type { BasketballShotZone } from "@/lib/types";

interface BasketballCourtSVGProps {
  zones: BasketballShotZone[];
  label?: string;
}

function lerpColor(pct: number): string {
  // red → amber → green based on pct (0–1)
  if (pct >= 0.5) {
    // amber → green
    const t = (pct - 0.5) * 2;
    const r = Math.round(245 + t * (34 - 245));
    const g = Math.round(158 + t * (197 - 158));
    const b = Math.round(11 + t * (94 - 11));
    return `rgb(${r},${g},${b})`;
  } else {
    // red → amber
    const t = pct * 2;
    const r = Math.round(239 + t * (245 - 239));
    const g = Math.round(68 + t * (158 - 68));
    const b = Math.round(68 + t * (11 - 68));
    return `rgb(${r},${g},${b})`;
  }
}

function getZoneKey(zone: string): string {
  const z = zone.toLowerCase();
  if (z.includes("rim") || z.includes("0–3") || z.includes("0-3")) return "rim";
  if (z.includes("short") || z.includes("3–10") || z.includes("3-10")) return "short_mid";
  if (z.includes("mid") || z.includes("10–22") || z.includes("10-22")) return "mid";
  if (z.includes("corner")) return "corner3";
  if (z.includes("above") || z.includes("arc")) return "above_arc";
  return "other";
}

interface ZoneData {
  made: number;
  attempts: number;
  pct: number;
  attempts_pct: number;
}

export function BasketballCourtSVG({ zones, label }: BasketballCourtSVGProps) {
  const zoneMap: Record<string, ZoneData> = {};
  for (const z of zones) {
    const key = getZoneKey(z.zone);
    zoneMap[key] = { made: z.made, attempts: z.attempts, pct: z.pct, attempts_pct: z.attempts_pct };
  }

  function ZoneLabel({ x, y, zKey }: { x: number; y: number; zKey: string }) {
    const d = zoneMap[zKey];
    if (!d) return null;
    return (
      <g>
        <text x={x} y={y - 8} textAnchor="middle" fill="white" fontSize={9} fontFamily="monospace" opacity={0.9}>
          {d.made}/{d.attempts}
        </text>
        <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize={9} fontFamily="monospace" fontWeight="bold" opacity={0.9}>
          {Math.round(d.pct * 100)}%
        </text>
      </g>
    );
  }

  function zoneColor(key: string) {
    const d = zoneMap[key];
    if (!d) return "rgba(255,255,255,0.05)";
    return lerpColor(d.pct);
  }

  function zoneOpacity(key: string) {
    const d = zoneMap[key];
    if (!d) return 0.08;
    return 0.15 + d.attempts_pct * 0.55;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {label && <div className="text-[10px] text-text-subtle uppercase tracking-widest">{label}</div>}
      <svg viewBox="0 0 250 235" width="100%" style={{ maxWidth: 280 }}>
        {/* Court outline */}
        <rect x="5" y="5" width="240" height="225" rx="4" fill="#111116" stroke="#2c2c3f" strokeWidth="1.5" />
        {/* Paint / key */}
        <rect x="85" y="5" width="80" height="120" fill="none" stroke="#2c2c3f" strokeWidth="1" />
        {/* Backboard */}
        <line x1="100" y1="5" x2="150" y2="5" stroke="#3b82f6" strokeWidth="2" />
        {/* Rim */}
        <circle cx="125" cy="20" r="8" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
        {/* Free throw arc */}
        <path d="M 85 125 A 40 40 0 0 0 165 125" fill="none" stroke="#2c2c3f" strokeWidth="1" />

        {/* Zone: Rim (0–3 ft) */}
        <rect
          x="103" y="5" width="44" height="40"
          fill={zoneColor("rim")} fillOpacity={zoneOpacity("rim")}
          stroke={zoneColor("rim")} strokeOpacity={0.4} strokeWidth="0.5"
        />
        <ZoneLabel x={125} y={35} zKey="rim" />

        {/* Zone: Short Mid (3–10) */}
        <rect
          x="85" y="45" width="80" height="40"
          fill={zoneColor("short_mid")} fillOpacity={zoneOpacity("short_mid")}
          stroke={zoneColor("short_mid")} strokeOpacity={0.4} strokeWidth="0.5"
        />
        <ZoneLabel x={125} y={72} zKey="short_mid" />

        {/* Zone: Mid (10–22) */}
        <rect
          x="55" y="85" width="140" height="60"
          fill={zoneColor("mid")} fillOpacity={zoneOpacity("mid")}
          stroke={zoneColor("mid")} strokeOpacity={0.4} strokeWidth="0.5"
        />
        <ZoneLabel x={125} y={122} zKey="mid" />

        {/* Zone: Corner 3 (left) */}
        <rect
          x="5" y="5" width="50" height="110"
          fill={zoneColor("corner3")} fillOpacity={zoneOpacity("corner3")}
          stroke={zoneColor("corner3")} strokeOpacity={0.4} strokeWidth="0.5"
        />
        {/* Zone: Corner 3 (right) */}
        <rect
          x="195" y="5" width="50" height="110"
          fill={zoneColor("corner3")} fillOpacity={zoneOpacity("corner3")}
          stroke={zoneColor("corner3")} strokeOpacity={0.4} strokeWidth="0.5"
        />
        <ZoneLabel x={30} y={62} zKey="corner3" />

        {/* Zone: Above Arc (3pt arc top) */}
        <path
          d="M 55 145 Q 55 230 125 230 Q 195 230 195 145 L 195 85 A 80 80 0 0 1 55 85 Z"
          fill={zoneColor("above_arc")} fillOpacity={zoneOpacity("above_arc")}
          stroke={zoneColor("above_arc")} strokeOpacity={0.4} strokeWidth="0.5"
        />
        <ZoneLabel x={125} y={192} zKey="above_arc" />

        {/* 3pt arc line */}
        <path d="M 55 115 A 80 80 0 0 0 195 115" fill="none" stroke="#2c2c3f" strokeWidth="1" />
        {/* Corner 3 lines */}
        <line x1="55" y1="5" x2="55" y2="115" stroke="#2c2c3f" strokeWidth="1" />
        <line x1="195" y1="5" x2="195" y2="115" stroke="#2c2c3f" strokeWidth="1" />
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-text-subtle font-mono">
        <span style={{ color: "#ef4444" }}>▬ Low%</span>
        <span style={{ color: "#f59e0b" }}>▬ Mid%</span>
        <span style={{ color: "#22c55e" }}>▬ High%</span>
      </div>
    </div>
  );
}
