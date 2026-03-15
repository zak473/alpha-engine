"""
Fetch and store tennis player profiles from Jeff Sackmann's open-source datasets.

Sources (no API key required):
  https://github.com/JeffSackmann/tennis_atp  (ATP players + match history)
  https://github.com/JeffSackmann/tennis_wta  (WTA players + match history)

What this pipeline does:
  1. Downloads atp_players.csv + wta_players.csv from GitHub raw URLs
  2. Upserts TennisPlayerProfile rows with nationality, hand, dob, height
  3. Computes career stats (titles, grand slams, W/L) from CoreMatch history in DB
  4. Links profiles to CoreTeam records by normalized name matching

Usage:
    docker compose exec api python -m pipelines.tennis.fetch_player_profiles
    docker compose exec api python -m pipelines.tennis.fetch_player_profiles --dry-run
"""
from __future__ import annotations

import argparse
import csv
import io
import logging
import os
import re
import unicodedata
from datetime import date, datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

ATP_PLAYERS_URL = "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_players.csv"
WTA_PLAYERS_URL = "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_players.csv"

# api-tennis.com base URL for player lookups
API_TENNIS_BASE = "https://api.api-tennis.com/tennis/"

# Sackmann hand codes → readable
_HAND_MAP = {"R": "Right-handed", "L": "Left-handed", "U": None, "A": None}


def _normalize(name: str) -> str:
    """Lowercase, strip accents, remove non-alpha characters for fuzzy matching."""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z]", "", ascii_name.lower())


def _norm_full(first: str, last: str) -> str:
    """Canonical form: lastnorm_firstnorm (e.g. djokovic_novak)."""
    return f"{_normalize(last)}_{_normalize(first)}"


def _parse_dob(dob_str: str) -> Optional[datetime]:
    """Parse YYYYMMDD string to datetime."""
    if not dob_str or len(dob_str) != 8:
        return None
    try:
        return datetime(int(dob_str[:4]), int(dob_str[4:6]), int(dob_str[6:8]))
    except ValueError:
        return None


def _fetch_csv(url: str) -> list[dict]:
    """Download a CSV file and return as list of dicts."""
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    resp.raise_for_status()
    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)


def _compute_career_stats(session: Session, player_id: str) -> dict:
    """Compute career W/L, titles, grand slams from CoreMatch + TennisMatch history."""
    from db.models.mvp import CoreMatch
    from db.models.tennis import TennisMatch

    matches = (
        session.query(CoreMatch)
        .filter(
            CoreMatch.sport == "tennis",
            CoreMatch.status == "finished",
            (CoreMatch.home_team_id == player_id) | (CoreMatch.away_team_id == player_id),
        )
        .all()
    )

    wins = losses = 0
    titles = grand_slams = 0
    year_start = datetime(date.today().year, 1, 1)
    season_wins = season_losses = 0

    for m in matches:
        is_home = m.home_team_id == player_id
        won = (is_home and m.outcome in ("H", "home_win")) or \
              (not is_home and m.outcome in ("A", "away_win"))
        if won:
            wins += 1
        else:
            losses += 1

        # Season stats
        if m.kickoff_utc and m.kickoff_utc.replace(tzinfo=None) >= year_start:
            if won:
                season_wins += 1
            else:
                season_losses += 1

        # Title / grand slam (round_name = "F" = final)
        if won:
            tm = session.get(TennisMatch, m.id)
            if tm and tm.round_name and tm.round_name.upper() in ("F", "FINAL"):
                titles += 1
                if tm.tournament_level == "grand_slam":
                    grand_slams += 1

    total = wins + losses
    return {
        "career_wins": wins,
        "career_losses": losses,
        "career_win_pct": round(wins / total, 3) if total > 0 else None,
        "career_titles": titles,
        "career_grand_slams": grand_slams,
        "season_wins": season_wins,
        "season_losses": season_losses,
    }


def _fetch_api_tennis_player(player_key: str) -> Optional[dict]:
    """Fetch player info from api-tennis.com get_players endpoint."""
    from config.settings import settings
    api_key = getattr(settings, "TENNIS_LIVE_API_KEY", None)
    if not api_key:
        return None
    try:
        resp = httpx.get(
            API_TENNIS_BASE,
            params={"method": "get_players", "APIkey": api_key, "player_key": player_key},
            timeout=10,
        )
        data = resp.json()
        if data.get("success") == 1 and data.get("result"):
            return data["result"][0]
    except Exception as exc:
        log.debug("api-tennis get_players(%s) failed: %s", player_key, exc)
    return None


def run(dry_run: bool = False) -> int:
    """Download player profiles and upsert into TennisPlayerProfile table."""
    from db.models.mvp import CoreTeam
    from db.models.tennis import TennisPlayerProfile

    dsn = os.environ.get("POSTGRES_DSN", "postgresql://postgres:postgres@postgres:5432/alpha_engine")
    engine = create_engine(dsn)

    # Download both CSVs
    all_players: list[dict] = []
    for url, tour in [(ATP_PLAYERS_URL, "atp"), (WTA_PLAYERS_URL, "wta")]:
        try:
            rows = _fetch_csv(url)
            for r in rows:
                r["_tour"] = tour
            all_players.extend(rows)
            log.info("Fetched %d %s players from Sackmann dataset", len(rows), tour.upper())
        except Exception as exc:
            log.warning("Failed to fetch %s players: %s", tour.upper(), exc)

    if not all_players:
        log.error("No player data fetched")
        return 0

    upserted = linked = 0

    with Session(engine) as session:
        # Pre-load ALL existing profiles into memory (avoids one query per player)
        existing_profiles_by_norm: dict[str, TennisPlayerProfile] = {}
        existing_profiles_by_atpid: dict[str, TennisPlayerProfile] = {}
        existing_profiles_by_playerid: dict[str, TennisPlayerProfile] = {}
        for p in session.query(TennisPlayerProfile).all():
            if p.name_normalized:
                existing_profiles_by_norm[p.name_normalized] = p
            if p.atp_id:
                existing_profiles_by_atpid[p.atp_id] = p
            if p.player_id:
                existing_profiles_by_playerid[p.player_id] = p

        # Build a name→CoreTeam.id index for fast matching
        teams = session.query(CoreTeam).filter(
            CoreTeam.provider_id.like("apitns-player-%")
        ).all()
        team_by_norm: dict[str, str] = {}
        team_by_lastname: dict[str, list[str]] = {}
        for t in teams:
            parts = t.name.strip().split()
            if len(parts) >= 2:
                first, last = parts[0], parts[-1]
                team_by_norm[f"{_normalize(last)}_{_normalize(first)}"] = t.id
                team_by_norm[f"{_normalize(first)}_{_normalize(last)}"] = t.id
                # "D. Medvedev" — index by last name only for abbreviated names
                if len(first.rstrip(".")) <= 2:
                    ln = _normalize(last)
                    team_by_lastname.setdefault(ln, []).append(t.id)
            team_by_norm[_normalize(t.name)] = t.id

        for row in all_players:
            name_first = (row.get("name_first") or "").strip()
            name_last = (row.get("name_last") or "").strip()
            if not name_first or not name_last:
                continue

            atp_id = str(row.get("player_id") or "").strip()
            hand_raw = (row.get("hand") or "").strip().upper()
            hand = _HAND_MAP.get(hand_raw)
            dob = _parse_dob((row.get("dob") or "").strip())
            height_raw = (row.get("height") or "").strip()
            height_cm = int(height_raw) if height_raw.isdigit() else None
            nationality = (row.get("country_code") or "").strip().upper() or None

            name_norm = _norm_full(name_first, name_last)

            # In-memory lookups — no per-row DB queries
            prof = existing_profiles_by_norm.get(name_norm)
            if prof is None and atp_id:
                prof = existing_profiles_by_atpid.get(atp_id)

            if prof is None:
                prof = TennisPlayerProfile(
                    atp_id=atp_id,
                    name_first=name_first,
                    name_last=name_last,
                    name_normalized=name_norm,
                )
                session.add(prof)
                if name_norm:
                    existing_profiles_by_norm[name_norm] = prof
                if atp_id:
                    existing_profiles_by_atpid[atp_id] = prof

            prof.atp_id = atp_id
            prof.name_first = name_first
            prof.name_last = name_last
            prof.name_normalized = name_norm
            prof.nationality = nationality
            if hand:
                prof.hand = hand
            if dob:
                prof.dob = dob
            if height_cm:
                prof.height_cm = height_cm

            # Link to CoreTeam if not already linked (in-memory check)
            if prof.player_id is None:
                matched_id = (
                    team_by_norm.get(name_norm) or
                    team_by_norm.get(f"{_normalize(name_last)}_{_normalize(name_first)}") or
                    team_by_norm.get(_normalize(f"{name_first} {name_last}"))
                )
                if matched_id is None:
                    ln = _normalize(name_last)
                    candidates = team_by_lastname.get(ln, [])
                    if len(candidates) == 1:
                        matched_id = candidates[0]
                if matched_id and matched_id not in existing_profiles_by_playerid:
                    prof.player_id = matched_id
                    existing_profiles_by_playerid[matched_id] = prof
                    linked += 1

            upserted += 1

        if not dry_run:
            session.flush()
            log.info("Flushed %d profiles (%d linked to CoreTeam). Computing career stats...", upserted, linked)

            # Second pass: compute career stats for linked profiles
            linked_profiles = session.query(TennisPlayerProfile).filter(
                TennisPlayerProfile.player_id.isnot(None)
            ).all()
            for prof in linked_profiles:
                stats = _compute_career_stats(session, prof.player_id)
                prof.career_wins = stats["career_wins"]
                prof.career_losses = stats["career_losses"]
                prof.career_win_pct = stats["career_win_pct"]
                prof.career_titles = stats["career_titles"]
                prof.career_grand_slams = stats["career_grand_slams"]
                prof.season_wins = stats["season_wins"]
                prof.season_losses = stats["season_losses"]

            session.commit()
            log.info("fetch_player_profiles: upserted %d, linked %d, career stats updated for %d.",
                     upserted, linked, len(linked_profiles))

            # Third pass: sync ranking + logo from api-tennis.com for all apitns- linked players
            log.info("Syncing rankings from api-tennis.com...")
            ranking_updated = 0
            apitns_teams = session.query(CoreTeam).filter(
                CoreTeam.provider_id.like("apitns-player-%")
            ).all()
            for team in apitns_teams:
                player_key = team.provider_id.split("apitns-player-")[-1]
                if not player_key.isdigit():
                    continue
                api_data = _fetch_api_tennis_player(player_key)
                if not api_data:
                    continue

                # Store logo_url on CoreTeam
                logo = api_data.get("player_logo")
                if logo and not team.logo_url:
                    team.logo_url = logo

                # Find latest season stats for ranking/titles
                stats_list = api_data.get("stats") or []
                singles_stats = [s for s in stats_list if s.get("type") == "singles"]
                if singles_stats:
                    # Most recent season first
                    latest = sorted(singles_stats, key=lambda s: s.get("season", "0"), reverse=True)[0]
                    rank_raw = latest.get("rank")
                    rank_val = int(rank_raw) if str(rank_raw or "").isdigit() else None

                    # Update or create profile entry
                    prof = session.query(TennisPlayerProfile).filter_by(player_id=team.id).first()
                    if prof is None:
                        prof = TennisPlayerProfile(player_id=team.id, player_name=team.name)
                        session.add(prof)
                    if rank_val is not None:
                        prof.ranking = rank_val
                    if logo:
                        prof.logo_url = logo
                    # Populate season W/L if not already populated
                    won = latest.get("matches_won")
                    lost = latest.get("matches_lost")
                    if str(won or "").isdigit():
                        prof.season_wins = int(won)
                    if str(lost or "").isdigit():
                        prof.season_losses = int(lost)
                    ranking_updated += 1

                import time as _time
                _time.sleep(0.3)  # be kind to the API

            session.commit()
            log.info("Rankings synced for %d players.", ranking_updated)
        else:
            log.info("[dry-run] Would upsert %d profiles, link %d", upserted, linked)

    return upserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch tennis player profiles from Jeff Sackmann dataset")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    n = run(dry_run=args.dry_run)
    print(f"Processed {n} player profiles.")


if __name__ == "__main__":
    main()
