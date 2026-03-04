"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { getChallengeEntries } from "@/lib/api";
import type { ChallengeEntry, EntryFeedPage } from "@/lib/types";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  challengeId: string;
  scope: "feed" | "mine";
  initialData: EntryFeedPage;
}

type BadgeVariant = "muted" | "positive" | "negative" | "warning";
const STATUS_BADGE: Record<ChallengeEntry["status"], { label: string; variant: BadgeVariant }> = {
  open:     { label: "Open",     variant: "muted" },
  locked:   { label: "Locked",   variant: "warning" },
  settled:  { label: "Settled",  variant: "positive" },
  void:     { label: "Void",     variant: "negative" },
};

function formatPick(pick: string) {
  return pick.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortId(userId: string) {
  return userId.startsWith("user-") ? userId.slice(5) : userId;
}

export function EntryFeed({ challengeId, scope, initialData }: Props) {
  const [data, setData] = useState<EntryFeedPage>(initialData);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const loadPage = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const result = await getChallengeEntries(challengeId, { scope, page: p, page_size: 20 });
        setData(result);
        setPage(p);
      } finally {
        setLoading(false);
      }
    },
    [challengeId, scope]
  );

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No entries yet"
        description={scope === "mine" ? "You haven't submitted any picks yet." : "No picks have been submitted yet."}
      />
    );
  }

  return (
    <div>
      <div className="divide-y divide-surface-border">
        {data.items.map((entry) => {
          const badge = STATUS_BADGE[entry.status];
          return (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
              {/* Avatar */}
              <span className="shrink-0 w-8 h-8 rounded-full bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center text-xs font-medium text-accent-purple uppercase">
                {shortId(entry.user_id).charAt(0)}
              </span>

              {/* Main */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-text-primary">{shortId(entry.user_id)}</span>
                  <span className="text-text-muted text-xs">picked</span>
                  <span className="text-sm font-semibold text-accent-blue">{formatPick(entry.pick_type)}</span>
                  <span className="text-text-muted text-xs">on</span>
                  <span className="text-xs text-text-muted font-mono truncate">{entry.event_id.slice(0, 8)}…</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-muted capitalize">{entry.sport}</span>
                  <span className="text-text-subtle text-xs">·</span>
                  <span className="text-xs text-text-muted">{timeAgo(entry.submitted_at)}</span>
                </div>
              </div>

              {/* Right side */}
              <div className="shrink-0 flex items-center gap-3">
                {entry.score_value != null && (
                  <span className={cn(
                    "font-mono text-sm font-medium",
                    entry.score_value > 0 ? "text-accent-green" : "text-text-muted"
                  )}>
                    {entry.score_value > 0 ? "+" : ""}{entry.score_value.toFixed(2)}
                  </span>
                )}
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {(data.has_next || page > 1) && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
          <button
            className="btn-ghost text-xs"
            disabled={page === 1}
            onClick={() => loadPage(page - 1)}
          >
            Previous
          </button>
          <span className="text-xs text-text-muted">
            Page {page} · {data.total} entries
          </span>
          <button
            className="btn-ghost text-xs"
            disabled={!data.has_next}
            onClick={() => loadPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
