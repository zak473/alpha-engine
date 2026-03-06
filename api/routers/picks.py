"""
Picks API — /api/v1/picks

Users track bet queue selections; this router persists them and provides
record + stats. Auto-settlement happens when match outcome is known.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.picks import TrackedPick
from db.models.mvp import CoreMatch

router = APIRouter(prefix="/picks", tags=["Picks"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PickCreate(BaseModel):
    match_id: str
    match_label: str
    sport: str
    league: Optional[str] = None
    start_time: str          # ISO 8601
    market_name: str
    selection_label: str
    odds: float
    edge: Optional[float] = None


class PickOut(BaseModel):
    id: str
    match_id: str
    match_label: str
    sport: str
    league: Optional[str]
    start_time: str
    market_name: str
    selection_label: str
    odds: float
    edge: Optional[float]
    kelly_fraction: Optional[float]
    stake_fraction: Optional[float]
    closing_odds: Optional[float]
    clv: Optional[float]
    auto_generated: bool = False
    outcome: Optional[str]   # "won" | "lost" | "void" | null
    settled_at: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}


class PicksStatsOut(BaseModel):
    total: int
    settled: int
    pending: int
    won: int
    lost: int
    void: int
    win_rate: float          # won / (won + lost), 0 if no settled
    avg_odds: float
    avg_edge: float
    roi: float               # flat-unit ROI
    avg_clv: Optional[float] = None   # mean closing line value %
    kelly_roi: Optional[float] = None  # Kelly-stake-weighted ROI


class TrackManyRequest(BaseModel):
    picks: list[PickCreate]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _pick_out(p: TrackedPick) -> PickOut:
    return PickOut(
        id=p.id,
        match_id=p.match_id,
        match_label=p.match_label,
        sport=p.sport,
        league=p.league,
        start_time=p.start_time.isoformat(),
        market_name=p.market_name,
        selection_label=p.selection_label,
        odds=p.odds,
        edge=p.edge,
        kelly_fraction=p.kelly_fraction,
        stake_fraction=p.stake_fraction,
        closing_odds=p.closing_odds,
        clv=p.clv,
        auto_generated=bool(p.auto_generated),
        outcome=p.outcome,
        settled_at=p.settled_at.isoformat() if p.settled_at else None,
        created_at=p.created_at.isoformat(),
    )


def _auto_settle(pick: TrackedPick, db: Session) -> None:
    """
    Attempt auto-settlement: if the match is finished and the selection
    matches a simple home/away/draw pattern, mark outcome.
    Only handles moneyline-style markets — other markets remain pending.
    """
    if pick.outcome is not None:
        return  # already settled

    match = db.query(CoreMatch).filter(CoreMatch.id == pick.match_id).first()
    if not match or match.status != "finished" or match.outcome is None:
        return

    label = pick.selection_label.lower()
    market = pick.market_name.lower()

    # Map selection → expected outcome
    if "moneyline" in market or "match winner" in market or "1x2" in market or "to win" in market:
        home_name = pick.match_label.split(" vs ")[0].lower() if " vs " in pick.match_label else ""
        away_name = pick.match_label.split(" vs ")[-1].lower() if " vs " in pick.match_label else ""

        is_home = label in ("home", "1") or (home_name and home_name in label)
        is_away = label in ("away", "2") or (away_name and away_name in label)
        is_draw = label in ("draw", "x")

        result = match.outcome  # "home_win" | "draw" | "away_win"
        if is_home:
            pick.outcome = "won" if result == "home_win" else "lost"
        elif is_away:
            pick.outcome = "won" if result == "away_win" else "lost"
        elif is_draw:
            pick.outcome = "won" if result == "draw" else "lost"

        if pick.outcome is not None:
            pick.settled_at = datetime.now(tz=timezone.utc)


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("", response_model=list[PickOut], status_code=201)
def track_picks(
    body: TrackManyRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Track a batch of queue selections from the bet slip."""
    created = []
    for p in body.picks:
        pick = TrackedPick(
            id=str(uuid.uuid4()),
            user_id=user_id,
            match_id=p.match_id,
            match_label=p.match_label,
            sport=p.sport,
            league=p.league,
            start_time=datetime.fromisoformat(p.start_time.replace("Z", "+00:00")),
            market_name=p.market_name,
            selection_label=p.selection_label,
            odds=p.odds,
            edge=p.edge,
        )
        _auto_settle(pick, db)
        db.add(pick)
        created.append(pick)

    db.commit()
    for p in created:
        db.refresh(p)
    return [_pick_out(p) for p in created]


@router.get("", response_model=list[PickOut])
def list_picks(
    sport: Optional[str] = Query(None),
    outcome: Optional[str] = Query(None, description="won|lost|void|pending"),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """List the user's tracked picks, newest first."""
    q = db.query(TrackedPick).filter(TrackedPick.user_id == user_id)
    if sport:
        q = q.filter(TrackedPick.sport == sport)
    if outcome == "pending":
        q = q.filter(TrackedPick.outcome.is_(None))
    elif outcome:
        q = q.filter(TrackedPick.outcome == outcome)
    picks = q.order_by(TrackedPick.created_at.desc()).offset(offset).limit(limit).all()

    # Opportunistically try to settle pending picks
    settled_any = False
    for p in picks:
        if p.outcome is None:
            before = p.outcome
            _auto_settle(p, db)
            if p.outcome != before:
                settled_any = True
    if settled_any:
        db.commit()

    return [_pick_out(p) for p in picks]


@router.get("/stats", response_model=PicksStatsOut)
def picks_stats(
    sport: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Aggregate performance stats for the user's tracked picks."""
    q = db.query(TrackedPick).filter(TrackedPick.user_id == user_id)
    if sport:
        q = q.filter(TrackedPick.sport == sport)
    picks = q.all()

    total = len(picks)
    won = sum(1 for p in picks if p.outcome == "won")
    lost = sum(1 for p in picks if p.outcome == "lost")
    void = sum(1 for p in picks if p.outcome == "void")
    pending = sum(1 for p in picks if p.outcome is None)
    settled = won + lost + void

    win_rate = round(won / (won + lost), 4) if (won + lost) > 0 else 0.0
    avg_odds = round(sum(p.odds for p in picks) / total, 3) if total else 0.0
    avg_edge = round(sum((p.edge or 0) for p in picks) / total, 2) if total else 0.0

    # Flat-unit ROI (1 unit per pick)
    units_staked = float(total)
    units_returned = sum(p.odds for p in picks if p.outcome == "won")
    roi = round((units_returned - units_staked) / units_staked, 4) if units_staked > 0 else 0.0

    # CLV: mean closing line value for settled picks that have it
    clv_picks = [p for p in picks if p.clv is not None]
    avg_clv = round(sum(p.clv for p in clv_picks) / len(clv_picks), 4) if clv_picks else None

    # Kelly-weighted ROI: weight each pick by its stake_fraction
    kelly_picks = [p for p in picks if p.stake_fraction and p.outcome in ("won", "lost")]
    if kelly_picks:
        k_staked = sum(p.stake_fraction for p in kelly_picks)
        k_returned = sum(p.stake_fraction * p.odds for p in kelly_picks if p.outcome == "won")
        kelly_roi = round((k_returned - k_staked) / k_staked, 4) if k_staked > 0 else None
    else:
        kelly_roi = None

    return PicksStatsOut(
        total=total,
        settled=settled,
        pending=pending,
        won=won,
        lost=lost,
        void=void,
        win_rate=win_rate,
        avg_odds=avg_odds,
        avg_edge=avg_edge,
        roi=roi,
        avg_clv=avg_clv,
        kelly_roi=kelly_roi,
    )


@router.delete("/{pick_id}", status_code=204)
def delete_pick(
    pick_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Remove a tracked pick."""
    pick = db.query(TrackedPick).filter(
        TrackedPick.id == pick_id,
        TrackedPick.user_id == user_id,
    ).first()
    if pick is None:
        raise HTTPException(status_code=404, detail="Pick not found")
    db.delete(pick)
    db.commit()
