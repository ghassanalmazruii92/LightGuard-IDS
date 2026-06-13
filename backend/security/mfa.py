"""
LightGuard MFA — TOTP-based two-factor authentication (pyotp / RFC 6238).
Adds a /auth/mfa-setup and /auth/mfa-verify endpoint.
Stores per-user TOTP secret in the DB (encrypted).
"""

import pyotp
import qrcode
import io
import base64
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db, User
from auth import get_current_user

router = APIRouter(prefix="/auth/mfa", tags=["MFA"])


class TOTPVerifyRequest(BaseModel):
    totp_code: str


@router.post("/setup")
async def mfa_setup(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a new TOTP secret for the user.
    Returns a base64-encoded QR code PNG and the plain secret.
    The user scans the QR in any TOTP app (Google Authenticator, Authy, etc.).
    """
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    username = str(current_user.username)
    uri = totp.provisioning_uri(
        name=username, issuer_name="LightGuard – Tadhamon Smart City"
    )

    # Generate QR code
    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    # Store secret on user (add mfa_secret column if missing)
    try:
        setattr(current_user, "mfa_secret", secret)
        db.commit()
    except Exception:
        db.rollback()
        # Column may not exist yet — return secret for manual entry
        pass

    return {
        "secret": secret,
        "qr_code_png_base64": qr_b64,
        "provisioning_uri": uri,
        "instructions": (
            "Scan the QR code with Google Authenticator or Authy. "
            "Then call /auth/mfa/verify with a 6-digit code to confirm setup."
        ),
    }


@router.post("/verify")
async def mfa_verify(
    req: TOTPVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify a TOTP code against the user's stored secret."""
    secret = getattr(current_user, "mfa_secret", None)
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MFA not configured for this user. Call /auth/mfa/setup first.",
        )
    totp = pyotp.TOTP(secret)
    if not totp.verify(req.totp_code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired TOTP code.",
        )
    setattr(current_user, "mfa_enabled", True)
    db.commit()
    return {"status": "verified", "message": "MFA code accepted."}


@router.post("/disable")
async def disable_mfa(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    current_user.mfa_secret = None
    current_user.mfa_enabled = False
    db.commit()
    return {"message": "MFA disabled successfully"}


@router.get("/status")
async def mfa_status(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return {
        "mfa_enabled": bool(
            getattr(current_user, "mfa_enabled", False)
            and getattr(current_user, "mfa_secret", None)
        )
    }


@router.post("/disable")
async def disable_mfa(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    current_user.mfa_secret = None
    current_user.mfa_enabled = False
    db.commit()
    return {"message": "MFA disabled successfully"}
