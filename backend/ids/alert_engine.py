import time
from datetime import datetime
from typing import Dict, Any, Optional, List
import json
from scapy.all import IP, TCP, UDP, ICMP
import sys
import os

from database import SessionLocal, Alert, Event, Severity, UserRole, FirewallRule
try:
    from security.ids_response import should_flag, log_suspicious_ip, is_flagged
    should_block = should_flag; block_ip = log_suspicious_ip; is_blocked = is_flagged
except ImportError:
    try:
        from backend.security.ids_response import should_flag, log_suspicious_ip, is_flagged
        should_block = should_flag; block_ip = log_suspicious_ip; is_blocked = is_flagged
    except ImportError:
        # Fallback if ips_engine not available
        def should_block(severity, attack_type): return False
        def block_ip(src_ip, attack_type, severity): return {"action": "skipped"}
        def is_blocked(src_ip): return False

# Cache for deduplication: same src_ip + attack_type within 10 seconds = 1 alert
alert_cache: Dict[str, float] = {}
DEDUPLICATION_WINDOW = 10.0  # seconds

# Global reference for broadcasting alerts via WebSocket
alert_broadcast_callback = None
main_event_loop = None

def evaluate_firewall(src_zone: str, dst_zone: str, protocol: str, port) -> str:
    """
    Check enabled firewall rules (ordered by priority) and return 'allow' or 'deny'.
    Wildcards (*) match any value.
    """
    if not src_zone and not dst_zone:
        return "allow"
    db = SessionLocal()
    try:
        rules = (
            db.query(FirewallRule)
            .filter(FirewallRule.enabled == True)  # noqa: E712
            .order_by(FirewallRule.priority)
            .all()
        )
        for rule in rules:
            src_match  = rule.src_zone in ("*", src_zone or "")
            dst_match  = rule.dst_zone in ("*", dst_zone or "")
            proto_match = rule.protocol in ("*", protocol or "")
            port_match  = rule.port is None or rule.port == port
            if src_match and dst_match and proto_match and port_match:
                return rule.action  # "allow" | "deny"
    except Exception:
        pass
    finally:
        db.close()
    return "allow"


def set_alert_broadcast_callback(callback, loop=None):
    global alert_broadcast_callback, main_event_loop
    alert_broadcast_callback = callback
    main_event_loop = loop

def process_packet(packet: Any, features: Dict[str, Any]):
    """
    Called for every captured packet. Runs anomaly detection.
    """
    from .detection_engine import get_model
    model = get_model()
    
    prediction = model.predict(features)
    
    if prediction["label"] == "attack" and prediction["confidence"] > 0.75:
        # Map attack types to severity (SOC-calibrated rules)
        severity_map = {
            "port_scan":             Severity.MEDIUM,   # T1046 – recon phase
            "ddos":                  Severity.CRITICAL,
            "dos":                   Severity.HIGH,
            "r2l":                   Severity.HIGH,     # Remote-to-Local
            "u2r":                   Severity.CRITICAL, # Privilege escalation
            "ssh_brute_force":       Severity.HIGH,
            "arp_spoofing":          Severity.CRITICAL, # MITM
            "dns_tunneling":         Severity.HIGH,
            "mqtt_hijack":           Severity.HIGH,
            "rtsp_hijack":           Severity.HIGH,
            "anomalous_traffic":     Severity.LOW,
            "unusual_port_activity": Severity.LOW,
            "high_packet_rate":      Severity.MEDIUM,
            "none":                  Severity.LOW
        }
        
        severity = severity_map.get(prediction["attack_type"], Severity.MEDIUM)
        
        # Scapy packet or mock packet extraction
        if isinstance(packet, dict):
            src_ip = packet.get("src_ip", "unknown")
            dst_ip = packet.get("dst_ip", "unknown")
            protocol = packet.get("protocol", "unknown")
            raw_payload = json.dumps(packet)
        else:
            src_ip = packet[IP].src if IP in packet else "unknown"
            dst_ip = packet[IP].dst if IP in packet else "unknown"
            protocol = "TCP" if TCP in packet else ("UDP" if UDP in packet else ("ICMP" if ICMP in packet else "unknown"))
            raw_payload = str(packet.summary())

        generate_alert(
            src_ip=src_ip,
            dst_ip=dst_ip,
            protocol=protocol,
            attack_type=prediction["attack_type"],
            severity=severity,
            detection_method="AI",
            raw_payload=raw_payload
        )

def create_alert(alert_data: Dict[str, Any]):
    """
    Simpler interface for generating alerts, used by other modules.
    """
    severity_map = {
        "LOW": Severity.LOW,
        "MEDIUM": Severity.MEDIUM,
        "HIGH": Severity.HIGH,
        "CRITICAL": Severity.CRITICAL
    }
    
    generate_alert(
        src_ip=alert_data.get("src_ip", "0.0.0.0"),
        dst_ip=alert_data.get("dst_ip", "127.0.0.1"),
        protocol=alert_data.get("protocol", "TCP"),
        attack_type=alert_data.get("attack_type", "Unknown"),
        severity=severity_map.get(alert_data.get("severity", "MEDIUM"), Severity.MEDIUM),
        detection_method=alert_data.get("detection_method", "System"),
        raw_payload=alert_data.get("description", ""),
        device_role=alert_data.get("device_role"),
        zone=alert_data.get("zone"),
        port=alert_data.get("port"),
        is_simulation=alert_data.get("is_simulation", False),
        scenario_data=alert_data.get("scenario_data")
    )

def generate_alert(
    src_ip: str,
    dst_ip: str,
    protocol: str,
    attack_type: str,
    severity: Severity,
    detection_method: str,
    raw_payload: Optional[str] = None,
    device_role: Optional[str] = None,
    zone: Optional[str] = None,
    port: Optional[int] = None,
    is_simulation: bool = False,
    scenario_data: Optional[str] = None
):
    """
    Central function to create, save, and broadcast an alert.
    """
    # Deduplication check
    cache_key = f"{src_ip}:{attack_type}"
    now = time.time()
    if cache_key in alert_cache:
        if now - alert_cache[cache_key] < DEDUPLICATION_WINDOW:
            return

    alert_cache[cache_key] = now

    # Firewall evaluation (non-blocking — we log but always persist the alert)
    fw_action = evaluate_firewall(zone, None, protocol, port)
    blocked = fw_action == "deny"

    # IDS suggested response — log and recommend action for Critical/High severity
    ids_action = None
    if should_block(severity.value if hasattr(severity, "value") else str(severity), attack_type):
        ips_result = block_ip(src_ip, attack_type, severity.value if hasattr(severity, "value") else str(severity))
        if ips_result.get("action") in ("blocked",):
            blocked = True
            ids_action = ips_result.get("label", "Source IP Blocked")

    db = SessionLocal()
    try:
        # Encrypt sensitive payload before persisting
        encrypted_payload = raw_payload
        if raw_payload:
            try:
                from backend.security.encryption import encrypt
                encrypted_payload = encrypt(raw_payload)
            except Exception:
                encrypted_payload = raw_payload

        db_alert = Alert(
            src_ip=src_ip,
            dst_ip=dst_ip,
            protocol=protocol,
            attack_type=attack_type,
            severity=severity,
            detection_method=detection_method,
            raw_payload=encrypted_payload,
            device_role=device_role,
            zone=zone,
            port=port,
            is_simulation=is_simulation,
            scenario_data=scenario_data
        )
        db.add(db_alert)
        db.commit()
        db.refresh(db_alert)
        
        # Format alert for WebSocket broadcast
        alert_data = {
            "id": db_alert.id,
            "timestamp": db_alert.timestamp.isoformat(),
            "src_ip": db_alert.src_ip,
            "dst_ip": db_alert.dst_ip,
            "protocol": db_alert.protocol,
            "attack_type": db_alert.attack_type,
            "severity": db_alert.severity.value,
            "detection_method": db_alert.detection_method,
            "device_role": db_alert.device_role,
            "zone": db_alert.zone,
            "port": db_alert.port,
            "is_simulation": db_alert.is_simulation,
            "blocked": blocked,
            "action_taken": ids_action if ids_action else ("Alert Raised — Traffic Inspection Active" if blocked else "Logged & Monitored"),
        }
        
        # Log to event table
        db_event = Event(
            event_type="WARNING" if not blocked else "FIREWALL_BLOCK",
            description=(
                f"New {severity.value} alert: {attack_type} from {src_ip}"
                + (" [FIREWALL BLOCKED]" if blocked else "")
            )
        )
        db.add(db_event)
        db.commit()
        
        # Broadcast via WebSocket
        if alert_broadcast_callback:
            import asyncio
            target_loop = main_event_loop
            try:
                if not target_loop:
                    target_loop = asyncio.get_event_loop()
                
                if target_loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        alert_broadcast_callback(json.dumps(alert_data)),
                        target_loop
                    )
            except Exception:
                # If no loop is available in this thread and none was provided, 
                # we just skip broadcasting for this background event.
                pass
                
    except Exception as e:
        print(f"Error generating alert: {e}")
        db.rollback()
    finally:
        db.close()
