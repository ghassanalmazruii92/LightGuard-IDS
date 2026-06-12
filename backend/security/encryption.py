"""
Fernet symmetric encryption for sensitive alert data at rest.
The key is loaded from LIGHTGUARD_ENCRYPTION_KEY in config/lightguard.env.
If the key is missing it is auto-generated and written back to the env file.
"""
import os
import base64
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

_fernet: "Fernet | None" = None
_ENV_FILE = Path(__file__).resolve().parents[2] / "config" / "lightguard.env"
_KEY_VAR = "LIGHTGUARD_ENCRYPTION_KEY"


def _load_or_generate_key() -> bytes:
    raw = os.environ.get(_KEY_VAR, "").strip()
    if raw:
        return raw.encode()

    # Generate a new key and persist it
    key = Fernet.generate_key()
    _write_key_to_env(key.decode())
    os.environ[_KEY_VAR] = key.decode()
    print(f"[encryption] Generated new Fernet key and saved to {_ENV_FILE}")
    return key


def _write_key_to_env(key: str) -> None:
    if not _ENV_FILE.exists():
        _ENV_FILE.write_text(f"{_KEY_VAR}={key}\n")
        return

    lines = _ENV_FILE.read_text().splitlines(keepends=True)
    updated = False
    for i, line in enumerate(lines):
        if line.startswith(f"{_KEY_VAR}="):
            lines[i] = f"{_KEY_VAR}={key}\n"
            updated = True
            break
    if not updated:
        lines.append(f"{_KEY_VAR}={key}\n")
    _ENV_FILE.write_text("".join(lines))


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = _load_or_generate_key()
        _fernet = Fernet(key)
    return _fernet


def encrypt(text: str) -> str:
    """Encrypt a plain-text string and return a base64-encoded token string."""
    if not text:
        return text
    try:
        return _get_fernet().encrypt(text.encode()).decode()
    except Exception as exc:
        print(f"[encryption] encrypt error: {exc}")
        return text


def decrypt(text: str) -> str:
    """Decrypt a Fernet token string. Returns the original text if decryption
    fails (handles legacy unencrypted rows gracefully)."""
    if not text:
        return text
    try:
        return _get_fernet().decrypt(text.encode()).decode()
    except (InvalidToken, Exception):
        # Row was stored before encryption was enabled — return as-is
        return text
