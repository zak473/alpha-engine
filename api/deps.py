"""
FastAPI dependency injection.
"""

from typing import Generator, Optional
from fastapi import Header
from sqlalchemy.orm import Session
from db.session import SessionLocal

import os

SECRET_KEY = os.environ.get("JWT_SECRET", "change-me-in-production-please")
ALGORITHM = "HS256"


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a SQLAlchemy session, closes on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Alias kept for backwards compatibility
get_session = get_db


def _decode_jwt(token: str) -> Optional[str]:
    """Decode JWT and return user_id (sub), or None on failure."""
    try:
        from jose import jwt, JWTError
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except Exception:
        return None


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_user_id: str = Header(default="user-demo"),
) -> str:
    """
    Auth: reads Bearer JWT first; falls back to X-User-Id header (dev stub).
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        user_id = _decode_jwt(token)
        if user_id:
            return user_id
    return x_user_id
