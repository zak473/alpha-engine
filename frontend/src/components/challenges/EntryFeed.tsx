"use client";

import { useState, useCallback } from "react";
import { getChallengeEntries } from "@/lib/api";
import type { ChallengeEntry, EntryFeedPage } from "@/lib/types";
import { Inbox } from "lucide-react";

interface Props {
  challengeId: string;
  scope: "feed" | "mine";
  initialData: EntryFeedPage;
}

const STATUS_BADGE: Record<ChallengeEntry["status"], { label: string; cls: string }> = {
  open:    { label: "Open",    cls: "badge badge-muted" },
  locked:  { label: "Locked", cls: "badge badge-warning" },
  settled: { label: "Settled",cls: "badge badge-positive" },
  void:    { label: "Void",   cls: "badge badge-negative" },
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
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="shimmer"
            style={{ height: 52, borderRadius: 6 }}
          />
        ))}
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "var(--text2)" }}>
        <Inbox size={28} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>No entries yet</div>
        <div style={{ fontSize: 11 }}>
          {scope === "mine" ? "You haven't submitted any picks yet." : "No picks have been submitted yet."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div>
        {data.items.map((entry) => {
          const badge = STATUS_BADGE[entry.status];
          const initial = shortId(entry.user_id).charAt(0).toUpperCase();
          const hasScore = entry.score_value != null;
          const scorePositive = hasScore && entry.score_value! > 0;

          return (
            <div
              key={entry.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                borderBottom: "1px solid var(--border0)",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {/* Avatar */}
              <span style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "color-mix(in srgb, var(--accent) 10%, var(--bg2))",
                border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--accent)",
              }}>
                {initial}
              </span>

              {/* Main content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text0)" }}>
                    {shortId(entry.user_id)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text2)" }}>picked</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>
                    {formatPick(entry.pick_type)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text2)" }}>on</span>
                  <span className="num" style={{ fontSize: 10, color: "var(--text2)" }}>
                    {entry.event_id.slice(0, 8)}…
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: "var(--text2)", textTransform: "capitalize" }}>{entry.sport}</span>
                  <span style={{ color: "var(--border1)", fontSize: 10 }}>·</span>
                  <span style={{ fontSize: 10, color: "var(--text2)" }}>{timeAgo(entry.submitted_at)}</span>
                </div>
              </div>

              {/* Right side: score + badge */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                {hasScore && (
                  <span className="num" style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: scorePositive ? "var(--positive)" : "var(--text2)",
                  }}>
                    {scorePositive ? "+" : ""}{entry.score_value!.toFixed(2)}
                  </span>
                )}
                <span className={badge.cls}>{badge.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {(data.has_next || page > 1) && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderTop: "1px solid var(--border0)",
        }}>
          <button
            className="btn btn-md btn-ghost"
            disabled={page === 1}
            onClick={() => loadPage(page - 1)}
            style={{ fontSize: 11 }}
          >
            Previous
          </button>
          <span className="num" style={{ fontSize: 11, color: "var(--text2)" }}>
            Page {page} · {data.total} entries
          </span>
          <button
            className="btn btn-md btn-ghost"
            disabled={!data.has_next}
            onClick={() => loadPage(page + 1)}
            style={{ fontSize: 11 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
