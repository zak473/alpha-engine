"""
Baseball match outcome model training.

Algorithm:   LogisticRegression + CalibratedClassifierCV (Platt, 5-fold)
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
Output:      artefacts/baseball_lr_v{n}.joblib + model_registry row

Binary outcome only — no draw in baseball.

Usage:
    python -m pipelines.baseball.train_baseball_model
    python -m pipelines.baseball.train_baseball_model --version v2
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
from db.models.baseball import BaseballTeamMatchStats
from db.session import SessionLocal
from evaluation.metrics import brier, ece, logloss
from pipelines.baseball.feature_engineering import (
    FEATURE_NAMES,
    OUTCOME_LABELS,
    LABEL_OUTCOMES,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parents[2] / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

_SPORT = "baseball"
_DEFAULT_ELO = 1500.0


# ---------------------------------------------------------------------------
# Bulk data store — replaces N+1 queries with 3 bulk loads + bisect lookups
# ---------------------------------------------------------------------------

def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class BulkDataStore:
    """Pre-loads all baseball data into memory for fast in-process lookups."""

    def __init__(self, session):
        log.info("BulkDataStore: loading all baseball CoreMatch rows …")
        all_matches: list[CoreMatch] = (
            session.query(CoreMatch)
            .filter(CoreMatch.sport == _SPORT)
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )
        self.match_by_id: dict[str, CoreMatch] = {m.id: m for m in all_matches}
        log.info("  %d baseball matches loaded.", len(all_matches))

        # team_id → sorted list of (kickoff_ts, match)
        team_matches: dict[str, list] = defaultdict(list)
        for m in all_matches:
            ts = _ensure_utc(m.kickoff_utc).timestamp()
            if m.home_team_id:
                team_matches[m.home_team_id].append((ts, m))
            if m.away_team_id:
                team_matches[m.away_team_id].append((ts, m))
        self.team_matches = dict(team_matches)
        self.team_ts = {tid: [x[0] for x in lst] for tid, lst in self.team_matches.items()}

        log.info("BulkDataStore: loading ELO ratings …")
        elo_rows: list[RatingEloTeam] = session.query(RatingEloTeam).all()
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
        log.info("  %d ELO rows for %d teams.", len(elo_rows), len(self.elo_by_team))

        log.info("BulkDataStore: loading BaseballTeamMatchStats …")
        stats_rows: list[BaseballTeamMatchStats] = session.query(BaseballTeamMatchStats).all()
        # match_id → {team_id: stats_row}
        self.stats_by_match: dict[str, dict[str, BaseballTeamMatchStats]] = defaultdict(dict)
        for row in stats_rows:
            self.stats_by_match[row.match_id][row.team_id] = row
        log.info("  %d BaseballTeamMatchStats rows loaded.", len(stats_rows))

    # ── lookups ──────────────────────────────────────────────────────────────

    def get_elo_before(self, team_id: str, kickoff_ts: float) -> float:
        ts_list = self.elo_ts.get(team_id)
        if not ts_list:
            return _DEFAULT_ELO
        idx = bisect.bisect_left(ts_list, kickoff_ts) - 1
        return self.elo_by_team[team_id][idx][1] if idx >= 0 else _DEFAULT_ELO

    def get_last_n(self, team_id: str, kickoff_ts: float, n: int = 5) -> list[CoreMatch]:
        ts_list = self.team_ts.get(team_id, [])
        idx = bisect.bisect_left(ts_list, kickoff_ts)
        items = self.team_matches[team_id][max(0, idx - n):idx]
        return [x[1] for x in items if x[1].status == "finished" and x[1].outcome]

    def get_stats(self, match_id: str, team_id: str) -> Optional[BaseballTeamMatchStats]:
        return self.stats_by_match.get(match_id, {}).get(team_id)


# ---------------------------------------------------------------------------
# Bulk feature builder
# ---------------------------------------------------------------------------

def _avg(lst: list) -> float:
    return float(sum(lst) / len(lst)) if lst else 0.0


def _build_features_bulk(store: BulkDataStore, match: CoreMatch) -> list[float]:
    kickoff_ts = _ensure_utc(match.kickoff_utc).timestamp()
    home_id = match.home_team_id
    away_id = match.away_team_id

    # ELO
    elo_home = store.get_elo_before(home_id, kickoff_ts)
    elo_away = store.get_elo_before(away_id, kickoff_ts)
    elo_diff = elo_home - elo_away

    # Form — last 5 matches
    def form_pts(matches: list[CoreMatch], team_id: str) -> float:
        pts = 0.0
        for m in matches[-5:]:
            if m.outcome in ("home_win", "H"):
                pts += 3.0 if m.home_team_id == team_id else 0.0
            elif m.outcome in ("away_win", "A"):
                pts += 3.0 if m.away_team_id == team_id else 0.0
            elif m.outcome == "draw":
                pts += 1.0
        return pts

    def win_pct(matches: list[CoreMatch], team_id: str) -> float:
        wins = sum(
            1 for m in matches
            if (m.outcome in ("home_win", "H") and m.home_team_id == team_id)
            or (m.outcome in ("away_win", "A") and m.away_team_id == team_id)
        )
        return wins / len(matches) if matches else 0.0

    home_recent = store.get_last_n(home_id, kickoff_ts, 5)
    away_recent = store.get_last_n(away_id, kickoff_ts, 5)
    home_form_pts  = form_pts(home_recent, home_id)
    away_form_pts  = form_pts(away_recent, away_id)
    home_win_pct_5 = win_pct(home_recent, home_id)
    away_win_pct_5 = win_pct(away_recent, away_id)

    # Days rest
    def days_rest(matches: list[CoreMatch]) -> float:
        if not matches:
            return 3.0
        last_ts = _ensure_utc(matches[-1].kickoff_utc).timestamp()
        return max(0.0, (kickoff_ts - last_ts) / 86400)

    home_days_rest = days_rest(home_recent)
    away_days_rest = days_rest(away_recent)
    rest_diff = home_days_rest - away_days_rest

    # H2H
    home_10 = store.get_last_n(home_id, kickoff_ts, 10)
    h2h = [m for m in home_10 if m.away_team_id == away_id or m.home_team_id == away_id]
    h2h_wins = sum(
        1 for m in h2h
        if (m.outcome in ("home_win", "H") and m.home_team_id == home_id)
        or (m.outcome in ("away_win", "A") and m.away_team_id == home_id)
    )
    h2h_win_pct = h2h_wins / len(h2h) if h2h else 0.5
    h2h_n = len(h2h)

    # Rolling baseball stats (last 10)
    def rolling_stats(team_id: str) -> dict:
        recent10 = store.get_last_n(team_id, kickoff_ts, 10)
        runs, runs_allowed, hits = [], [], []
        era, whip, ops, k, bb, hr, lob = [], [], [], [], [], [], []

        for m in recent10:
            own = store.get_stats(m.id, team_id)
            opp_id = m.away_team_id if m.home_team_id == team_id else m.home_team_id
            opp = store.get_stats(m.id, opp_id) if opp_id else None

            if own:
                if own.runs is not None:         runs.append(float(own.runs))
                if own.hits is not None:         hits.append(float(own.hits))
                if own.era is not None:          era.append(float(own.era))
                if own.whip is not None:         whip.append(float(own.whip))
                if own.ops is not None:          ops.append(float(own.ops))
                if own.strikeouts is not None:   k.append(float(own.strikeouts))
                if own.walks is not None:        bb.append(float(own.walks))
                if own.home_runs is not None:    hr.append(float(own.home_runs))
                if own.left_on_base is not None: lob.append(float(own.left_on_base))
            elif m.home_score is not None or m.away_score is not None:
                score = m.home_score if m.home_team_id == team_id else m.away_score
                if score is not None:
                    runs.append(float(score))

            if opp and opp.runs is not None:
                runs_allowed.append(float(opp.runs))
            else:
                opp_score = m.away_score if m.home_team_id == team_id else m.home_score
                if opp_score is not None:
                    runs_allowed.append(float(opp_score))

        k_bb = [k[i] / bb[i] for i in range(min(len(k), len(bb))) if bb[i] > 0]
        return {
            "runs_avg":         _avg(runs),
            "runs_allowed_avg": _avg(runs_allowed),
            "hits_avg":         _avg(hits),
            "era_avg":          _avg(era),
            "whip_avg":         _avg(whip),
            "ops_avg":          _avg(ops),
            "k_avg":            _avg(k),
            "bb_avg":           _avg(bb),
            "k_bb_avg":         _avg(k_bb),
            "hr_avg":           _avg(hr),
            "lob_avg":          _avg(lob),
            "starter_era":      _avg(era[:5]),  # proxy for starter ERA (first 5 most recent)
        }

    home_b = rolling_stats(home_id)
    away_b = rolling_stats(away_id)

    raw = {
        "elo_home":              elo_home,
        "elo_away":              elo_away,
        "elo_diff":              elo_diff,
        "home_form_pts":         home_form_pts,
        "away_form_pts":         away_form_pts,
        "home_win_pct_5":        home_win_pct_5,
        "away_win_pct_5":        away_win_pct_5,
        "home_days_rest":        home_days_rest,
        "away_days_rest":        away_days_rest,
        "rest_diff":             rest_diff,
        "h2h_home_win_pct":      h2h_win_pct,
        "h2h_matches_played":    float(h2h_n),
        "is_home_advantage":     1.0,
        "home_runs_avg":         home_b["runs_avg"],
        "away_runs_avg":         away_b["runs_avg"],
        "home_runs_allowed_avg": home_b["runs_allowed_avg"],
        "away_runs_allowed_avg": away_b["runs_allowed_avg"],
        "home_hits_avg":         home_b["hits_avg"],
        "away_hits_avg":         away_b["hits_avg"],
        "home_era_avg":          home_b["era_avg"],
        "away_era_avg":          away_b["era_avg"],
        "home_whip_avg":         home_b["whip_avg"],
        "away_whip_avg":         away_b["whip_avg"],
        "home_ops_avg":          home_b["ops_avg"],
        "away_ops_avg":          away_b["ops_avg"],
        "home_k_avg":            home_b["k_avg"],
        "away_k_avg":            away_b["k_avg"],
        "home_bb_avg":           home_b["bb_avg"],
        "away_bb_avg":           away_b["bb_avg"],
        "home_k_bb_avg":         home_b["k_bb_avg"],
        "away_k_bb_avg":         away_b["k_bb_avg"],
        "home_hr_avg":           home_b["hr_avg"],
        "away_hr_avg":           away_b["hr_avg"],
        "home_lob_avg":          home_b["lob_avg"],
        "away_lob_avg":          away_b["lob_avg"],
        "home_starter_era":      home_b["starter_era"],
        "away_starter_era":      away_b["starter_era"],
    }
    return [raw.get(f, 0.0) for f in FEATURE_NAMES]


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_training_data(session) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    Bulk-load all baseball data then build feature vectors in memory.
    Replaces ~15 DB queries per match with 3 bulk loads + O(log n) bisect lookups.
    """
    store = BulkDataStore(session)

    rows = [
        m for m in store.match_by_id.values()
        if m.status == "finished" and m.outcome is not None
    ]
    rows.sort(key=lambda m: _ensure_utc(m.kickoff_utc))

    if len(rows) < 10:
        raise ValueError(f"Insufficient training data: only {len(rows)} labelled rows.")

    log.info("Building feature vectors for %d finished matches …", len(rows))
    X_raw, y_raw, match_ids = [], [], []
    skipped = 0
    for i, match in enumerate(rows):
        label = OUTCOME_LABELS.get(match.outcome)
        if label is None:
            skipped += 1
            continue
        try:
            vector = _build_features_bulk(store, match)
        except Exception as exc:
            log.warning("Feature error for match %s: %s — skipping", match.id[:8], exc)
            skipped += 1
            continue
        X_raw.append(vector)
        y_raw.append(label)
        match_ids.append(match.id)
        if (i + 1) % 5000 == 0:
            log.info("  … %d / %d done", i + 1, len(rows))

    log.info("Built %d feature vectors (%d skipped).", len(X_raw), skipped)

    X = np.array(X_raw, dtype=float)
    y = np.array(y_raw, dtype=int)

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
    """
    Train, evaluate, save artefact, register model.
    Returns the model name (e.g. 'baseball_lr_v1').
    """
    session = SessionLocal()
    try:
        X, y, match_ids = _load_training_data(session)
        n_total = len(y)

        # Walk-forward split: oldest 80% for train, newest 20% for eval
        split_idx = int(n_total * 0.8)
        X_train, X_eval = X[:split_idx], X[split_idx:]
        y_train, y_eval = y[:split_idx], y[split_idx:]
        log.info("Train: %d  |  Eval: %d", len(y_train), len(y_eval))

        if len(y_train) < 5:
            raise ValueError("Not enough training samples after split.")

        # Scale features to check sparsity of baseball-specific stats
        # (indices 13+ are baseball-specific rolling stats)
        BASE_FEATURE_COUNT = 13
        baseball_block = X_train[:, BASE_FEATURE_COUNT:]
        nonzero_frac = (baseball_block != 0).mean()
        if nonzero_frac < 0.1:
            # Stats are >90% zero — not yet populated; train on base features only
            log.warning(
                "Baseball stats block is %.0f%% zero — using base features only.",
                (1 - nonzero_frac) * 100,
            )
            X_train = X_train[:, :BASE_FEATURE_COUNT]
            X_eval  = X_eval[:,  :BASE_FEATURE_COUNT]

        # Regularisation: C scales inversely with dataset size.
        # With <200 samples, use aggressive regularisation to avoid overfitting.
        C_value = 0.05 if len(y_train) < 200 else 0.3 if len(y_train) < 500 else 1.0
        log.info("Using C=%.3f for %d training samples.", C_value, len(y_train))

        base_lr = LogisticRegression(
            solver="lbfgs",
            max_iter=2000,
            C=C_value,
            class_weight="balanced",
            random_state=42,
        )
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("lr", base_lr),
        ])
        cv_folds = min(3, len(y_train) // 5) if len(y_train) < 50 else min(5, len(y_train))
        calibrated = CalibratedClassifierCV(
            pipeline, method="sigmoid", cv=max(2, cv_folds)
        )
        calibrated.fit(X_train, y_train)
        log.info("Model trained and calibrated.")

        # Evaluate on held-out set
        if len(y_eval) > 0:
            proba = calibrated.predict_proba(X_eval)   # shape (n, 2): home_win, away_win
            y_pred = calibrated.predict(X_eval)

            accuracy = float((y_pred == y_eval).mean())

            # Brier score (binary) — mean across both classes
            brier_scores = []
            for cls_idx in range(2):
                y_true_bin = (y_eval == cls_idx).astype(float)
                brier_scores.append(brier(y_true_bin, proba[:, cls_idx]))
            brier_score = float(np.mean(brier_scores))

            # Log-loss
            logloss_val = logloss(y_eval.tolist(), proba.tolist())

            # ECE on home win probability (class index 0)
            ece_val = ece(proba[:, 0], (y_eval == 0).astype(float))

            metrics = {
                "accuracy":        round(accuracy, 4),
                "brier_score":     round(brier_score, 4),
                "log_loss":        round(logloss_val, 4),
                "ece":             round(ece_val, 4),
                "n_eval_samples":  len(y_eval),
            }
        else:
            metrics = {}

        log.info("Eval metrics: %s", metrics)

        # Determine version string
        if version is None:
            session.rollback()  # clear any broken tx from skipped matches
            existing_count = (
                session.query(ModelRegistry).filter_by(sport=_SPORT).count()
            )
            version = f"v{existing_count + 1}"
        model_name = f"baseball_lr_{version}"

        # Save artefact
        artefact_path = ARTEFACT_DIR / f"{model_name}.joblib"
        payload = {
            "model":          calibrated,
            "feature_names":  FEATURE_NAMES,
            "outcome_labels": OUTCOME_LABELS,
            "label_outcomes": LABEL_OUTCOMES,
            "version":        version,
        }
        joblib.dump(payload, artefact_path)
        log.info("Artefact saved to %s", artefact_path)

        # Deactivate any existing live models for baseball
        session.query(ModelRegistry).filter_by(
            sport=_SPORT, is_live=True
        ).update({"is_live": False})

        # Register new model
        registry_entry = ModelRegistry(
            sport=_SPORT,
            model_name=model_name,
            version=version,
            algorithm="logistic_regression",
            artifact_path=str(artefact_path),
            feature_names=FEATURE_NAMES,
            hyperparams={
                "C": C_value,
                "solver": "lbfgs",
                "calibration": "sigmoid",
                "class_weight": "balanced",
            },
            n_train_samples=len(y_train),
            metrics=metrics,
            is_live=True,
            trained_at=datetime.now(tz=timezone.utc),
            notes=(
                f"Walk-forward split. Train: {len(y_train)} | Eval: {len(y_eval)}. "
                "Binary outcome (no draw). Features computed live from CoreMatch."
            ),
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
    parser = argparse.ArgumentParser(description="Train baseball prediction model")
    parser.add_argument(
        "--version",
        help="Version string e.g. 'v2' (auto-increments if omitted)",
    )
    args = parser.parse_args()
    model_name = train(version=args.version)
    log.info("Training complete. Live model: %s", model_name)


if __name__ == "__main__":
    main()
