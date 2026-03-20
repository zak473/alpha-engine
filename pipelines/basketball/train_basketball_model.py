"""
Basketball match outcome model training.

Algorithm:   LogisticRegression + CalibratedClassifierCV (Platt, prefit)
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
Output:      artefacts/basketball_lr_v{n}.joblib + model_registry row

Usage:
    python -m pipelines.basketball.train_basketball_model
    python -m pipelines.basketball.train_basketball_model --version v2
"""

from __future__ import annotations

import argparse
import bisect
import logging
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
from db.models.basketball import BasketballTeamMatchStats
from db.session import SessionLocal
from evaluation.metrics import brier, logloss
from pipelines.basketball.feature_engineering import (
    FEATURE_NAMES,
    OUTCOME_LABELS,
    LABEL_OUTCOMES,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

ARTEFACT_DIR = Path(__file__).resolve().parents[2] / "artefacts"
ARTEFACT_DIR.mkdir(exist_ok=True)

_SPORT = "basketball"
_DEFAULT_ELO = 1500.0


# ---------------------------------------------------------------------------
# Bulk data store — replaces N+1 queries with 3 bulk loads + bisect lookups
# ---------------------------------------------------------------------------

def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class BulkDataStore:
    """Pre-loads all basketball data into memory for fast in-process lookups."""

    def __init__(self, session):
        log.info("BulkDataStore: loading all basketball CoreMatch rows …")
        all_matches: list[CoreMatch] = (
            session.query(CoreMatch)
            .filter(CoreMatch.sport == _SPORT)
            .order_by(CoreMatch.kickoff_utc.asc())
            .all()
        )
        self.match_by_id: dict[str, CoreMatch] = {m.id: m for m in all_matches}
        log.info("  %d basketball matches loaded.", len(all_matches))

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

        log.info("BulkDataStore: loading BasketballTeamMatchStats …")
        stats_rows: list[BasketballTeamMatchStats] = session.query(BasketballTeamMatchStats).all()
        # match_id → {team_id: stats_row}
        self.stats_by_match: dict[str, dict[str, BasketballTeamMatchStats]] = defaultdict(dict)
        for row in stats_rows:
            self.stats_by_match[row.match_id][row.team_id] = row
        log.info("  %d BasketballTeamMatchStats rows loaded.", len(stats_rows))

    # ── lookups ──────────────────────────────────────────────────────────────

    def get_elo_before(self, team_id: str, kickoff_ts: float) -> float:
        ts_list = self.elo_ts.get(team_id)
        if not ts_list:
            return _DEFAULT_ELO
        idx = bisect.bisect_left(ts_list, kickoff_ts) - 1
        return self.elo_by_team[team_id][idx][1] if idx >= 0 else _DEFAULT_ELO

    def get_last_n(self, team_id: str, kickoff_ts: float, n: int = 10) -> list[CoreMatch]:
        ts_list = self.team_ts.get(team_id, [])
        idx = bisect.bisect_left(ts_list, kickoff_ts)
        items = self.team_matches[team_id][max(0, idx - n):idx]
        return [x[1] for x in items if x[1].status == "finished" and x[1].outcome]

    def get_stats(self, match_id: str, team_id: str) -> Optional[BasketballTeamMatchStats]:
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

    home_recent5 = store.get_last_n(home_id, kickoff_ts, 5)
    away_recent5 = store.get_last_n(away_id, kickoff_ts, 5)
    home_form_pts  = form_pts(home_recent5, home_id)
    away_form_pts  = form_pts(away_recent5, away_id)
    home_win_pct_5 = win_pct(home_recent5, home_id)
    away_win_pct_5 = win_pct(away_recent5, away_id)

    # Days rest
    def days_rest(matches: list[CoreMatch]) -> float:
        if not matches:
            return 3.0
        last_ts = _ensure_utc(matches[-1].kickoff_utc).timestamp()
        return max(0.0, (kickoff_ts - last_ts) / 86400)

    home_days_rest = days_rest(home_recent5)
    away_days_rest = days_rest(away_recent5)
    rest_diff = home_days_rest - away_days_rest

    # H2H (last 10 each side)
    home_10 = store.get_last_n(home_id, kickoff_ts, 10)
    h2h = [m for m in home_10 if m.away_team_id == away_id or m.home_team_id == away_id]
    h2h_wins = sum(
        1 for m in h2h
        if (m.outcome in ("home_win", "H") and m.home_team_id == home_id)
        or (m.outcome in ("away_win", "A") and m.away_team_id == home_id)
    )
    h2h_win_pct = h2h_wins / len(h2h) if h2h else 0.5
    h2h_n = len(h2h)

    # Rolling basketball stats (last 10)
    def rolling_stats(team_id: str) -> dict:
        recent10 = store.get_last_n(team_id, kickoff_ts, 10)
        pts_list, pts_allowed_list = [], []
        fg_pct_list, fg3_pct_list, ft_pct_list = [], [], []
        reb_list, ast_list, tov_list, stl_list, blk_list = [], [], [], [], []

        for m in recent10:
            own = store.get_stats(m.id, team_id)
            opp_id = m.away_team_id if m.home_team_id == team_id else m.home_team_id
            opp = store.get_stats(m.id, opp_id) if opp_id else None

            if own:
                if own.points is not None:          pts_list.append(float(own.points))
                if own.fg_pct is not None:          fg_pct_list.append(float(own.fg_pct))
                if own.fg3_pct is not None:         fg3_pct_list.append(float(own.fg3_pct))
                if own.ft_pct is not None:          ft_pct_list.append(float(own.ft_pct))
                if own.rebounds_total is not None:  reb_list.append(float(own.rebounds_total))
                if own.assists is not None:         ast_list.append(float(own.assists))
                if own.turnovers is not None:       tov_list.append(float(own.turnovers))
                if own.steals is not None:          stl_list.append(float(own.steals))
                if own.blocks is not None:          blk_list.append(float(own.blocks))
            else:
                is_home = m.home_team_id == team_id
                score = m.home_score if is_home else m.away_score
                if score is not None:
                    pts_list.append(float(score))

            if opp and opp.points is not None:
                pts_allowed_list.append(float(opp.points))
            else:
                is_home = m.home_team_id == team_id
                opp_score = m.away_score if is_home else m.home_score
                if opp_score is not None:
                    pts_allowed_list.append(float(opp_score))

        pts = _avg(pts_list)
        pts_allowed = _avg(pts_allowed_list)
        return {
            "pts_avg":         pts,
            "pts_allowed_avg": pts_allowed,
            "fg_pct_avg":      _avg(fg_pct_list),
            "fg3_pct_avg":     _avg(fg3_pct_list),
            "ft_pct_avg":      _avg(ft_pct_list),
            "reb_avg":         _avg(reb_list),
            "ast_avg":         _avg(ast_list),
            "tov_avg":         _avg(tov_list),
            "stl_avg":         _avg(stl_list),
            "blk_avg":         _avg(blk_list),
            "net_rating_avg":  pts - pts_allowed,
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
        "home_pts_avg":          home_b["pts_avg"],
        "away_pts_avg":          away_b["pts_avg"],
        "home_pts_allowed_avg":  home_b["pts_allowed_avg"],
        "away_pts_allowed_avg":  away_b["pts_allowed_avg"],
        "home_fg_pct_avg":       home_b["fg_pct_avg"],
        "away_fg_pct_avg":       away_b["fg_pct_avg"],
        "home_fg3_pct_avg":      home_b["fg3_pct_avg"],
        "away_fg3_pct_avg":      away_b["fg3_pct_avg"],
        "home_ft_pct_avg":       home_b["ft_pct_avg"],
        "away_ft_pct_avg":       away_b["ft_pct_avg"],
        "home_reb_avg":          home_b["reb_avg"],
        "away_reb_avg":          away_b["reb_avg"],
        "home_ast_avg":          home_b["ast_avg"],
        "away_ast_avg":          away_b["ast_avg"],
        "home_tov_avg":          home_b["tov_avg"],
        "away_tov_avg":          away_b["tov_avg"],
        "home_stl_avg":          home_b["stl_avg"],
        "away_stl_avg":          away_b["stl_avg"],
        "home_blk_avg":          home_b["blk_avg"],
        "away_blk_avg":          away_b["blk_avg"],
    }
    return [raw.get(f, 0.0) for f in FEATURE_NAMES]


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_training_data(session) -> tuple[np.ndarray, np.ndarray]:
    """
    Bulk-load all basketball data then build feature vectors in memory.
    Replaces ~12 DB queries per match with 3 bulk loads + O(log n) bisect lookups.
    """
    store = BulkDataStore(session)

    rows = [
        m for m in store.match_by_id.values()
        if m.status == "finished"
        and m.outcome is not None
        and m.outcome not in ("D", "draw")
    ]
    rows.sort(key=lambda m: _ensure_utc(m.kickoff_utc))

    if len(rows) < 10:
        raise ValueError(f"Insufficient training data: only {len(rows)} labelled rows.")

    log.info("Building feature vectors for %d finished matches …", len(rows))
    X_raw, y_raw = [], []
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
        if (i + 1) % 5000 == 0:
            log.info("  … %d / %d done", i + 1, len(rows))

    log.info("Built %d feature vectors (%d skipped).", len(X_raw), skipped)
    if len(X_raw) < 10:
        raise ValueError(f"Insufficient usable training samples: only {len(X_raw)}.")

    X = np.array(X_raw, dtype=float)
    y = np.array(y_raw, dtype=int)

    col_means = np.nanmean(X, axis=0)
    col_means = np.where(np.isnan(col_means), 0.0, col_means)
    for j in range(X.shape[1]):
        mask = np.isnan(X[:, j])
        if mask.any():
            X[mask, j] = col_means[j]

    log.info("Loaded %d training samples, %d features.", len(y), X.shape[1])
    return X, y


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(version: Optional[str] = None) -> str:
    session = SessionLocal()
    try:
        X, y = _load_training_data(session)
        n_total = len(y)

        unique, counts = np.unique(y, return_counts=True)
        log.info("Label distribution: %s", dict(zip(unique.tolist(), counts.tolist())))
        if len(unique) < 2:
            raise ValueError(f"Only one class present: {unique}. Cannot train.")

        split_idx = int(n_total * 0.8)
        X_train, X_eval = X[:split_idx], X[split_idx:]
        y_train, y_eval = y[:split_idx], y[split_idx:]
        log.info("Train: %d  |  Eval: %d", len(y_train), len(y_eval))

        base_lr = LogisticRegression(solver="lbfgs", max_iter=1000, C=1.0, random_state=42)
        pipeline = Pipeline([("scaler", StandardScaler()), ("lr", base_lr)])

        cal_split = int(len(y_train) * 0.9)
        log.info("Fitting base model on %d samples …", cal_split)
        pipeline.fit(X_train[:cal_split], y_train[:cal_split])
        log.info("Calibrating on %d samples …", len(y_train) - cal_split)
        calibrated = CalibratedClassifierCV(pipeline, method="sigmoid", cv="prefit")
        calibrated.fit(X_train[cal_split:], y_train[cal_split:])

        metrics = {}
        if len(y_eval) > 0:
            proba = calibrated.predict_proba(X_eval)
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

        log.info("Eval metrics: %s", metrics)

        if version is None:
            session.rollback()  # clear any broken tx from skipped matches
            existing_count = session.query(ModelRegistry).filter_by(sport=_SPORT).count()
            version = f"v{existing_count + 1}"
        model_name = f"basketball_lr_{version}"

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
            hyperparams={"C": 1.0, "solver": "lbfgs", "calibration": "sigmoid", "cv": "prefit"},
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
    parser = argparse.ArgumentParser(description="Train basketball prediction model")
    parser.add_argument("--version", help="Version string e.g. 'v2'")
    args = parser.parse_args()
    model_name = train(version=args.version)
    log.info("Training complete. Live model: %s", model_name)


if __name__ == "__main__":
    main()
