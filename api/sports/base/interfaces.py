"""
Base interfaces for the multi-sport architecture.

Every sport module implements these interfaces to guarantee a uniform
contract for the API layer. The API routes are sport-agnostic — they
call service.get_match_list() and service.get_match_detail() regardless
of which sport is being served.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from sqlalchemy.orm import Session


class BaseMatchDetailBuilder(ABC):
    """
    Assembles a full match detail payload from multiple DB sources.

    Each sport implements this to compose:
        Overview, Participants, Score, Stats, Context, H2H, EloPanel, ModelPanel

    The output is a plain dict that gets serialised by the route's response_model.
    """

    @abstractmethod
    def build(self, match_id: str, db: Session) -> dict[str, Any]:
        """
        Build and return the full match detail dict for match_id.

        Raises:
            HTTPException(404) if match not found.
        """
        ...


class BaseMatchListService(ABC):
    """
    Provides paginated match lists for a single sport.
    """

    @abstractmethod
    def get_match_list(
        self,
        db: Session,
        *,
        status: str | None = None,
        league: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """
        Return {"items": [...], "total": int} for the sport's matches.
        """
        ...

    @abstractmethod
    def get_match_detail(self, match_id: str, db: Session) -> dict[str, Any]:
        """
        Return the full match detail dict for match_id.
        Delegates to a BaseMatchDetailBuilder internally.
        """
        ...
