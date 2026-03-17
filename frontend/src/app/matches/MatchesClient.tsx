"use client";

import { useEffect, useState } from "react";
import { MatchesTable } from "@/components/matches/MatchesTable";
import { getPredictions } from "@/lib/api";
import { mvpToMatch } from "@/lib/transforms";
import type { Match } from "@/lib/types";

export function MatchesClient() {
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    getPredictions({ limit: 100 })
      .then((data) => setMatches(data.items.map(mvpToMatch)))
      .catch(() => setMatches([]));
  }, []);

  return <MatchesTable initialMatches={matches} />;
}
