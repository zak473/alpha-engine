"use client";

import Link from "next/link";
import { cn, fmtPct } from "@/lib/utils";
import type { Match, PredictionResponse } from "@/lib/types";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

interface ProbBarProps {
  pHome: number;
  pDraw: number;
  pAway: number;
}

function ProbBar({ pHome, pDraw, pAway }: ProbBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        <div className="bg-accent-green transition-all" style={{ width: `${pHome * 100}%` }} />
        {pDraw > 0 && (
          <div className="bg-accent-amber transition-all" style={{ width: `${pDraw * 100}%` }} />
        )}
        <div className="bg-accent-red transition-all" style={{ width: `${pAway * 100}%` }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="num text-accent-green">{fmtPct(pHome)}</span>
        {pDraw > 0 && <span className="num text-accent-amber">{fmtPct(pDraw)}</span>}
        <span className="num text-accent-red">{fmtPct(pAway)}</span>
      </div>
    </div>
  );
}

interface PredictionCardProps {
  match: Match;
  prediction?: PredictionResponse;
  loading?: boolean;
  href?: string;
}

export function PredictionCard({ match, prediction, loading, href }: PredictionCardProps) {
  if (loading) {
    return (
      <div className="card px-4 py-4 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const inner = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge sport={match.sport}>{match.sport}</Badge>
          <span className="text-2xs text-text-muted">{match.competition}</span>
        </div>
        <StatusBadge status={match.status} />
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between">
        <div className="text-left min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{match.home_name}</p>
          <p className="text-2xs text-text-muted mt-0.5">Home</p>
        </div>
        <div className="shrink-0 text-center px-4">
          {match.status === "finished" ? (
            <span className="text-xl font-semibold num text-text-primary">
              {match.home_score} – {match.away_score}
            </span>
          ) : (
            <span className="text-xs text-text-muted">vs</span>
          )}
        </div>
        <div className="text-right min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{match.away_name}</p>
          <p className="text-2xs text-text-muted mt-0.5">Away</p>
        </div>
      </div>

      {/* Probability bar */}
      {prediction ? (
        <div className="space-y-1">
          <p className="label">Model Probabilities</p>
          <ProbBar pHome={prediction.p_home} pDraw={prediction.p_draw} pAway={prediction.p_away} />
        </div>
      ) : (
        <div className="py-2 text-center text-xs text-text-muted">No prediction available</div>
      )}

      {/* Edge + confidence */}
      {prediction?.edge !== undefined && (
        <div className="flex gap-4 pt-1 border-t border-surface-border">
          <div>
            <p className="label">Edge</p>
            <p className={cn("num text-sm font-medium mt-0.5", prediction.edge >= 0.02 ? "text-accent-green" : "text-text-muted")}>
              {fmtPct(prediction.edge)}
            </p>
          </div>
          <div>
            <p className="label">Confidence</p>
            <p className="num text-sm font-medium mt-0.5 text-text-primary">{fmtPct(prediction.confidence)}</p>
          </div>
          {prediction.model_id && (
            <div className="ml-auto">
              <p className="label">Model</p>
              <p className="text-xs text-text-muted mt-0.5 font-mono">{prediction.model_id}</p>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="card px-4 py-4 space-y-4 block hover:border-surface-border1 transition-colors"
      >
        {inner}
      </Link>
    );
  }

  return <div className="card px-4 py-4 space-y-4">{inner}</div>;
}
