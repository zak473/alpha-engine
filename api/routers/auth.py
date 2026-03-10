"""
JWT auth endpoints: register + token.

Dependencies (already in container via passlib/jose):
  pip install passlib[bcrypt] python-jose[cryptography]

If those packages aren't in requirements.txt yet, the fallback
uses hashlib (sha256) so the service still starts.
"""
from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.deps import get_db
from db.models.user import User

router = APIRouter(prefix="/auth", tags=["Auth"])

# ── Secret / JWT settings ─────────────────────────────────────────────────
SECRET_KEY = os.environ.get("JWT_SECRET", "change-me-in-production-please")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


# ── Password hashing (prefer passlib, fall back to sha256) ────────────────

def _hash_password(plain: str) -> str:
    try:
        from passlib.context import CryptContext
        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return ctx.hash(plain)
    except ImportError:
        return hashlib.sha256(plain.encode()).hexdigest()


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        from passlib.context import CryptContext
        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return ctx.verify(plain, hashed)
    except ImportError:
        return hashlib.sha256(plain.encode()).hexdigest() == hashed


# ── JWT helpers (prefer python-jose, fall back to manual) ─────────────────

def _create_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    try:
        from jose import jwt
        payload = {"sub": subject, "exp": expire}
        return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    except ImportError:
        import base64, json, hmac
        header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b"=")
        body = base64.urlsafe_b64encode(
            json.dumps({"sub": subject, "exp": int(expire.timestamp())}).encode()
        ).rstrip(b"=")
        sig = base64.urlsafe_b64encode(
            hmac.new(SECRET_KEY.encode(), header + b"." + body, hashlib.sha256).digest()
        ).rstrip(b"=")
        return (header + b"." + body + b"." + sig).decode()


def _decode_token(token: str) -> Optional[str]:
    try:
        from jose import jwt, JWTError
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except Exception:
        return None


# ── Schemas ───────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


class TokenIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str]

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    user_id: str
    email: str
    display_name: Optional[str]


# ── Routes ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if not body.email or "@" not in body.email:
        raise HTTPException(status_code=400, detail="Invalid email address.")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    user = User(
        id=str(uuid.uuid4()),
        email=body.email.lower().strip(),
        password_hash=_hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered.")

    return UserOut(user_id=user.id, email=user.email, display_name=user.display_name)


@router.post("/token", response_model=TokenOut)
def get_token(body: TokenIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.lower().strip()).first()
    if not user or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = _create_token(user.id)
    return TokenOut(
        access_token=token,
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
    )


class UpdateProfileIn(BaseModel):
    display_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


@router.patch("/me", response_model=UserOut)
def update_profile(
    body: UpdateProfileIn,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Update the current user's display name and/or password."""
    from api.deps import _decode_jwt
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = _decode_jwt(authorization[7:])
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None

    if body.new_password:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="Current password required to change password")
        if not _verify_password(body.current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        if len(body.new_password) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
        user.password_hash = _hash_password(body.new_password)

    db.commit()
    db.refresh(user)
    return UserOut(user_id=user.id, email=user.email, display_name=user.display_name)
