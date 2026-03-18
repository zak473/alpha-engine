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
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.deps import get_db
from config.settings import settings
from db.models.user import User

router = APIRouter(prefix="/auth", tags=["Auth"])

# ── Secret / JWT settings ─────────────────────────────────────────────────
SECRET_KEY = os.environ.get("JWT_SECRET", "change-me-in-production-please")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


# ── Password hashing (bcrypt directly, sha256 fallback) ───────────────────

def _hash_password(plain: str) -> str:
    try:
        import bcrypt
        return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except Exception:
        return hashlib.sha256(plain.encode()).hexdigest()


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        import bcrypt
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
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

    try:
        user = User(
            id=str(uuid.uuid4()),
            email=body.email.lower().strip(),
            password_hash=_hash_password(body.password),
            display_name=body.display_name,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered.")
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Registration error: {type(exc).__name__}: {exc}")

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


# ── Google OAuth ──────────────────────────────────────────────────────────────

_GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_INFO_URL  = "https://www.googleapis.com/oauth2/v3/userinfo"


@router.get("/google")
def google_login():
    """Redirect the browser to Google's OAuth consent screen."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth is not configured")
    redirect_uri = f"{settings.FRONTEND_URL}/api/v1/auth/google/callback"
    qs = urlencode({
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         "openid email profile",
        "state":         secrets.token_urlsafe(16),
        "access_type":   "offline",
        "prompt":        "select_account",
    })
    return RedirectResponse(url=f"{_GOOGLE_AUTH_URL}?{qs}")


@router.get("/google/callback")
def google_callback(
    code: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Handle Google OAuth callback: exchange code → get user info → issue JWT."""
    if error or not code:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error=google_cancelled")

    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth is not configured")

    redirect_uri = f"{settings.FRONTEND_URL}/api/v1/auth/google/callback"

    # Exchange authorization code for access token
    token_resp = httpx.post(_GOOGLE_TOKEN_URL, data={
        "code":          code,
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri":  redirect_uri,
        "grant_type":    "authorization_code",
    }, timeout=10)
    if not token_resp.is_success:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error=google_failed")

    access_token = token_resp.json().get("access_token")

    # Fetch Google user profile
    info_resp = httpx.get(_GOOGLE_INFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
    if not info_resp.is_success:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error=google_failed")

    g = info_resp.json()
    email       = (g.get("email") or "").lower().strip()
    google_sub  = g.get("sub", "")
    display_name = g.get("name") or g.get("given_name") or email.split("@")[0]

    if not email:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error=google_no_email")

    # Find or create the user
    user = db.query(User).filter_by(email=email).first()
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=f"!google:{google_sub}",   # sentinel — cannot be used to log in with password
            display_name=display_name,
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            db.rollback()
            user = db.query(User).filter_by(email=email).first()

    jwt = _create_token(user.id)
    qs = urlencode({
        "token":        jwt,
        "user_id":      user.id,
        "email":        user.email,
        "display_name": user.display_name or "",
    })
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/callback?{qs}")


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
