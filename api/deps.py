"""
FastAPI dependency injection.
"""

from typing import Generator
from fastapi import Header
from sqlalchemy.orm import Session
from db.session import SessionLocal


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a SQLAlchemy session, closes on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Alias kept for backwards compatibility
get_session = get_db


def get_current_user(x_user_id: str = Header(default="user-demo")) -> str:
    """
    Auth stub: reads the requesting user ID from X-User-Id header.
    Replace with real JWT/session auth when auth provider is integrated.
    """
    return x_user_id
