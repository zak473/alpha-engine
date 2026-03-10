"""
FastAPI dependency injection.
"""

import os
import logging
from typing import Generator, Optional
from fastapi import Header, HTTPException, status
from sqlalchemy.orm import Session
from db.session import SessionLocal

SECRET_KEY = os.environ.get("JWT_SECRET", "change-me-in-production-please")
ALGORITHM = "HS256"
ENV = os.environ.get("ENV", "development")

log = logging.getLogger(__name__)


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
    Auth: reads Bearer JWT first.
    - Production: JWT required; missing/invalid token → 401.
    - Development/staging: falls back to X-User-Id header (default: 'user-demo').
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        user_id = _decode_jwt(token)
        if user_id:
            return user_id
        # Token present but invalid
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # No token supplied
    if ENV == "production":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Dev/staging fallback — all unauthenticated requests share one demo user
    return x_user_id
