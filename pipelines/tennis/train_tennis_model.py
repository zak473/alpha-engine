"""
Tennis match outcome model training.

Algorithm:   LogisticRegression + CalibratedClassifierCV (Platt, prefit)
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
Output:      artefacts/tennis_lr_v{n}.joblib + model_registry row

Features are computed via a bulk-load strategy (not per-match DB queries) to
handle 50k+ training samples without timing out.

Labels:  0 = home player wins  |  1 = away player wins  (no draws in tennis)

Usage:
    python -m pipelines.tennis.train_tennis_model
    python -m pipelines.tennis.train_tennis_model --version v2
"""

from __future__ import annotations

import argparse
import bisect
import logging
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from db.models.mvp import CoreMatch, ModelRegistry, RatingEloTeam
from db.models.tennis import TennisMatch, TennisMatchStats
from db.session import SessionLocal
from evaluation.metrics import brier, logloss
from pipelines.tennis.feature_engineering import (
    FEATURE_NAMES,
    OUTCOME_LABELS,
    LABEL_OUTCOMES,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parents[2] / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

_SPORT = "tennis"
_DEFAULT_ELO = 1000.0


# ---------------------------------------------------------------------------
# Label helper
# ---------------------------------------------------------------------------

def _label(outcome: Optional[str]) -> Optional[int]:
    if outcome in ("H", "home_win"):
        return 0
    if outcome in ("A", "away_win"):
        return 1
    return None


# ---------------------------------------------------------------------------
# Bulk data loader — replaces per-match DB queries with in-memory lookups
# ---------------------------------------------------------------------------

def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class BulkDataStore:
    """
    Pre-loads all tennis data into memory for O(log n) feature lookups.
    Replaces ~9 per-match DB queries with 4 bulk queries at startup.
    """

    def __init__(self, session):
        log.info("BulkDataStore: loading all tennis CoreMatch rows …")
        all_matches: list[CoreMatch] = (
            session.query(CoreMatch)
            .filter(CoreMatch.sport == _SPORT)
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )
        log.info("  %d total tennis matches loaded.", len(all_matches))

        # match_id → CoreMatch
        self.match_by_id: dict[str, CoreMatch] = {m.id: m for m in all_matches}

        # player_id → sorted list of (kickoff_ts_seconds, match)
        # for O(log n) "matches before kickoff" lookups
        player_matches: dict[str, list] = defaultdict(list)
        for m in all_matches:
            ts = _ensure_utc(m.kickoff_utc).timestamp()
            if m.home_team_id:
                player_matches[m.home_team_id].append((ts, m))
            if m.away_team_id:
                player_matches[m.away_team_id].append((ts, m))
        # Already sorted because all_matches is ordered by kickoff_utc
        self.player_matches: dict[str, list] = dict(player_matches)
        self.player_ts: dict[str, list] = {
            pid: [x[0] for x in lst] for pid, lst in self.player_matches.items()
        }

        log.info("BulkDataStore: loading ELO ratings …")
        elo_rows: list[RatingEloTeam] = session.query(RatingEloTeam).all()
        # team_id → sorted list of (kickoff_ts, rating_after)
        elo_by_team: dict[str, list] = defaultdict(list)
        for row in elo_rows:
            m = self.match_by_id.get(row.match_id)
            if m is None:
                continue
            ts = _ensure_utc(m.kickoff_utc).timestamp()
            elo_by_team[row.team_id].append((ts, row.rating_after))
        self.elo_by_team: dict[str, list] = {}
        self.elo_ts: dict[str, list] = {}
        for tid, lst in elo_by_team.items():
            lst.sort(key=lambda x: x[0])
            self.elo_by_team[tid] = lst
            self.elo_ts[tid] = [x[0] for x in lst]
        log.info("  %d ELO rows loaded for %d teams.", len(elo_rows), len(self.elo_by_team))

        log.info("BulkDataStore: loading TennisMatch surface data …")
        tennis_rows: list[TennisMatch] = session.query(TennisMatch).all()
        self.surface_by_match: dict[str, Optional[str]] = {
            r.match_id: r.surface for r in tennis_rows
        }
        log.info("  %d TennisMatch rows loaded.", len(tennis_rows))

        log.info("BulkDataStore: loading TennisMatchStats …")
        stats_rows: list[TennisMatchStats] = session.query(TennisMatchStats).all()
        # player_id → list of (kickoff_ts, stats_row), sorted by ts
        stats_by_player: dict[str, list] = defaultdict(list)
        for row in stats_rows:
            m = self.match_by_id.get(row.match_id)
            if m is None:
                continue
            ts = _ensure_utc(m.kickoff_utc).timestamp()
            stats_by_player[row.player_id].append((ts, row))
        self.stats_by_player: dict[str, list] = {}
        self.stats_ts: dict[str, list] = {}
        for pid, lst in stats_by_player.items():
            lst.sort(key=lambda x: x[0])
            self.stats_by_player[pid] = lst
            self.stats_ts[pid] = [x[0] for x in lst]
        log.info("  %d TennisMatchStats rows loaded for %d players.",
                 len(stats_rows), len(self.stats_by_player))

    def get_elo_before(self, team_id: str, kickoff_ts: float) -> float:
        ts_list = self.elo_ts.get(team_id)
        if not ts_list:
            return _DEFAULT_ELO
        idx = bisect.bisect_left(ts_list, kickoff_ts) - 1
        if idx < 0:
            return _DEFAULT_ELO
        return self.elo_by_team[team_id][idx][1]

    def get_last_n_matches(
        self, player_id: str, kickoff_ts: float, n: int = 5
    ) -> list[CoreMatch]:
        ts_list = self.player_ts.get(player_id)
        if not ts_list:
            return []
        idx = bisect.bisect_left(ts_list, kickoff_ts)
        # matches before kickoff
        start = max(0, idx - n)
        return [self.player_matches[player_id][i][1] for i in range(start, idx)]

    def get_days_rest(self, player_id: str, kickoff_ts: float) -> float:
        ts_list = self.player_ts.get(player_id)
        if not ts_list:
            return 7.0
        idx = bisect.bisect_left(ts_list, kickoff_ts) - 1
        if idx < 0:
            return 7.0
        last_ts = ts_list[idx]
        return max(0.0, (kickoff_ts - last_ts) / 86_400)

    def get_h2h(
        self, home_id: str, away_id: str, kickoff_ts: float
    ) -> tuple[float, int]:
        home_ts = self.player_ts.get(home_id, [])
        away_ts = self.player_ts.get(away_id, [])
        if not home_ts or not away_ts:
            return 0.5, 0

        # Matches involving home player before kickoff
        idx_h = bisect.bisect_left(home_ts, kickoff_ts)
        home_matches = {
            self.player_matches[home_id][i][1].id
            for i in range(idx_h)
        }
        # H2H = matches involving away player that are also in home's matches
        idx_a = bisect.bisect_left(away_ts, kickoff_ts)
        meetings = [
            self.player_matches[away_id][i][1]
            for i in range(idx_a)
            if self.player_matches[away_id][i][1].id in home_matches
        ]
        if not meetings:
            return 0.5, 0

        home_wins = sum(
            1 for m in meetings
            if (m.home_team_id == home_id and m.outcome in ("home_win", "H"))
            or (m.away_team_id == home_id and m.outcome in ("away_win", "A"))
        )
        return home_wins / len(meetings), len(meetings)

    def get_rolling_serve_stats(
        self, player_id: str, kickoff_ts: float, n: int = 10
    ) -> dict[str, float]:
        ts_list = self.stats_ts.get(player_id)
        if not ts_list:
            return {"ace_avg": 0.0, "df_avg": 0.0, "first_serve_pct_avg": 0.0,
                    "first_serve_won_avg": 0.0, "bp_conv_avg": 0.0}
        idx = bisect.bisect_left(ts_list, kickoff_ts)
        start = max(0, idx - n)
        rows = [self.stats_by_player[player_id][i][1] for i in range(start, idx)]
        if not rows:
            return {"ace_avg": 0.0, "df_avg": 0.0, "first_serve_pct_avg": 0.0,
                    "first_serve_won_avg": 0.0, "bp_conv_avg": 0.0}

        def _avg(attr: str) -> float:
            vals = [float(getattr(r, attr)) for r in rows
                    if getattr(r, attr) is not None]
            return sum(vals) / len(vals) if vals else 0.0

        return {
            "ace_avg":              _avg("aces"),
            "df_avg":               _avg("double_faults"),
            "first_serve_pct_avg":  _avg("first_serve_in_pct"),
            "first_serve_won_avg":  _avg("first_serve_won_pct"),
            "bp_conv_avg":          _avg("bp_conversion_pct"),
        }


# ---------------------------------------------------------------------------
# Feature builder (uses BulkDataStore instead of DB)
# ---------------------------------------------------------------------------

def _build_feature_vector_bulk(store: BulkDataStore, match: CoreMatch) -> list[float]:
    kickoff_ts = _ensure_utc(match.kickoff_utc).timestamp()
    home_id = match.home_team_id
    away_id = match.away_team_id

    # ELO
    elo_home = store.get_elo_before(home_id, kickoff_ts)
    elo_away = store.get_elo_before(away_id, kickoff_ts)
    elo_diff = elo_home - elo_away

    # Form
    home_hist = store.get_last_n_matches(home_id, kickoff_ts, n=5)
    away_hist = store.get_last_n_matches(away_id, kickoff_ts, n=5)

    def _form_pts(matches: list[CoreMatch], pid: str) -> float:
        pts = 0.0
        for m in matches:
            is_home = m.home_team_id == pid
            if m.outcome in ("home_win", "H"):
                pts += 3 if is_home else 0
            elif m.outcome in ("away_win", "A"):
                pts += 0 if is_home else 3
        return pts

    home_form_pts = _form_pts(home_hist, home_id)
    away_form_pts = _form_pts(away_hist, away_id)

    # Rest
    home_days_rest = store.get_days_rest(home_id, kickoff_ts)
    away_days_rest = store.get_days_rest(away_id, kickoff_ts)

    # H2H
    h2h_win_pct, h2h_n = store.get_h2h(home_id, away_id, kickoff_ts)

    # Surface
    surface = store.surface_by_match.get(match.id)
    s = (surface or "").lower()
    surface_hard  = 1.0 if s == "hard"  else 0.0
    surface_clay  = 1.0 if s == "clay"  else 0.0
    surface_grass = 1.0 if s == "grass" else 0.0

    # Rolling serve stats
    home_serve = store.get_rolling_serve_stats(home_id, kickoff_ts)
    away_serve = store.get_rolling_serve_stats(away_id, kickoff_ts)

    return [
        elo_home,
        elo_away,
        elo_diff,
        home_form_pts,
        away_form_pts,
        home_days_rest,
        away_days_rest,
        h2h_win_pct,
        float(h2h_n),
        surface_hard,
        surface_clay,
        surface_grass,
        home_serve["ace_avg"],
        away_serve["ace_avg"],
        home_serve["df_avg"],
        away_serve["df_avg"],
        home_serve["first_serve_pct_avg"],
        away_serve["first_serve_pct_avg"],
        home_serve["first_serve_won_avg"],
        away_serve["first_serve_won_avg"],
        home_serve["bp_conv_avg"],
        away_serve["bp_conv_avg"],
    ]


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_training_data(session) -> tuple[np.ndarray, np.ndarray, list[str]]:
    store = BulkDataStore(session)

    rows = (
        session.query(CoreMatch)
        .filter(
            CoreMatch.sport == _SPORT,
            CoreMatch.status == "finished",
            CoreMatch.outcome.isnot(None),
            CoreMatch.outcome != "D",
            CoreMatch.outcome != "draw",
        )
        .order_by(CoreMatch.kickoff_utc.asc())
        .all()
    )

    if len(rows) < 10:
        raise ValueError(f"Insufficient training data: only {len(rows)} labelled rows.")

    log.info("Building feature vectors for %d matches …", len(rows))
    X_raw, y_raw, match_ids = [], [], []
    skipped = 0
    for i, match in enumerate(rows):
        label = _label(match.outcome)
        if label is None:
            log.warning("Unknown outcome %r for match %s — skipping", match.outcome, match.id)
            skipped += 1
            continue
        try:
            vector = _build_feature_vector_bulk(store, match)
        except Exception as exc:
            log.warning("Feature error for match %s: %s — skipping", match.id[:8], exc)
            skipped += 1
            continue
        X_raw.append(vector)
        y_raw.append(label)
        match_ids.append(match.id)
        if (i + 1) % 5000 == 0:
            log.info("  … %d / %d done", i + 1, len(rows))

    log.info("Built %d feature vectors (%d skipped).", len(y_raw), skipped)

    if len(y_raw) < 10:
        raise ValueError(f"Insufficient usable training samples: only {len(y_raw)}.")

    X = np.array(X_raw, dtype=float)
    y = np.array(y_raw, dtype=int)

    # Impute NaN → column mean
    col_means = np.nanmean(X, axis=0)
    col_means = np.where(np.isnan(col_means), 0.0, col_means)
    for j in range(X.shape[1]):
        mask = np.isnan(X[:, j])
        if mask.any():
            X[mask, j] = col_means[j]

    log.info("Loaded %d training samples, %d features.", len(y), X.shape[1])
    return X, y, match_ids


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(version: Optional[str] = None) -> str:
    session = SessionLocal()
    try:
        X, y, match_ids = _load_training_data(session)
        n_total = len(y)

        # Check label distribution
        unique, counts = np.unique(y, return_counts=True)
        log.info("Label distribution: %s", dict(zip(unique.tolist(), counts.tolist())))
        if len(unique) < 2:
            raise ValueError(f"Only one class present in labels: {unique}. Cannot train.")

        # Walk-forward split: oldest 80% for train, newest 20% for eval
        split_idx = int(n_total * 0.8)
        X_train, X_eval = X[:split_idx], X[split_idx:]
        y_train, y_eval = y[:split_idx], y[split_idx:]
        log.info("Train: %d  |  Eval: %d", len(y_train), len(y_eval))

        if len(y_train) < 5:
            raise ValueError("Not enough training samples after split.")

        # Build pipeline: scale → LR
        # Use prefit calibration to avoid 5-fold CV over 40k+ samples (OOM)
        base_lr = LogisticRegression(
            solver="lbfgs",
            max_iter=1000,
            C=1.0,
            random_state=42,
        )
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("lr", base_lr),
        ])
        # Fit base model on 90% of train, calibrate on remaining 10%
        cal_split = int(len(y_train) * 0.9)
        log.info("Fitting base model on %d samples …", cal_split)
        pipeline.fit(X_train[:cal_split], y_train[:cal_split])
        log.info("Calibrating on %d samples …", len(y_train) - cal_split)
        calibrated = CalibratedClassifierCV(pipeline, method="sigmoid", cv="prefit")
        calibrated.fit(X_train[cal_split:], y_train[cal_split:])
        log.info("Model trained and calibrated.")

        # Evaluate on held-out set
        if len(y_eval) > 0:
            proba = calibrated.predict_proba(X_eval)
            y_pred = calibrated.predict(X_eval)

            accuracy = float((y_pred == y_eval).mean())

            brier_scores = []
            for cls_idx in range(2):
                y_true_bin = (y_eval == cls_idx).astype(float)
                brier_scores.append(brier(y_true_bin, proba[:, cls_idx]))
            brier_score = float(np.mean(brier_scores))

            logloss_val = logloss(y_eval.tolist(), proba.tolist())

            metrics = {
                "accuracy":        round(accuracy, 4),
                "brier_score":     round(brier_score, 4),
                "log_loss":        round(logloss_val, 4),
                "n_eval_samples":  len(y_eval),
            }
        else:
            metrics = {}

        log.info("Eval metrics: %s", metrics)

        # Determine version string
        if version is None:
            existing_count = session.query(ModelRegistry).filter_by(sport=_SPORT).count()
            version = f"v{existing_count + 1}"
        model_name = f"tennis_lr_{version}"

        # Save artefact
        artefact_path = ARTEFACT_DIR / f"{model_name}.joblib"
        payload = {
            "model":           calibrated,
            "feature_names":   FEATURE_NAMES,
            "outcome_labels":  OUTCOME_LABELS,
            "label_outcomes":  LABEL_OUTCOMES,
            "version":         version,
        }
        joblib.dump(payload, artefact_path)
        log.info("Artefact saved to %s", artefact_path)

        # Deactivate existing live models
        session.query(ModelRegistry).filter_by(sport=_SPORT, is_live=True).update({"is_live": False})

        # Register new model
        registry_entry = ModelRegistry(
            sport=_SPORT,
            model_name=model_name,
            version=version,
            algorithm="logistic_regression",
            artifact_path=str(artefact_path),
            feature_names=FEATURE_NAMES,
            hyperparams={"C": 1.0, "solver": "lbfgs", "calibration": "sigmoid", "cv": "prefit"},
            n_train_samples=len(y_train),
            metrics=metrics,
            is_live=True,
            trained_at=datetime.now(tz=timezone.utc),
            notes=f"Walk-forward split. Train: {len(y_train)} | Eval: {len(y_eval)}",
        )
        session.add(registry_entry)
        session.commit()
        log.info("Model registered as '%s' (is_live=True)", model_name)

        return model_name

    except Exception:
        session.rollback()
        log.exception("Training failed")
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train tennis prediction model")
    parser.add_argument("--version", help="Version string e.g. 'v2' (auto-increments if omitted)")
    args = parser.parse_args()
    model_name = train(version=args.version)
    log.info("Training complete. Live model: %s", model_name)


if __name__ == "__main__":
    main()
