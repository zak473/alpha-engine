"""
Horse racing live data pipeline.

Fetches today's racecards from theracingapi.com using HTTP Basic Auth.
Upserts HorseRace + HorseRunner rows. Also marks stale scheduled races as finished.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from config.settings import settings
from db.session import SessionLocal
from db.models.horseracing import HorseRace, HorseRunner

log = logging.getLogger(__name__)

RACING_API_BASE = "https://api.theracingapi.com"


def _parse_int(v: str | None) -> Optional[int]:
    if not v:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _parse_float(v: str | None) -> Optional[float]:
    if not v:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _parse_scheduled_at(off_dt: str | None) -> Optional[datetime]:
    """Parse ISO datetime string from API (e.g. '2026-03-15T12:58:00+00:00')."""
    if not off_dt:
        return None
    try:
        dt = datetime.fromisoformat(off_dt)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _current_season() -> str:
    now = datetime.now(timezone.utc)
    return str(now.year)


def fetch_racecards(dry_run: bool = False) -> list[dict]:
    """Fetch today's free racecards from theracingapi.com."""
    if not settings.RACING_API_USERNAME or not settings.RACING_API_PASSWORD:
        log.warning("[horseracing] RACING_API_USERNAME/PASSWORD not set — skipping fetch.")
        return []

    auth = (settings.RACING_API_USERNAME, settings.RACING_API_PASSWORD)
    url = f"{RACING_API_BASE}/v1/racecards/free"

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(url, auth=auth)
            resp.raise_for_status()
            data = resp.json()
            races = data if isinstance(data, list) else data.get("racecards", data.get("races", []))
            log.info("[horseracing] Fetched %d races from API.", len(races))
            return races
    except httpx.HTTPStatusError as exc:
        log.error("[horseracing] HTTP error fetching racecards: %s", exc)
        return []
    except Exception as exc:
        log.error("[horseracing] Failed to fetch racecards: %s", exc)
        return []


def upsert_race(db, race_data: dict) -> int:
    """Upsert one race and its runners. Returns number of runners upserted."""
    race_id = race_data.get("race_id")
    if not race_id:
        return 0

    scheduled_at = _parse_scheduled_at(race_data.get("off_dt"))

    existing = db.get(HorseRace, race_id)
    if existing:
        existing.course = race_data.get("course", existing.course)
        existing.region = race_data.get("region")
        existing.race_name = race_data.get("race_name", existing.race_name)
        existing.race_class = race_data.get("race_class")
        existing.race_type = race_data.get("type")
        existing.distance_f = _parse_float(race_data.get("distance_f"))
        existing.going = race_data.get("going")
        existing.surface = race_data.get("surface")
        existing.pattern = race_data.get("pattern")
        existing.age_band = race_data.get("age_band")
        existing.rating_band = race_data.get("rating_band")
        existing.sex_restriction = race_data.get("sex_restriction")
        existing.prize = race_data.get("prize")
        existing.field_size = _parse_int(race_data.get("field_size"))
        existing.off_time = race_data.get("off_time")
        if scheduled_at:
            existing.scheduled_at = scheduled_at
    else:
        race = HorseRace(
            id=race_id,
            course=race_data.get("course", ""),
            region=race_data.get("region"),
            race_name=race_data.get("race_name", ""),
            race_class=race_data.get("race_class"),
            race_type=race_data.get("type"),
            distance_f=_parse_float(race_data.get("distance_f")),
            going=race_data.get("going"),
            surface=race_data.get("surface"),
            pattern=race_data.get("pattern"),
            age_band=race_data.get("age_band"),
            rating_band=race_data.get("rating_band"),
            sex_restriction=race_data.get("sex_restriction"),
            prize=race_data.get("prize"),
            field_size=_parse_int(race_data.get("field_size")),
            off_time=race_data.get("off_time"),
            scheduled_at=scheduled_at,
            status="scheduled",
            season=_current_season(),
        )
        db.add(race)

    runners_data = race_data.get("runners", [])
    runners_upserted = 0
    for runner_data in runners_data:
        horse_id = runner_data.get("horse_id")
        if not horse_id:
            continue
        runner_pk = f"{race_id}_{horse_id}"
        existing_runner = db.get(HorseRunner, runner_pk)
        if existing_runner:
            existing_runner.horse_name = runner_data.get("horse", existing_runner.horse_name)
            existing_runner.number = _parse_int(runner_data.get("number"))
            existing_runner.draw = _parse_int(runner_data.get("draw"))
            existing_runner.jockey = runner_data.get("jockey")
            existing_runner.jockey_id = runner_data.get("jockey_id")
            existing_runner.trainer = runner_data.get("trainer")
            existing_runner.trainer_id = runner_data.get("trainer_id")
            existing_runner.age = _parse_int(runner_data.get("age"))
            existing_runner.sex = runner_data.get("sex")
            existing_runner.colour = runner_data.get("colour")
            existing_runner.sire = runner_data.get("sire")
            existing_runner.dam = runner_data.get("dam")
            existing_runner.lbs = _parse_int(runner_data.get("lbs"))
            existing_runner.ofr = runner_data.get("ofr")
            existing_runner.form = runner_data.get("form")
            existing_runner.last_run = runner_data.get("last_run")
            existing_runner.headgear = runner_data.get("headgear")
        else:
            runner = HorseRunner(
                id=runner_pk,
                race_id=race_id,
                horse_name=runner_data.get("horse", ""),
                horse_id=horse_id,
                number=_parse_int(runner_data.get("number")),
                draw=_parse_int(runner_data.get("draw")),
                jockey=runner_data.get("jockey"),
                jockey_id=runner_data.get("jockey_id"),
                trainer=runner_data.get("trainer"),
                trainer_id=runner_data.get("trainer_id"),
                age=_parse_int(runner_data.get("age")),
                sex=runner_data.get("sex"),
                colour=runner_data.get("colour"),
                sire=runner_data.get("sire"),
                dam=runner_data.get("dam"),
                lbs=_parse_int(runner_data.get("lbs")),
                ofr=runner_data.get("ofr"),
                form=runner_data.get("form"),
                last_run=runner_data.get("last_run"),
                headgear=runner_data.get("headgear"),
                is_non_runner=False,
            )
            db.add(runner)
        runners_upserted += 1

    return runners_upserted


def mark_stale_races_finished(db) -> int:
    """Mark scheduled races whose scheduled_at is >3h in the past as finished."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=3)
    updated = (
        db.query(HorseRace)
        .filter(
            HorseRace.status == "scheduled",
            HorseRace.scheduled_at < cutoff,
        )
        .update({"status": "finished"}, synchronize_session=False)
    )
    return updated


def fetch_all(dry_run: bool = False) -> int:
    """
    Main entry point. Fetches today's racecards and upserts to DB.
    Returns number of races ingested.
    """
    races_data = fetch_racecards(dry_run=dry_run)
    if not races_data:
        return 0

    if dry_run:
        log.info("[horseracing] dry_run=True — fetched %d races, not saving.", len(races_data))
        return len(races_data)

    db = SessionLocal()
    races_ingested = 0
    try:
        # Mark stale races finished first
        stale = mark_stale_races_finished(db)
        if stale:
            log.info("[horseracing] Marked %d stale races as finished.", stale)

        for race_data in races_data:
            try:
                upsert_race(db, race_data)
                races_ingested += 1
            except Exception as exc:
                log.warning("[horseracing] Failed to upsert race %s: %s", race_data.get("race_id"), exc)
                db.rollback()
                continue

        db.commit()
        log.info("[horseracing] Ingested %d races.", races_ingested)
    except Exception as exc:
        db.rollback()
        log.error("[horseracing] fetch_all failed: %s", exc, exc_info=True)
    finally:
        db.close()

    return races_ingested


if __name__ == "__main__":
    import logging as _logging
    _logging.basicConfig(level=_logging.INFO)
    n = fetch_all()
    print(f"Ingested {n} races.")
