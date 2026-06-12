"""
LightGuard IPS Engine – Tadhamon Smart City
Simulates firewall blocking actions for Critical/High alerts.
In production, this would call iptables or the network firewall API.
"""
import subprocess
import logging
from typing import Optional

logger = logging.getLogger("lightguard.ips")

# Track blocked IPs in memory (simulated firewall state)
_blocked_ips: set = set()

BLOCK_THRESHOLD_SEVERITIES = {"CRITICAL", "HIGH"}


def should_block(severity: str, attack_type: str) -> bool:
    """Determine if this alert warrants an automatic block."""
    if severity in BLOCK_THRESHOLD_SEVERITIES:
        return True
    # Always block ARP spoofing (MITM)
    if "arp" in attack_type.lower() or "spoof" in attack_type.lower():
        return True
    return False


def block_ip(src_ip: str, attack_type: str, severity: str) -> dict:
    """
    Block a source IP.
    Attempts real iptables if available; otherwise records simulated block.
    Returns action result dict.
    """
    if src_ip in ("unknown", "0.0.0.0", "Scenario Engine", ""):
        return {"action": "skipped", "reason": "non-routable or system IP"}

    if src_ip in _blocked_ips:
        return {"action": "already_blocked", "src_ip": src_ip}

    # Try real iptables (requires root / cap_net_admin)
    iptables_applied = False
    try:
        result = subprocess.run(
            ["iptables", "-I", "INPUT", "-s", src_ip, "-j", "DROP"],
            capture_output=True, timeout=3
        )
        if result.returncode == 0:
            iptables_applied = True
    except Exception:
        pass  # Not root or not available — use simulated block

    _blocked_ips.add(src_ip)

    method = "iptables -I INPUT -s {ip} -j DROP".format(ip=src_ip) if iptables_applied else "Simulated Firewall Rule"
    action_label = "Source IP Blocked" if iptables_applied else "Alert Raised — Inspection Active (Simulated)"

    logger.info(f"[IPS] {action_label}: {src_ip} | Attack: {attack_type} | Severity: {severity}")

    return {
        "action": "blocked",
        "src_ip": src_ip,
        "method": method,
        "label": action_label,
        "iptables_applied": iptables_applied,
    }


def is_blocked(src_ip: str) -> bool:
    return src_ip in _blocked_ips


def unblock_ip(src_ip: str) -> dict:
    """Remove a block (admin action)."""
    if src_ip not in _blocked_ips:
        return {"action": "not_blocked", "src_ip": src_ip}
    _blocked_ips.discard(src_ip)
    try:
        subprocess.run(
            ["iptables", "-D", "INPUT", "-s", src_ip, "-j", "DROP"],
            capture_output=True, timeout=3
        )
    except Exception:
        pass
    return {"action": "unblocked", "src_ip": src_ip}


def get_blocked_ips() -> list:
    return list(_blocked_ips)
