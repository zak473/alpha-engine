"""
Hockey match outcome model training.

Algorithm:   LogisticRegression + CalibratedClassifierCV (Platt, 5-fold)
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
Output:      artefacts/hockey_lr_v{n}.joblib + model_registry row

Uses BulkDataStore for O(log n) feature lookups — avoids N+1 DB queries.

Usage:
    python -m pipelines.hockey.train_hockey_model
    python -m pipelines.hockey.train_hockey_model --version v2
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
from db.models.hockey import HockeyTeamMatchStats
from db.session import SessionLocal
from evaluation.metrics import brier, logloss
from pipelines.hockey.feature_engineering import (
    FEATURE_NAMES,
    OUTCOME_LABELS,
    LABEL_OUTCOMES,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parents[2] / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

_SPORT = "hockey"
_DEFAULT_ELO = 1500.0


# ---------------------------------------------------------------------------
# Bulk data store
# ---------------------------------------------------------------------------

def _ensure_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class BulkDataStore:
    def __init__(self, session):
        log.info("BulkDataStore: loading all hockey CoreMatch rows …")
        all_matches: list[CoreMatch] = (
            session.query(CoreMatch)
            .filter(CoreMatch.sport == _SPORT)
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )
        self.match_by_id = {m.id: m for m in all_matches}
        log.info("  %d hockey matches loaded.", len(all_matches))

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
        elo_rows = session.query(RatingEloTeam).all()
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

        log.info("BulkDataStore: loading HockeyTeamMatchStats …")
        stats_rows = session.query(HockeyTeamMatchStats).all()
        self.stats_by_match: dict[str, dict[str, HockeyTeamMatchStats]] = defaultdict(dict)
        for row in stats_rows:
            self.stats_by_match[row.match_id][row.team_id] = row
        log.info("  %d HockeyTeamMatchStats rows loaded.", len(stats_rows))

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

    def get_stats(self, match_id: str, team_id: str) -> Optional[HockeyTeamMatchStats]:
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

    elo_home = store.get_elo_before(home_id, kickoff_ts)
    elo_away = store.get_elo_before(away_id, kickoff_ts)
    elo_diff = elo_home - elo_away

    def form_pts(matches: list[CoreMatch], team_id: str) -> float:
        pts = 0.0
        for m in matches[-5:]:
            if m.outcome in ("home_win", "H") and m.home_team_id == team_id:
                pts += 3.0
            elif m.outcome in ("away_win", "A") and m.away_team_id == team_id:
                pts += 3.0
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

    def days_rest(matches: list[CoreMatch]) -> float:
        if not matches:
            return 3.0
        last_ts = _ensure_utc(matches[-1].kickoff_utc).timestamp()
        return max(0.0, (kickoff_ts - last_ts) / 86400)

    home_days_rest = days_rest(home_recent)
    away_days_rest = days_rest(away_recent)
    rest_diff = home_days_rest - away_days_rest

    home_10 = store.get_last_n(home_id, kickoff_ts, 10)
    h2h = [m for m in home_10 if m.away_team_id == away_id or m.home_team_id == away_id]
    h2h_wins = sum(
        1 for m in h2h
        if (m.outcome in ("home_win", "H") and m.home_team_id == home_id)
        or (m.outcome in ("away_win", "A") and m.away_team_id == home_id)
    )
    h2h_win_pct = h2h_wins / len(h2h) if h2h else 0.5
    h2h_n = len(h2h)

    def rolling_stats(team_id: str) -> dict:
        recent10 = store.get_last_n(team_id, kickoff_ts, 10)
        goals, goals_against, shots, shots_against = [], [], [], []
        pp_pct, pk_pct, hits_list, blocks_list, fo_pct = [], [], [], [], []

        for m in recent10:
            own = store.get_stats(m.id, team_id)
            opp_id = m.away_team_id if m.home_team_id == team_id else m.home_team_id
            opp = store.get_stats(m.id, opp_id) if opp_id else None

            is_home = m.home_team_id == team_id
            if own:
                if own.goals is not None:              goals.append(float(own.goals))
                if own.shots is not None:              shots.append(float(own.shots))
                if own.power_play_pct is not None:     pp_pct.append(float(own.power_play_pct))
                if own.penalty_kill_pct is not None:   pk_pct.append(float(own.penalty_kill_pct))
                if own.hits is not None:               hits_list.append(float(own.hits))
                if own.blocked_shots is not None:      blocks_list.append(float(own.blocked_shots))
                if own.faceoff_win_pct is not None:    fo_pct.append(float(own.faceoff_win_pct))
            else:
                score = m.home_score if is_home else m.away_score
                if score is not None:
                    goals.append(float(score))

            if opp and opp.goals is not None:
                goals_against.append(float(opp.goals))
                if opp.shots is not None:
                    shots_against.append(float(opp.shots))
            else:
                opp_score = m.away_score if is_home else m.home_score
                if opp_score is not None:
                    goals_against.append(float(opp_score))

        return {
            "goals_avg":         _avg(goals),
            "goals_against_avg": _avg(goals_against),
            "shots_avg":         _avg(shots),
            "shots_against_avg": _avg(shots_against),
            "pp_pct_avg":        _avg(pp_pct),
            "pk_pct_avg":        _avg(pk_pct),
            "hits_avg":          _avg(hits_list),
            "blocks_avg":        _avg(blocks_list),
            "fo_pct_avg":        _avg(fo_pct),
        }

    home_h = rolling_stats(home_id)
    away_h = rolling_stats(away_id)

    raw = {
        "elo_home":               elo_home,
        "elo_away":               elo_away,
        "elo_diff":               elo_diff,
        "home_form_pts":          home_form_pts,
        "away_form_pts":          away_form_pts,
        "home_win_pct_5":         home_win_pct_5,
        "away_win_pct_5":         away_win_pct_5,
        "home_days_rest":         home_days_rest,
        "away_days_rest":         away_days_rest,
        "rest_diff":              rest_diff,
        "h2h_home_win_pct":       h2h_win_pct,
        "h2h_matches_played":     float(h2h_n),
        "is_home_advantage":      1.0,
        "home_goals_avg":         home_h["goals_avg"],
        "away_goals_avg":         away_h["goals_avg"],
        "home_goals_against_avg": home_h["goals_against_avg"],
        "away_goals_against_avg": away_h["goals_against_avg"],
        "home_shots_avg":         home_h["shots_avg"],
        "away_shots_avg":         away_h["shots_avg"],
        "home_shots_against_avg": home_h["shots_against_avg"],
        "away_shots_against_avg": away_h["shots_against_avg"],
        "home_pp_pct_avg":        home_h["pp_pct_avg"],
        "away_pp_pct_avg":        away_h["pp_pct_avg"],
        "home_pk_pct_avg":        home_h["pk_pct_avg"],
        "away_pk_pct_avg":        away_h["pk_pct_avg"],
        "home_hits_avg":          home_h["hits_avg"],
        "away_hits_avg":          away_h["hits_avg"],
        "home_blocks_avg":        home_h["blocks_avg"],
        "away_blocks_avg":        away_h["blocks_avg"],
        "home_fo_pct_avg":        home_h["fo_pct_avg"],
        "away_fo_pct_avg":        away_h["fo_pct_avg"],
    }
    return [raw.get(f, 0.0) for f in FEATURE_NAMES]


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_training_data(session) -> tuple[np.ndarray, np.ndarray, list[str]]:
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
        if (i + 1) % 2000 == 0:
            log.info("  … %d / %d done", i + 1, len(rows))

    log.info("Built %d feature vectors (%d skipped).", len(X_raw), skipped)

    if len(y_raw) < 10:
        raise ValueError(f"Insufficient usable training samples: only {len(y_raw)}.")

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
    session = SessionLocal()
    try:
        X, y, match_ids = _load_training_data(session)
        n_total = len(y)

        split_idx = int(n_total * 0.8)
        X_train, X_eval = X[:split_idx], X[split_idx:]
        y_train, y_eval = y[:split_idx], y[split_idx:]
        log.info("Train: %d  |  Eval: %d", len(y_train), len(y_eval))

        if len(y_train) < 5:
            raise ValueError("Not enough training samples after split.")

        base_lr = LogisticRegression(solver="lbfgs", max_iter=1000, C=1.0, random_state=42)
        pipeline = Pipeline([("scaler", StandardScaler()), ("lr", base_lr)])
        calibrated = CalibratedClassifierCV(pipeline, method="sigmoid", cv=min(5, len(y_train)))
        calibrated.fit(X_train, y_train)
        log.info("Model trained and calibrated.")

        if len(y_eval) > 0:
            proba  = calibrated.predict_proba(X_eval)
            y_pred = calibrated.predict(X_eval)
            accuracy = float((y_pred == y_eval).mean())
            brier_scores = []
            for cls_idx in range(2):
                y_true_bin = (y_eval == cls_idx).astype(float)
                brier_scores.append(brier(y_true_bin, proba[:, cls_idx]))
            metrics = {
                "accuracy":       round(accuracy, 4),
                "brier_score":    round(float(np.mean(brier_scores)), 4),
                "log_loss":       round(logloss(y_eval.tolist(), proba.tolist()), 4),
                "n_eval_samples": len(y_eval),
            }
        else:
            metrics = {}

        log.info("Eval metrics: %s", metrics)

        if version is None:
            session.rollback()
            existing_count = session.query(ModelRegistry).filter_by(sport=_SPORT).count()
            version = f"v{existing_count + 1}"
        model_name = f"hockey_lr_{version}"

        artefact_path = ARTEFACT_DIR / f"{model_name}.joblib"
        joblib.dump({
            "model":          calibrated,
            "feature_names":  FEATURE_NAMES,
            "outcome_labels": OUTCOME_LABELS,
            "label_outcomes": LABEL_OUTCOMES,
            "version":        version,
        }, artefact_path)
        log.info("Artefact saved to %s", artefact_path)

        session.query(ModelRegistry).filter_by(sport=_SPORT, is_live=True).update({"is_live": False})
        session.add(ModelRegistry(
            sport=_SPORT,
            model_name=model_name,
            version=version,
            algorithm="logistic_regression",
            artifact_path=str(artefact_path),
            feature_names=FEATURE_NAMES,
            hyperparams={"C": 1.0, "solver": "lbfgs", "calibration": "sigmoid", "cv": 5},
            n_train_samples=len(y_train),
            metrics=metrics,
            is_live=True,
            trained_at=datetime.now(tz=timezone.utc),
            notes=f"Walk-forward split. Train: {len(y_train)} | Eval: {len(y_eval)}",
        ))
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
    parser = argparse.ArgumentParser(description="Train hockey prediction model")
    parser.add_argument("--version", help="Version string e.g. 'v2'")
    args = parser.parse_args()
    model_name = train(version=args.version)
    log.info("Training complete. Live model: %s", model_name)


if __name__ == "__main__":
    main()
