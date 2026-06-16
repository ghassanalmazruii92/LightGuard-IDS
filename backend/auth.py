"""
LightGuard Authentication Core — Tadhamon Smart City
JWT (HS256) + pbkdf2_sha256 password hashing + RBAC enforcement.
MFA scope-blocking: tokens with scope=mfa_pending are rejected by admin_required().
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv

from database import get_db, User, UserRole

load_dotenv(dotenv_path="config/lightguard.env")

SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key-change-this-for-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(db: Session, username: str, password: str):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_user_from_token(token: str, db: Session) -> User:
    """Decode a bearer token for REST dependencies and WebSocket handshakes."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        scope: str = payload.get("scope", "")
        if username is None:
            raise credentials_exception
        if scope == "mfa_pending":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="MFA verification required — submit TOTP code to /auth/login/verify",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Decode JWT and return the User object.
    Blocks tokens with scope=mfa_pending — these are temp tokens issued
    during MFA step 1 and cannot be used for authenticated API calls.
    """
    return get_user_from_token(token, db)


def admin_required(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency — enforces SOC Admin role.
    MFA-pending tokens are already blocked by get_current_user().
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted for this role"
        )
    return current_user


def analyst_required(current_user: User = Depends(get_current_user)) -> User:
    """Allow SOC Admin and SOC Analyst actions."""
    if current_user.role not in (UserRole.ADMIN, UserRole.ANALYST):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted for this role"
        )
    return current_user


def monitor_required(current_user: User = Depends(get_current_user)) -> User:
    """Allow SOC Admin, SOC Analyst, and Monitoring Staff — read-only access."""
    if current_user.role not in (UserRole.ADMIN, UserRole.ANALYST, UserRole.MONITOR):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted for this role"
        )
    return current_user


def technical_required(current_user: User = Depends(get_current_user)) -> User:
    """Allow SOC Admin and Technical Staff configuration actions."""
    if current_user.role not in (UserRole.ADMIN, UserRole.TECHNICAL):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted for this role"
        )
    return current_user
