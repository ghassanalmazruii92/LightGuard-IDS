"""
LightGuard Authentication Router — Tadhamon Smart City
Handles: /auth/login  /auth/login/mfa-verify  /auth/refresh
MFA Flow (RFC 6238 / TOTP via pyotp):
  Step 1 → POST /auth/login        → if mfa_enabled: returns mfa_required=true + temp_token
  Step 2 → POST /auth/login/verify → validates TOTP, returns full access_token
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from pydantic import BaseModel
from typing import Optional
import os

from database import get_db, User, UserRole
from auth import (
    authenticate_user, create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES, get_password_hash
)

router = APIRouter()


class MFAVerifyRequest(BaseModel):
    temp_token: str
    totp_code: str


# ─── helpers ──────────────────────────────────────────────────────────────────
def _user_has_mfa(user: User) -> bool:
    """Return True only after TOTP setup has been confirmed."""
    return bool(getattr(user, "mfa_enabled", False) and getattr(user, "mfa_secret", None))


def _verify_totp(user: User, code: str) -> bool:
    """Verify a 6-digit TOTP code against the user's stored secret."""
    try:
        import pyotp
        totp = pyotp.TOTP(user.mfa_secret)
        return totp.verify(code, valid_window=1)
    except Exception:
        return False


# ─── POST /auth/login ──────────────────────────────────────────────────────────
@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Step 1 of authentication.
    - If user has NO MFA secret configured → returns full access_token immediately.
    - If user HAS MFA configured → returns mfa_required=True + a short-lived
      temp_token (15-min, scope=mfa_pending) that CANNOT access protected routes.
    """
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if _user_has_mfa(user):
        # Issue a limited-scope temporary token — NOT usable for API calls
        temp_token = create_access_token(
            data={
                "sub": user.username,
                "role": user.role.value,
                "scope": "mfa_pending"          # admin_required() blocks this scope
            },
            expires_delta=timedelta(minutes=15)
        )
        return {
            "mfa_required": True,
            "temp_token": temp_token,
            "message": "MFA configured — submit your 6-digit TOTP code to /auth/login/verify"
        }

    # No MFA — issue full token
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role.value},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role.value,
        "mfa_required": False
    }


# ─── POST /auth/login/verify ───────────────────────────────────────────────────
@router.post("/login/verify")
async def login_mfa_verify(
    req: MFAVerifyRequest,
    db: Session = Depends(get_db)
):
    """
    Step 2 of MFA authentication.
    Accepts the temp_token from /auth/login and a 6-digit TOTP code.
    Returns a full access_token on success.
    """
    from jose import JWTError, jwt
    SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key-change-this-for-production")
    ALGORITHM = "HS256"

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired temporary token",
    )
    try:
        payload = jwt.decode(req.temp_token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        scope: str = payload.get("scope", "")
        if username is None or scope != "mfa_pending":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise credentials_exception

    if not _verify_totp(user, req.totp_code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired TOTP code — try again",
        )

    # TOTP verified — issue full access token
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role.value},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role.value,
        "mfa_verified": True
    }
