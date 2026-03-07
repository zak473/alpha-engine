"""
Unified prediction API router (MVP layer).

Endpoints:
    GET /predictions          → paginated list of predictions
    GET /matches/{match_id}   → full match detail with prediction + simulation
    GET /performance          → model performance metrics from model_registry

All endpoints serve from the pred_match, core_matches, core_teams, core_leagues,
model_registry tables using the contract schema defined in api/schemas/mvp.py.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.deps import get_db
from api.schemas.mvp import (
    FairOddsSchema,
    KeyDriverSchema,
    ModelMetaSchema,
    ModelMetricsSchema,
    ParticipantSchema,
    ParticipantsSchema,
    PerformanceResponse,
    PredictionListResponse,
    PredictionSchema,
    ProbabilitiesSchema,
    ScorelineSchema,
    SimulationSchema,
)
from db.models.mvp import CoreLeague, CoreMatch, CoreTeam, ModelRegistry, PredMatch

router = APIRouter(prefix="/predictions", tags=["predictions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_team(session: Session, team_id: str) -> CoreTeam:
    team = session.get(CoreTeam, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail=f"Team {team_id} not found")
    return team


def _get_league(session: Session, league_id: str) -> CoreLeague:
    league = session.get(CoreLeague, league_id)
    if league is None:
        # Return a placeholder rather than 404 — data integrity issue
        return CoreLeague(id=league_id, name="Unknown League")
    return league


def _build_prediction_schema(
    session: Session,
    match: CoreMatch,
    pred: PredMatch,
    registry: ModelRegistry,
) -> PredictionSchema:
    home_team = _get_team(session, match.home_team_id)
    away_team = _get_team(session, match.away_team_id)
    league = _get_league(session, match.league_id)

    # Simulation payload
    sim_data = pred.simulation or {}
    simulation = None
    if sim_data and "distribution" in sim_data:
        simulation = SimulationSchema(
            n_simulations=sim_data.get("n_simulations", 10000),
            mean_home_goals=sim_data.get("mean_home_goals", 0.0),
            mean_away_goals=sim_data.get("mean_away_goals", 0.0),
            distribution=[
                ScorelineSchema(score=entry["score"], probability=entry["probability"])
                for entry in sim_data.get("distribution", [])
            ],
        )

    # Key drivers
    drivers = [
        KeyDriverSchema(
            feature=d.get("feature", ""),
            value=d.get("value"),
            importance=d.get("importance", 0.0),
        )
        for d in (pred.key_drivers or [])
    ]

    created_at = pred.created_at
    if created_at is None:
        created_at = datetime.utcnow()

    return PredictionSchema(
        event_id=match.id,
        sport=match.sport or "soccer",
        league=league.name,
        season=match.season,
        start_time=match.kickoff_utc,
        status=match.status,
        participants=ParticipantsSchema(
            home=ParticipantSchema(id=match.home_team_id, name=home_team.name),
            away=ParticipantSchema(id=match.away_team_id, name=away_team.name),
        ),
        probabilities=ProbabilitiesSchema(
            home_win=round(pred.p_home, 4),
            draw=round(pred.p_draw, 4),
            away_win=round(pred.p_away, 4),
        ),
        fair_odds=FairOddsSchema(
            home_win=pred.fair_odds_home,
            draw=pred.fair_odds_draw,
            away_win=pred.fair_odds_away,
        ),
        confidence=pred.confidence,
        key_drivers=drivers,
        model=ModelMetaSchema(
            version=registry.model_name,
            trained_at=registry.trained_at,
        ),
        simulation=simulation,
        created_at=created_at,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _build_fixture_schema(session: Session, match: CoreMatch) -> PredictionSchema:
    """Build a prediction schema for a match that has no model prediction yet."""
    home_team = _get_team(session, match.home_team_id)
    away_team = _get_team(session, match.away_team_id)
    league = _get_league(session, match.league_id)

    return PredictionSchema(
        event_id=match.id,
        sport=match.sport or "soccer",
        league=league.name,
        season=match.season,
        start_time=match.kickoff_utc,
        status=match.status,
        participants=ParticipantsSchema(
            home=ParticipantSchema(id=match.home_team_id, name=home_team.name),
            away=ParticipantSchema(id=match.away_team_id, name=away_team.name),
        ),
        probabilities=ProbabilitiesSchema(home_win=0.333, draw=0.333, away_win=0.334),
        fair_odds=FairOddsSchema(home_win=3.0, draw=3.0, away_win=3.0),
        confidence=0,
        key_drivers=[],
        model=None,
        simulation=None,
        created_at=datetime.utcnow(),
    )


@router.get("", response_model=PredictionListResponse)
def list_predictions(
    sport: Optional[str] = Query(None, description="Filter by sport slug (e.g. 'soccer')"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    status: Optional[str] = Query(None, description="Match status filter: scheduled|finished"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_db),
):
    """
    List match predictions.

    Joins core_matches → pred_match → model_registry when a live model exists.
    Falls back to returning raw ingested fixtures (no probability scores) when
    no model has been trained yet — so the dashboard shows real matches immediately
    after the first data sync.
    """
    live_registry = session.query(ModelRegistry).filter_by(is_live=True).first()

    if live_registry is not None:
        # ── Normal path: return model predictions ─────────────────────────
        query = (
            session.query(CoreMatch, PredMatch, ModelRegistry)
            .join(PredMatch, PredMatch.match_id == CoreMatch.id)
            .join(ModelRegistry, ModelRegistry.model_name == PredMatch.model_version)
            .filter(ModelRegistry.is_live == True)
        )
        if date_from:
            query = query.filter(CoreMatch.kickoff_utc >= date_from)
        if date_to:
            query = query.filter(CoreMatch.kickoff_utc <= date_to)
        if status:
            query = query.filter(CoreMatch.status == status)

        total = query.count()
        rows = query.order_by(CoreMatch.kickoff_utc.asc()).offset(offset).limit(limit).all()
        items = [_build_prediction_schema(session, m, p, r) for m, p, r in rows]

    else:
        # ── Fallback: return raw fixtures so the dashboard isn't empty ─────
        query = session.query(CoreMatch)
        if sport:
            query = query.filter(CoreMatch.sport == sport)
        if date_from:
            query = query.filter(CoreMatch.kickoff_utc >= date_from)
        if date_to:
            query = query.filter(CoreMatch.kickoff_utc <= date_to)
        if status:
            query = query.filter(CoreMatch.status == status)
        else:
            query = query.filter(CoreMatch.kickoff_utc >= datetime.utcnow())

        total = query.count()
        rows = query.order_by(CoreMatch.kickoff_utc.asc()).offset(offset).limit(limit).all()
        items = [_build_fixture_schema(session, m) for m in rows]

    return PredictionListResponse(
        items=items,
        total=total,
        sport=sport,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/match/{match_id}", response_model=PredictionSchema)
def get_match_prediction(
    match_id: str,
    session: Session = Depends(get_db),
):
    """
    Full prediction detail for a single match.
    Returns the prediction from the most recently trained live model.
    """
    match = session.get(CoreMatch, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Match {match_id} not found")

    result = (
        session.query(PredMatch, ModelRegistry)
        .join(ModelRegistry, ModelRegistry.model_name == PredMatch.model_version)
        .filter(PredMatch.match_id == match_id, ModelRegistry.is_live == True)
        .order_by(ModelRegistry.trained_at.desc())
        .first()
    )

    if result is None:
        raise HTTPException(status_code=404, detail=f"No prediction found for match {match_id}")

    pred, registry = result
    return _build_prediction_schema(session, match, pred, registry)


@router.get("/performance", response_model=PerformanceResponse)
def get_performance(
    sport: Optional[str] = Query(None),
    session: Session = Depends(get_db),
):
    """
    Model performance metrics from the model_registry.
    Returns all registered models for the given sport (or all sports).
    """
    query = session.query(ModelRegistry)
    if sport:
        query = query.filter(ModelRegistry.sport == sport)

    models = query.order_by(ModelRegistry.trained_at.desc()).all()

    def _metric(m: ModelRegistry, key: str):
        return m.metrics.get(key) if m.metrics else None

    return PerformanceResponse(
        sport=sport,
        models=[
            ModelMetricsSchema(
                model_name=m.model_name,
                version=m.version,
                algorithm=m.algorithm,
                sport=m.sport,
                is_live=m.is_live,
                n_train_samples=m.n_train_samples,
                accuracy=_metric(m, "accuracy"),
                brier_score=_metric(m, "brier_score"),
                log_loss=_metric(m, "log_loss"),
                ece=_metric(m, "ece"),
                trained_at=m.trained_at,
                train_data_from=m.train_data_from,
                train_data_to=m.train_data_to,
                notes=m.notes,
            )
            for m in models
        ],
    )
