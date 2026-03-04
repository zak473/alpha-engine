"""
Esports-specific database models.
Designed for MOBA (LoL/Dota) and tactical shooter (CS2) formats.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base


class EsportsTitle(Base):
    """
    The game title. CS2, League of Legends, Valorant, Dota 2, etc.
    """
    __tablename__ = "esports_titles"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # "cs2", "lol", "valorant"
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    format: Mapped[str] = mapped_column(String(50), nullable=False)  # "map_based", "round_based"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class EsportsMap(Base):
    """
    Map registry for map-based games (CS2, Valorant).
    Each map gets its own ELO context.
    """
    __tablename__ = "esports_maps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # "mirage", "inferno"
    title_id: Mapped[str] = mapped_column(ForeignKey("esports_titles.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # in current map pool


class EsportsPatch(Base):
    """
    Game patch versions. Patches can significantly shift team/player performance.
    Used as a time-decay anchor — older data on different patches is down-weighted.
    """
    __tablename__ = "esports_patches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title_id: Mapped[str] = mapped_column(ForeignKey("esports_titles.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False)  # "1.12.3"
    released_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_major: Mapped[bool] = mapped_column(Boolean, default=False)   # major = hard reset weight


class EsportsMatch(Base):
    """
    Esports series/match. One row = one best-of-N series.
    Individual map results stored in EsportsMapResult.
    """
    __tablename__ = "esports_matches"

    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), primary_key=True)
    title_id: Mapped[str] = mapped_column(ForeignKey("esports_titles.id"), nullable=False)
    patch_id: Mapped[str] = mapped_column(ForeignKey("esports_patches.id"), nullable=True)

    format: Mapped[str] = mapped_column(String(20), nullable=False)   # "bo1", "bo3", "bo5"
    is_lan: Mapped[bool] = mapped_column(Boolean, default=False)      # LAN vs online

    # Series result
    team_a_maps_won: Mapped[int] = mapped_column(Integer, nullable=True)
    team_b_maps_won: Mapped[int] = mapped_column(Integer, nullable=True)

    # Veto info
    veto_json: Mapped[list] = mapped_column(JSON, default=list)  # [{action: "ban"|"pick", team: "a"|"b", map: "mirage"}]

    map_results: Mapped[list["EsportsMapResult"]] = relationship(back_populates="esports_match")


class EsportsMapResult(Base):
    """
    Result for a single map within an esports series.
    This is the atomic unit of esports prediction.
    """
    __tablename__ = "esports_map_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("esports_matches.match_id"), nullable=False)
    map_id: Mapped[str] = mapped_column(ForeignKey("esports_maps.id"), nullable=True)
    map_number: Mapped[int] = mapped_column(Integer, nullable=False)   # 1, 2, 3 in the series

    # CS2: rounds; LoL: 1 (win) or 0 (loss)
    team_a_score: Mapped[int] = mapped_column(Integer, nullable=True)
    team_b_score: Mapped[int] = mapped_column(Integer, nullable=True)
    team_a_ct_rounds: Mapped[int] = mapped_column(Integer, nullable=True)   # CT-side rounds
    team_b_ct_rounds: Mapped[int] = mapped_column(Integer, nullable=True)
    overtime_rounds: Mapped[int] = mapped_column(Integer, default=0)

    winner_team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=True)
    side_bias: Mapped[float] = mapped_column(Float, nullable=True)     # CT/T round differential

    esports_match: Mapped["EsportsMatch"] = relationship(back_populates="map_results")


class EsportsPlayerMatchStats(Base):
    """
    Individual player statistics for one map in a match.
    """
    __tablename__ = "esports_player_match_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    map_result_id: Mapped[int] = mapped_column(ForeignKey("esports_map_results.id"), nullable=False)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)

    # CS2 stats
    kills: Mapped[int] = mapped_column(Integer, nullable=True)
    deaths: Mapped[int] = mapped_column(Integer, nullable=True)
    assists: Mapped[int] = mapped_column(Integer, nullable=True)
    kd_ratio: Mapped[float] = mapped_column(Float, nullable=True)
    adr: Mapped[float] = mapped_column(Float, nullable=True)           # average damage per round
    kast_pct: Mapped[float] = mapped_column(Float, nullable=True)      # kill/assist/survived/traded
    rating_2: Mapped[float] = mapped_column(Float, nullable=True)      # HLTV 2.0 rating
    headshot_pct: Mapped[float] = mapped_column(Float, nullable=True)
    first_kills: Mapped[int] = mapped_column(Integer, nullable=True)
    first_deaths: Mapped[int] = mapped_column(Integer, nullable=True)
    clutches_won: Mapped[int] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("map_result_id", "player_id", name="uq_esports_player_map_stats"),
    )


class EsportsRosterChange(Base):
    """
    Roster change events. Used to model roster stability and uncertainty.
    A team with recent roster changes gets a reduced ELO confidence (higher uncertainty).
    """
    __tablename__ = "esports_roster_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    player_in_id: Mapped[str] = mapped_column(ForeignKey("players.id"), nullable=True)
    player_out_id: Mapped[str] = mapped_column(ForeignKey("players.id"), nullable=True)
    change_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    change_type: Mapped[str] = mapped_column(String(30), nullable=False)  # "transfer", "loan", "stand-in"
    is_major: Mapped[bool] = mapped_column(Boolean, default=False)  # star player swap = major


class EsportsTeamForm(Base):
    """
    Rolling form features for an esports team, optionally scoped to a map.
    """
    __tablename__ = "esports_team_form"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), nullable=False)
    as_of_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    map_id: Mapped[str] = mapped_column(ForeignKey("esports_maps.id"), nullable=True)  # null = all maps
    window_days: Mapped[int] = mapped_column(Integer, default=90)

    # Series-level form
    series_played: Mapped[int] = mapped_column(Integer, default=0)
    series_won: Mapped[int] = mapped_column(Integer, default=0)
    series_win_pct: Mapped[float] = mapped_column(Float, nullable=True)

    # Map-level form
    maps_played: Mapped[int] = mapped_column(Integer, default=0)
    maps_won: Mapped[int] = mapped_column(Integer, default=0)
    map_win_pct: Mapped[float] = mapped_column(Float, nullable=True)

    # CS2 specific
    avg_adr: Mapped[float] = mapped_column(Float, nullable=True)
    avg_kast: Mapped[float] = mapped_column(Float, nullable=True)
    avg_rating: Mapped[float] = mapped_column(Float, nullable=True)
    ct_win_pct: Mapped[float] = mapped_column(Float, nullable=True)
    t_win_pct: Mapped[float] = mapped_column(Float, nullable=True)

    # Momentum
    current_win_streak: Mapped[int] = mapped_column(Integer, default=0)
    current_loss_streak: Mapped[int] = mapped_column(Integer, default=0)

    # Context
    lan_win_pct: Mapped[float] = mapped_column(Float, nullable=True)
    online_win_pct: Mapped[float] = mapped_column(Float, nullable=True)
    roster_stability_score: Mapped[float] = mapped_column(Float, nullable=True)  # 0-1, 1=stable

    __table_args__ = (
        UniqueConstraint("team_id", "as_of_date", "map_id", "window_days", name="uq_esports_team_form"),
    )
