"""
Baseball match outcome model — LightGBM version.

Replaces the LogisticRegression baseline (baseball_lr_v*) with LightGBM which
handles non-linear interactions between ELO, form, park factors, and rolling
stats natively.

Binary classification: home_win (0) vs away_win (1) — baseball has no draws.

Algorithm:   LGBMClassifier (binary)
Evaluation:  Walk-forward split (train on oldest 80%, evaluate on newest 20%)
Output:      artefacts/baseball_lgb_v{n}.joblib + model_registry row

Usage:
    python -m pipelines.baseball.train_baseball_lgb
    python -m pipelines.baseball.train_baseball_lgb --version v2
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
from lightgbm import LGBMClassifier

from db.models.mvp import CoreMatch, ModelRegistry, RatingEloTeam
from db.models.baseball import BaseballTeamMatchStats
from db.session import SessionLocal
from evaluation.metrics import brier, logloss
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
# Bulk data store
# ---------------------------------------------------------------------------

def _ensure_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class BulkDataStore:
    """Pre-loads all baseball data + park factors into memory."""

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
        self.stats_by_match: dict[str, dict[str, BaseballTeamMatchStats]] = defaultdict(dict)
        for row in stats_rows:
            self.stats_by_match[row.match_id][row.team_id] = row
        log.info("  %d BaseballTeamMatchStats rows loaded.", len(stats_rows))

        # Park factors: computed from already-loaded finished matches
        log.info("BulkDataStore: computing park factors …")
        finished = [m for m in all_matches if m.status == "finished"
                    and m.home_score is not None and m.away_score is not None]
        if finished:
            total_runs = sum((m.home_score or 0) + (m.away_score or 0) for m in finished)
            league_avg = total_runs / len(finished)
            home_totals: dict[str, list[float]] = defaultdict(list)
            for m in finished:
                home_totals[m.home_team_id].append((m.home_score or 0) + (m.away_score or 0))
            self.park_factors: dict[str, float] = {}
            for tid, totals in home_totals.items():
                if len(totals) < 20:
                    self.park_factors[tid] = 1.0
                else:
                    pf = (sum(totals) / len(totals)) / league_avg if league_avg > 0 else 1.0
                    self.park_factors[tid] = max(0.7, min(1.5, pf))
            log.info("  Park factors computed for %d teams (league avg %.2f runs/game).",
                     len(self.park_factors), league_avg)
        else:
            self.park_factors = {}

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

    def get_park_factor(self, team_id: str) -> float:
        return self.park_factors.get(team_id, 1.0)


# ---------------------------------------------------------------------------
# Feature builder
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

    # Form
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

    # Park factor
    home_park_factor = store.get_park_factor(home_id)

    # Rolling baseball stats (last 10)
    def rolling_stats(team_id: str) -> dict:
        recent10 = store.get_last_n(team_id, kickoff_ts, 10)
        runs, runs_allowed, hits = [], [], []
        era, whip, ops, obp, slg, ba = [], [], [], [], [], []
        k, bb, hr, lob = [], [], [], []

        for m in recent10:
            own = store.get_stats(m.id, team_id)
            opp_id = m.away_team_id if m.home_team_id == team_id else m.home_team_id
            opp = store.get_stats(m.id, opp_id) if opp_id else None
            is_home = m.home_team_id == team_id

            if own:
                if own.runs is not None:               runs.append(float(own.runs))
                if own.hits is not None:               hits.append(float(own.hits))
                if own.era is not None:                era.append(float(own.era))
                if own.whip is not None:               whip.append(float(own.whip))
                if own.ops is not None:                ops.append(float(own.ops))
                if own.obp is not None:                obp.append(float(own.obp))
                if own.slg is not None:                slg.append(float(own.slg))
                if own.batting_avg is not None:        ba.append(float(own.batting_avg))
                if own.strikeouts_pitching is not None: k.append(float(own.strikeouts_pitching))
                if own.walks_allowed is not None:      bb.append(float(own.walks_allowed))
                if own.home_runs is not None:          hr.append(float(own.home_runs))
                if own.left_on_base is not None:       lob.append(float(own.left_on_base))
            else:
                score = m.home_score if is_home else m.away_score
                if score is not None:
                    runs.append(float(score))

            if opp and opp.runs is not None:
                runs_allowed.append(float(opp.runs))
            else:
                opp_score = m.away_score if is_home else m.home_score
                if opp_score is not None:
                    runs_allowed.append(float(opp_score))

        k_bb_vals = [k[i] / bb[i] for i in range(min(len(k), len(bb))) if bb[i] > 0]
        runs_avg         = _avg(runs)
        runs_allowed_avg = _avg(runs_allowed)
        return {
            "runs_avg":         runs_avg,
            "runs_allowed_avg": runs_allowed_avg,
            "run_diff_avg":     runs_avg - runs_allowed_avg,
            "hits_avg":         _avg(hits),
            "era_avg":          _avg(era),
            "whip_avg":         _avg(whip),
            "ops_avg":          _avg(ops),
            "obp_avg":          _avg(obp),
            "slg_avg":          _avg(slg),
            "ba_avg":           _avg(ba),
            "k_avg":            _avg(k),
            "bb_avg":           _avg(bb),
            "k_bb_avg":         _avg(k_bb_vals),
            "hr_avg":           _avg(hr),
            "lob_avg":          _avg(lob),
            "starter_era":      _avg(era[:5]),
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
        "home_park_factor":      home_park_factor,
        "home_runs_avg":         home_b["runs_avg"],
        "away_runs_avg":         away_b["runs_avg"],
        "home_runs_allowed_avg": home_b["runs_allowed_avg"],
        "away_runs_allowed_avg": away_b["runs_allowed_avg"],
        "home_run_diff_avg":     home_b["run_diff_avg"],
        "away_run_diff_avg":     away_b["run_diff_avg"],
        "home_hits_avg":         home_b["hits_avg"],
        "away_hits_avg":         away_b["hits_avg"],
        "home_era_avg":          home_b["era_avg"],
        "away_era_avg":          away_b["era_avg"],
        "home_whip_avg":         home_b["whip_avg"],
        "away_whip_avg":         away_b["whip_avg"],
        "home_ops_avg":          home_b["ops_avg"],
        "away_ops_avg":          away_b["ops_avg"],
        "home_obp_avg":          home_b["obp_avg"],
        "away_obp_avg":          away_b["obp_avg"],
        "home_slg_avg":          home_b["slg_avg"],
        "away_slg_avg":          away_b["slg_avg"],
        "home_ba_avg":           home_b["ba_avg"],
        "away_ba_avg":           away_b["ba_avg"],
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

def _load_training_data(session) -> tuple[np.ndarray, np.ndarray]:
    store = BulkDataStore(session)

    rows = [
        m for m in store.match_by_id.values()
        if m.status == "finished" and m.outcome is not None
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

        if len(y_train) < 5:
            raise ValueError("Not enough training samples after split.")

        model = LGBMClassifier(
            objective="binary",
            n_estimators=500,
            learning_rate=0.04,
            num_leaves=31,
            min_child_samples=20,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=0.2,
            random_state=42,
            verbose=-1,
        )
        model.fit(
            X_train, y_train,
            eval_set=[(X_eval, y_eval)],
            callbacks=[],
        )
        log.info("LightGBM model trained.")

        metrics = {}
        if len(y_eval) > 0:
            proba = model.predict_proba(X_eval)
            y_pred = model.predict(X_eval)
            accuracy = float((y_pred == y_eval).mean())
            brier_scores = [
                brier((y_eval == cls_idx).astype(float), proba[:, cls_idx])
                for cls_idx in range(2)
            ]
            metrics = {
                "accuracy":       round(accuracy, 4),
                "brier_score":    round(float(np.mean(brier_scores)), 4),
                "log_loss":       round(logloss(y_eval.tolist(), proba.tolist()), 4),
                "n_eval_samples": len(y_eval),
            }

            # Confidence-filtered accuracy
            max_proba = proba.max(axis=1)
            mask_50 = max_proba >= 0.50
            if mask_50.sum() > 0:
                acc_50 = float((y_pred[mask_50] == y_eval[mask_50]).mean())
                metrics["accuracy_at_50pct_conf"] = round(acc_50, 4)
                metrics["pct_matches_above_50pct"] = round(float(mask_50.mean()), 4)

            # Feature importances (top 10)
            feat_imp = sorted(
                zip(FEATURE_NAMES, model.feature_importances_),
                key=lambda x: x[1], reverse=True,
            )
            log.info("Top 10 features: %s", feat_imp[:10])

        log.info("Eval metrics: %s", metrics)

        if version is None:
            session.rollback()
            existing_count = session.query(ModelRegistry).filter_by(sport=_SPORT).count()
            version = f"v{existing_count + 1}"
        model_name = f"baseball_lgb_{version}"

        artefact_path = ARTEFACT_DIR / f"{model_name}.joblib"
        joblib.dump({
            "model":          model,
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
            algorithm="lightgbm",
            artifact_path=str(artefact_path),
            feature_names=FEATURE_NAMES,
            hyperparams={
                "objective": "binary",
                "n_estimators": 500,
                "learning_rate": 0.04,
                "num_leaves": 31,
                "min_child_samples": 20,
                "subsample": 0.8,
                "colsample_bytree": 0.8,
                "reg_alpha": 0.1,
                "reg_lambda": 0.2,
            },
            n_train_samples=len(y_train),
            metrics=metrics,
            is_live=True,
            trained_at=datetime.now(tz=timezone.utc),
            notes=(
                f"LightGBM binary. Walk-forward split. Train: {len(y_train)} | Eval: {len(y_eval)}. "
                f"Features: {len(FEATURE_NAMES)} (park factors + OBP/SLG/BA/run diff added)."
            ),
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
    parser = argparse.ArgumentParser(description="Train baseball LightGBM prediction model")
    parser.add_argument("--version", help="Version string e.g. 'v2'")
    args = parser.parse_args()
    model_name = train(version=args.version)
    log.info("Training complete. Live model: %s", model_name)


if __name__ == "__main__":
    main()
