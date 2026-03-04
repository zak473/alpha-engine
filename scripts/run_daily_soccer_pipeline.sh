#!/usr/bin/env bash
# Daily soccer prediction pipeline.
# Run this once per day (e.g. via cron at 06:00 UTC).
#
# Steps:
#   1. Ingest new match results and upcoming fixtures
#   2. Ingest updated match stats (xG, possession, etc.)
#   3. Rebuild ELO ratings (incremental — only new matches)
#   4. Rebuild feature rows for all matches
#   5. Run predictions for upcoming matches

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $*"; }

cd "${PROJECT_ROOT}"

log "=== Alpha Engine · Daily Soccer Pipeline ==="

# ------------------------------------------------------------------
# Step 1: Ingest matches
# ------------------------------------------------------------------
log "Step 1/5 — Ingest matches..."
if [[ -n "${MATCHES_CSV:-}" ]]; then
    python -m pipelines.soccer.ingest_matches --csv "${MATCHES_CSV}"
else
    log "  SKIP: set MATCHES_CSV env var to ingest a CSV file."
fi

# ------------------------------------------------------------------
# Step 2: Ingest match stats
# ------------------------------------------------------------------
log "Step 2/5 — Ingest match stats..."
if [[ -n "${STATS_CSV:-}" ]]; then
    python -m pipelines.soccer.ingest_match_stats --csv "${STATS_CSV}"
else
    log "  SKIP: set STATS_CSV env var to ingest stats CSV."
fi

# ------------------------------------------------------------------
# Step 3: ELO backfill (incremental — skip already-rated matches)
# ------------------------------------------------------------------
log "Step 3/5 — ELO backfill (incremental)..."
python -m pipelines.soccer.backfill_elo --incremental

# ------------------------------------------------------------------
# Step 4: Build features
# ------------------------------------------------------------------
log "Step 4/5 — Build feature rows..."
python -m pipelines.soccer.build_soccer_features

# ------------------------------------------------------------------
# Step 5: Run predictions
# ------------------------------------------------------------------
log "Step 5/5 — Run predictions for upcoming matches..."
python -m pipelines.soccer.predict_soccer

log "=== Pipeline complete ==="
