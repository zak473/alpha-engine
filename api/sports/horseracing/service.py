"""Horse racing service layer."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.sports.horseracing.schemas import (
    RaceDetail,
    RaceListItem,
    RaceListResponse,
    RunnerOut,
)
from db.models.horseracing import HorseRace, HorseRunner

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Form score calculation
# ---------------------------------------------------------------------------

_CHAR_MAP = {
    "P": 0.0,   # pulled up
    "F": 0.0,   # fell
    "U": 0.0,   # unseated
    "R": 0.0,   # refused
    "B": 0.0,   # brought down
    "0": 0.0,   # did not finish
    "-": None,  # season separator — skip
    "/": None,  # separator — skip
}

# Recency weights for last 5 runs (most recent first)
_RECENCY_WEIGHTS = [1.0, 0.8, 0.6, 0.4, 0.2]


def compute_form_score(form_str: Optional[str]) -> Optional[float]:
    """
    Parse a horse's form string and compute a 0–1 recency-weighted score.

    Form string chars: digits = finishing position, '-' = new season separator,
    'P'=pulled up, 'F'=fell, 'U'=unseated, '0'=did not finish.

    Takes last 5 runs, scores = avg of (1/position) × recency_weight (most recent first).
    Returns 0.0 if no form, None if form string is empty/None.
    """
    if not form_str:
        return None

    # Parse individual run chars from right to left (most recent = rightmost)
    runs: list[float] = []
    i = len(form_str) - 1
    while i >= 0 and len(runs) < 5:
        ch = form_str[i].upper()
        if ch in _CHAR_MAP:
            val = _CHAR_MAP[ch]
            if val is not None:
                runs.append(val)
        elif ch.isdigit():
            pos = int(ch)
            if pos == 0:
                runs.append(0.0)
            else:
                runs.append(1.0 / pos)
        i -= 1

    if not runs:
        return 0.0

    total = 0.0
    weight_sum = 0.0
    for idx, score in enumerate(runs):
        w = _RECENCY_WEIGHTS[idx] if idx < len(_RECENCY_WEIGHTS) else 0.1
        total += score * w
        weight_sum += w

    if weight_sum == 0:
        return 0.0

    raw = total / weight_sum
    return round(raw, 4)


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------

class HorseRacingService:

    def get_race_list(
        self,
        db: Session,
        *,
        date: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        course: Optional[str] = None,
        region: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> RaceListResponse:
        q = db.query(HorseRace)

        # Date filter: if `date` provided, filter to that day
        if date:
            try:
                day = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
                q = q.filter(
                    HorseRace.scheduled_at >= day,
                    HorseRace.scheduled_at < day + timedelta(days=1),
                )
            except ValueError:
                pass
        else:
            if date_from:
                try:
                    q = q.filter(HorseRace.scheduled_at >= datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc))
                except ValueError:
                    pass
            if date_to:
                try:
                    q = q.filter(HorseRace.scheduled_at <= datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc))
                except ValueError:
                    pass

        if course:
            q = q.filter(HorseRace.course.ilike(f"%{course}%"))
        if region:
            q = q.filter(HorseRace.region.ilike(f"%{region}%"))
        if status:
            q = q.filter(HorseRace.status == status)

        q = q.order_by(HorseRace.scheduled_at.asc())

        total = q.count()
        races = q.offset(offset).limit(limit).all()

        # Batch count runners per race
        race_ids = [r.id for r in races]
        runner_counts: dict[str, int] = {}
        if race_ids:
            from sqlalchemy import func
            rows = (
                db.query(HorseRunner.race_id, func.count(HorseRunner.id).label("cnt"))
                .filter(HorseRunner.race_id.in_(race_ids))
                .group_by(HorseRunner.race_id)
                .all()
            )
            runner_counts = {r.race_id: r.cnt for r in rows}

        items = []
        for race in races:
            items.append(RaceListItem(
                id=race.id,
                course=race.course,
                region=race.region,
                race_name=race.race_name,
                race_class=race.race_class,
                race_type=race.race_type,
                distance_f=race.distance_f,
                going=race.going,
                pattern=race.pattern,
                off_time=race.off_time,
                scheduled_at=race.scheduled_at,
                status=race.status,
                field_size=race.field_size,
                num_runners=runner_counts.get(race.id, 0),
            ))

        return RaceListResponse(items=items, total=total)

    def get_race_detail(self, race_id: str, db: Session) -> RaceDetail:
        race = db.get(HorseRace, race_id)
        if not race:
            raise HTTPException(status_code=404, detail="Race not found")

        runners_db = (
            db.query(HorseRunner)
            .filter(HorseRunner.race_id == race_id)
            .order_by(HorseRunner.number.asc())
            .all()
        )

        runners_out = []
        for r in runners_db:
            form_score = compute_form_score(r.form)
            runners_out.append(RunnerOut(
                horse_id=r.horse_id,
                horse_name=r.horse_name,
                number=r.number,
                draw=r.draw,
                jockey=r.jockey,
                trainer=r.trainer,
                age=r.age,
                sex=r.sex,
                colour=r.colour,
                sire=r.sire,
                dam=r.dam,
                lbs=r.lbs,
                ofr=r.ofr,
                form=r.form,
                last_run=r.last_run,
                headgear=r.headgear,
                is_non_runner=r.is_non_runner,
                position=r.position,
                sp=r.sp,
                beaten_lengths=r.beaten_lengths,
                form_score=form_score,
            ))

        return RaceDetail(
            id=race.id,
            course=race.course,
            region=race.region,
            race_name=race.race_name,
            race_class=race.race_class,
            race_type=race.race_type,
            distance_f=race.distance_f,
            going=race.going,
            surface=race.surface,
            pattern=race.pattern,
            age_band=race.age_band,
            prize=race.prize,
            field_size=race.field_size,
            off_time=race.off_time,
            scheduled_at=race.scheduled_at,
            status=race.status,
            runners=runners_out,
        )
