"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PanelCard } from "@/components/ui/PanelCard";
import { Badge } from "@/components/ui/Badge";
import { sportColor, timeUntil } from "@/lib/utils";
import type { MvpPrediction } from "@/lib/types";
import { Plus, X, Star } from "lucide-react";

interface WatchEntry {
  id: string;
  name: string;
  sport: string;
}

const STORAGE_KEY = "ae_watchlist_v1";

function useWatchlist() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  function save(next: WatchEntry[]) {
    setEntries(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function remove(id: string) {
    save(entries.filter((e) => e.id !== id));
  }

  function add(entry: WatchEntry) {
    if (entries.find((e) => e.id === entry.id)) return;
    save([...entries, entry]);
  }

  return { entries, remove, add, loaded };
}

const QUICK_ADD: WatchEntry[] = [
  { id: "man-city",    name: "Manchester City", sport: "soccer"  },
  { id: "arsenal",     name: "Arsenal",         sport: "soccer"  },
  { id: "real-madrid", name: "Real Madrid",     sport: "soccer"  },
  { id: "alcaraz",     name: "C. Alcaraz",      sport: "tennis"  },
  { id: "navi",        name: "Natus Vincere",   sport: "esports" },
];

interface WatchlistModuleProps {
  predictions: MvpPrediction[];
}

export function WatchlistModule({ predictions }: WatchlistModuleProps) {
  const { entries, remove, add, loaded } = useWatchlist();
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");

  // Find next fixture for a watched entity from the loaded predictions
  function nextFixture(entry: WatchEntry): MvpPrediction | undefined {
    const now = Date.now();
    return predictions
      .filter((p) => {
        const isHome = p.participants.home.name.toLowerCase().includes(entry.name.toLowerCase())
          || p.participants.home.id === entry.id;
        const isAway = p.participants.away.name.toLowerCase().includes(entry.name.toLowerCase())
          || p.participants.away.id === entry.id;
        return (isHome || isAway) && new Date(p.start_time).getTime() > now;
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
  }

  const suggestions = QUICK_ADD.filter(
    (s) =>
      !entries.find((e) => e.id === s.id) &&
      (query === "" || s.name.toLowerCase().includes(query.toLowerCase()))
  );

  if (!loaded) return null;

  return (
    <PanelCard
      title="Watchlist"
      subtitle="Teams & players"
      padding="flush"
      action={
        <button
          className="btn-ghost text-xs py-1 px-2"
          onClick={() => setShowAdd((v) => !v)}
        >
          <Plus size={12} /> Add
        </button>
      }
    >
      {/* Quick add panel */}
      {showAdd && (
        <div className="px-4 py-3 border-b border-white/8 bg-white/[0.02]">
          <input
            type="text"
            placeholder="Search to add…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field text-xs py-1.5 mb-2"
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => { add(s); setShowAdd(false); setQuery(""); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-white/8 text-text-muted hover:text-text-primary hover:border-zinc-600 transition-colors capitalize"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sportColor(s.sport) }} />
                {s.name}
              </button>
            ))}
            {suggestions.length === 0 && (
              <p className="text-xs text-text-muted">No suggestions</p>
            )}
          </div>
        </div>
      )}

      {/* Watchlist entries */}
      {entries.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <Star size={20} className="mx-auto mb-2 text-text-subtle" />
          <p className="text-sm font-medium text-text-primary mb-0.5">Nothing on your watchlist</p>
          <p className="text-xs text-text-muted mb-4">Track teams or players to see upcoming fixtures.</p>
          {/* Quick-add suggestions */}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {QUICK_ADD.map((s) => (
              <button
                key={s.id}
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-white/8 text-text-muted hover:text-text-primary hover:border-zinc-600 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sportColor(s.sport) }} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {entries.map((entry) => {
            const fixture = nextFixture(entry);
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.025] transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-text-primary truncate">{entry.name}</p>
                    <Badge sport={entry.sport} className="text-2xs capitalize">{entry.sport}</Badge>
                  </div>
                  {fixture ? (
                    <p className="text-xs text-text-muted mt-0.5 truncate">
                      vs{" "}
                      {fixture.participants.home.id === entry.id
                        ? fixture.participants.away.name
                        : fixture.participants.home.name}
                      {" · "}
                      <span className="text-accent-amber">{timeUntil(fixture.start_time)}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-text-subtle mt-0.5">No upcoming fixture</p>
                  )}
                </div>
                {fixture && (
                  <Link
                    href={`/sports/${fixture.sport}/matches/${fixture.event_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-2xs text-accent-blue hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    View →
                  </Link>
                )}
                <button
                  onClick={() => remove(entry.id)}
                  className="shrink-0 text-text-subtle hover:text-text-muted transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
