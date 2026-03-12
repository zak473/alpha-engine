"use client";

interface SoccerPitchSVGProps {
  xgHome: number | null;
  xgAway: number | null;
  shotsHome: number | null;
  shotsAway: number | null;
  homeLabel: string;
  awayLabel: string;
}

export function SoccerPitchSVG({
  xgHome,
  xgAway,
  shotsHome,
  shotsAway,
  homeLabel,
  awayLabel,
}: SoccerPitchSVGProps) {
  // Arrow size: 0–3 xG → 5–50px width
  const arrowWidth = (xg: number | null) => {
    if (xg == null) return 12;
    return Math.max(6, Math.min(50, xg * 16));
  };

  const homeW = arrowWidth(xgHome);
  const awayW = arrowWidth(xgAway);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 280 180" width="100%" style={{ maxWidth: 300 }}>
        {/* Pitch outline */}
        <rect x="4" y="4" width="272" height="172" rx="4" fill="#0a1a0a" stroke="#1e3a1e" strokeWidth="1.5" />
        {/* Centre circle */}
        <circle cx="140" cy="90" r="25" fill="none" stroke="#1e3a1e" strokeWidth="1" />
        <circle cx="140" cy="90" r="1.5" fill="#1e3a1e" />
        {/* Centre line */}
        <line x1="140" y1="4" x2="140" y2="176" stroke="#1e3a1e" strokeWidth="1" />
        {/* Left penalty area */}
        <rect x="4" y="52" width="44" height="76" fill="none" stroke="#1e3a1e" strokeWidth="1" />
        <rect x="4" y="70" width="18" height="40" fill="none" stroke="#1e3a1e" strokeWidth="1" />
        {/* Right penalty area */}
        <rect x="232" y="52" width="44" height="76" fill="none" stroke="#1e3a1e" strokeWidth="1" />
        <rect x="258" y="70" width="18" height="40" fill="none" stroke="#1e3a1e" strokeWidth="1" />

        {/* Home attack arrow (left → right) */}
        {xgHome != null && (
          <g opacity={0.75}>
            <polygon
              points={`50,${90 - homeW / 2} ${100},${90 - homeW / 2 - 6} ${100},${90 + homeW / 2 + 6} 50,${90 + homeW / 2}`}
              fill="#3b82f6"
            />
            <text x="75" y="94" textAnchor="middle" fill="white" fontSize={10} fontFamily="monospace" fontWeight="bold">
              {xgHome.toFixed(2)} xG
            </text>
          </g>
        )}
        {/* Away attack arrow (right → left) */}
        {xgAway != null && (
          <g opacity={0.75}>
            <polygon
              points={`230,${90 - awayW / 2} ${180},${90 - awayW / 2 - 6} ${180},${90 + awayW / 2 + 6} 230,${90 + awayW / 2}`}
              fill="#f59e0b"
            />
            <text x="205" y="94" textAnchor="middle" fill="white" fontSize={10} fontFamily="monospace" fontWeight="bold">
              {xgAway.toFixed(2)} xG
            </text>
          </g>
        )}
      </svg>

      {/* Labels */}
      <div className="flex items-center justify-between w-full px-2 text-[10px] font-mono">
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-accent-blue font-semibold">{homeLabel}</span>
          {shotsHome != null && <span className="text-text-subtle">{shotsHome} shots</span>}
          {xgHome != null && <span className="text-text-subtle">{xgHome.toFixed(2)} xG</span>}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-accent-amber font-semibold">{awayLabel}</span>
          {shotsAway != null && <span className="text-text-subtle">{shotsAway} shots</span>}
          {xgAway != null && <span className="text-text-subtle">{xgAway.toFixed(2)} xG</span>}
        </div>
      </div>
    </div>
  );
}
