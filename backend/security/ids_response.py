"""
LightGuard IDS Response Module – Tadhamon Smart City
Logs suspicious source IPs and raises suggested response actions.
This is a detection-only (IDS) module. It does NOT block traffic.
In a production deployment, an operator would act on these recommendations
by configuring firewall rules on the managed VLAN switch.
"""
import logging
from typing import Optional

logger = logging.getLogger("lightguard.ids_response")

# Track logged IPs in memory (detection state — NOT a block list)
_flagged_ips: set = set()

ALERT_THRESHOLD_SEVERITIES = {"CRITICAL", "HIGH"}


def should_flag(severity: str, attack_type: str) -> bool:
    """Determine if this alert warrants a suggested response action."""
    if severity in ALERT_THRESHOLD_SEVERITIES:
        return True
    if "arp" in attack_type.lower() or "spoof" in attack_type.lower():
        return True
    return False


def log_suspicious_ip(src_ip: str, attack_type: str, severity: str) -> dict:
    """
    Log a suspicious source IP and generate a suggested response recommendation.
    Returns action result dict — no traffic is modified by this function.
    """
    if src_ip in ("unknown", "0.0.0.0", "Scenario Engine", ""):
        return {"action": "skipped", "reason": "non-routable or system IP"}

    if src_ip in _flagged_ips:
        return {"action": "already_flagged", "src_ip": src_ip}

    _flagged_ips.add(src_ip)

    action_label = "Suspicious Event — Logged & Under Monitoring"
    suggested = f"Investigate {src_ip} — consider isolating VLAN or applying ACL rule on managed switch"

    logger.info(
        f"[IDS Response] {action_label}: {src_ip} | "
        f"Attack: {attack_type} | Severity: {severity}"
    )

    return {
        "action": "logged",
        "src_ip": src_ip,
        "label": action_label,
        "suggested_response": suggested,
        "detection_only": True,
    }


def is_flagged(src_ip: str) -> bool:
    """Check if a source IP has been flagged by the detection engine."""
    return src_ip in _flagged_ips


def unflag_ip(src_ip: str) -> dict:
    """Remove a flag (analyst action after investigation)."""
    if src_ip not in _flagged_ips:
        return {"action": "not_flagged", "src_ip": src_ip}
    _flagged_ips.discard(src_ip)
    return {"action": "unflagged", "src_ip": src_ip}


def get_flagged_ips() -> list:
    """Return all currently flagged source IPs."""
    return list(_flagged_ips)


# ── Backward-compatible aliases (used by alert_engine.py) ──────────────────
# These allow alert_engine.py to import from this module without breaking.
should_block  = should_flag        # noqa: E221
block_ip      = log_suspicious_ip  # noqa: E221
is_blocked    = is_flagged         # noqa: E221
unblock_ip    = unflag_ip          # noqa: E221
get_blocked_ips = get_flagged_ips  # noqa: E221
