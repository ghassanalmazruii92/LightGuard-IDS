"""
Attack Pattern Detection — Feature 2
- BruteForceDetector: tracks failed login attempts per IP (TTL 60s)
- SQLiMiddleware: scans every HTTP request body for SQL injection patterns
- Router: POST /ids/report-login-failure
"""
import re
import time
from typing import Dict, Tuple

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from auth import get_current_user

router = APIRouter()

# ── Brute-Force Detector ──────────────────────────────────────────────────────

_BRUTE_TTL = 60  # seconds
_BRUTE_THRESHOLD = 5  # attempts before alert

# Dict[ip -> (attempt_count, first_attempt_timestamp)]
_attempt_cache: Dict[str, Tuple[int, float]] = {}


def record_login_failure(ip: str) -> None:
    """Called when a failed login is reported for the given IP."""
    now = time.time()

    count, first_seen = _attempt_cache.get(ip, (0, now))

    # Reset window if TTL expired
    if now - first_seen > _BRUTE_TTL:
        count = 0
        first_seen = now

    count += 1
    _attempt_cache[ip] = (count, first_seen)

    if count > _BRUTE_THRESHOLD:
        _fire_brute_force_alert(ip, count)
        # Reset after alert to avoid alert flood
        _attempt_cache[ip] = (0, now)


def _fire_brute_force_alert(ip: str, attempt_count: int) -> None:
    try:
        from backend.ids.alert_engine import create_alert
        create_alert(
            {
                "src_ip": ip,
                "dst_ip": "10.0.0.1",
                "protocol": "TCP",
                "attack_type": "BRUTE_FORCE",
                "severity": "HIGH",
                "detection_method": "Signature",
                "description": (
                    f"Brute-force detected: {attempt_count} failed login "
                    f"attempts from {ip} within {_BRUTE_TTL}s — "
                    "Tadhamon Smart City Auth Service"
                ),
                "zone": "Infrastructure",
            }
        )
    except Exception as exc:
        print(f"[attack_patterns] brute-force alert error: {exc}")


# ── SQL Injection Detector ────────────────────────────────────────────────────

_SQLI_PATTERNS = re.compile(
    r"('\s*OR\s*'1'\s*=\s*'1"          # ' OR '1'='1
    r"|;\s*DROP\s+TABLE"               # ; DROP TABLE
    r"|UNION\s+SELECT"                 # UNION SELECT
    r"|--\s"                           # -- (comment)
    r"|xp_cmdshell"                    # xp_cmdshell
    r"|'\s*OR\s*1\s*=\s*1"            # ' OR 1=1
    r"|';\s*--"                        # '; --
    r")",
    re.IGNORECASE,
)


def inspect_payload(text: str) -> bool:
    """Return True if the text contains SQL injection patterns."""
    return bool(_SQLI_PATTERNS.search(text))


def _fire_sqli_alert(src_ip: str, snippet: str) -> None:
    try:
        from backend.ids.alert_engine import create_alert
        create_alert(
            {
                "src_ip": src_ip,
                "dst_ip": "10.0.0.1",
                "protocol": "HTTP",
                "attack_type": "SQL_INJECTION",
                "severity": "CRITICAL",
                "detection_method": "Signature",
                "description": (
                    f"SQL Injection attempt detected from {src_ip}. "
                    f"Payload snippet: {snippet[:200]}"
                ),
                "zone": "Infrastructure",
            }
        )
    except Exception as exc:
        print(f"[attack_patterns] SQLi alert error: {exc}")


class SQLiMiddleware(BaseHTTPMiddleware):
    """Inspect every inbound request body for SQL injection patterns."""

    async def dispatch(self, request: Request, call_next):
        # Only inspect non-WebSocket requests with a body
        if request.method in ("POST", "PUT", "PATCH"):
            try:
                body_bytes = await request.body()
                body_text = body_bytes.decode("utf-8", errors="replace")
                if inspect_payload(body_text):
                    src_ip = request.client.host if request.client else "unknown"
                    snippet = body_text[:300]
                    _fire_sqli_alert(src_ip, snippet)
            except Exception:
                pass  # Never block the request

        response = await call_next(request)
        return response


# ── Router ────────────────────────────────────────────────────────────────────

@router.post("/ids/report-login-failure")
async def report_login_failure(
    request: Request,
    current_user=Depends(get_current_user),
):
    """
    Frontend or internal services report a failed login attempt.
    Body (optional JSON): { "ip": "x.x.x.x" }
    Falls back to the request's remote IP if not provided.
    """
    src_ip = request.client.host if request.client else "unknown"
    try:
        body = await request.json()
        src_ip = body.get("ip", src_ip)
    except Exception:
        pass

    record_login_failure(src_ip)
    return {"reported_ip": src_ip, "status": "recorded"}
