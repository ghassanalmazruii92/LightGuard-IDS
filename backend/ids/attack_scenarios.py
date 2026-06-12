"""
Tadhamon Smart City – Attack Scenarios
---------------------------------------
These are REAL attack simulations:
- Each scenario generates actual network traffic (SYN packets, ICMP floods, etc.)
- The IDS packet capture detects them for real
- Each scenario includes: what it is, how it works, how to defend

Admin can trigger any scenario from the dashboard for demo/testing.
"""

import threading
import time
import random
import socket
import json
from backend.ids.alert_engine import create_alert

# Scapy requires root on macOS/Linux to open raw sockets (/dev/bpf0).
# Import it lazily and mark whether it's usable.
try:
    from scapy.all import (
        IP, TCP, UDP, ICMP, ARP, Ether, DNS, DNSQR, Raw,
        send, sendp, RandShort, RandIP
    )
    _SCAPY_AVAILABLE = True
except Exception:
    _SCAPY_AVAILABLE = False

# ── Scenario Registry ─────────────────────────────────────────────────────────
SCENARIOS = {
    "port_scan": {
        "id":          "port_scan",
        "name":        "Port Scan Attack",
        "icon":        "🔍",
        "severity":    "MEDIUM",
        "zone":        "Transportation",
        "target_role": "Traffic Camera",
        "duration_sec": 15,

        "what_is_it": "The attacker probes every port on the target to discover open services and possible weaknesses.",
        "how_it_works": "The attacker sends a SYN to each port (often 1–65535). A SYN-ACK response means the port is open, mapping every entry point.",
        "real_world_impact": "Finding RTSP (554) open on traffic cameras can allow live feed access or camera shutdown.",
        "defense": [
            "Use a firewall that blocks SYN scans",
            "Close all non-essential ports",
            "Use port knocking to hide services",
            "LightGuard flags 15+ SYN packets in 5 seconds from one IP",
        ],
        "mitre_technique": "T1046 – Network Service Discovery",
    },

    "brute_force_ssh": {
        "id":          "brute_force_ssh",
        "name":        "SSH Brute Force",
        "icon":        "🔨",
        "severity":    "HIGH",
        "zone":        "Compute Layer",
        "target_role": "Fog Node (Pi)",
        "duration_sec": 20,

        "what_is_it": "The attacker tries thousands of passwords automatically against SSH to compromise the Fog Node.",
        "how_it_works": "Using tools like Hydra or Medusa, the attacker sends login attempts very quickly with common password lists.",
        "real_world_impact": "Owning a Fog Node gives full control of the fog compute layer and any connected city devices.",
        "defense": [
            "Use SSH keys instead of passwords",
            "Enable Fail2Ban (block IP after 5 failures)",
            "Change SSH from port 22 to a non-default port",
            "LightGuard flags 10+ attempts in 10 seconds",
        ],
        "mitre_technique": "T1110 – Brute Force",
    },

    "arp_spoofing": {
        "id":          "arp_spoofing",
        "name":        "ARP Spoofing / MITM",
        "icon":        "🎭",
        "severity":    "CRITICAL",
        "zone":        "Network",
        "target_role": "Network Gateway",
        "duration_sec": 30,

        "what_is_it": "The attacker sends fake ARP replies so devices believe the attacker is the gateway (man-in-the-middle).",
        "how_it_works": "The attacker broadcasts ARP replies claiming to be the gateway; traffic flows through them so it can be read or altered.",
        "real_world_impact": "In a smart city, this can eavesdrop on sensor data or alter energy and traffic readings.",
        "defense": [
            "Enable Dynamic ARP Inspection on the switch",
            "Use static ARP entries for critical devices",
            "Encrypt with TLS (attacker may intercept but not read payloads)",
            "LightGuard detects MAC changes on the same IP",
        ],
        "mitre_technique": "T1557.002 – ARP Cache Poisoning",
    },

    "mqtt_hijack": {
        "id":          "mqtt_hijack",
        "name":        "MQTT Protocol Hijack",
        "icon":        "📡",
        "severity":    "HIGH",
        "zone":        "Infrastructure",
        "target_role": "Environmental Sensor",
        "duration_sec": 20,

        "what_is_it": "MQTT is common for IoT. Without encryption or auth, an attacker can read and publish fake data.",
        "how_it_works": "The attacker connects to the broker on port 1883 without TLS, subscribes to # for all topics, or publishes spoofed values.",
        "real_world_impact": "Forged environmental or energy sensor data can drive wrong city operations decisions.",
        "defense": [
            "Use MQTT TLS (8883 instead of 1883)",
            "Require username/password on the broker",
            "Restrict topics per device (ACL)",
            "LightGuard surfaces unencrypted MQTT connections",
        ],
        "mitre_technique": "T1040 – Network Sniffing (MQTT)",
    },

    "dos_attack": {
        "id":          "dos_attack",
        "name":        "DoS – ICMP Flood",
        "icon":        "💥",
        "severity":    "HIGH",
        "zone":        "Transportation",
        "target_role": "Traffic Camera",
        "duration_sec": 10,

        "what_is_it": "The attacker floods the target with traffic to exhaust resources and stop the service.",
        "how_it_works": "Thousands of ICMP (ping) packets per second fill network buffers until the host stops responding.",
        "real_world_impact": "Taking down cameras or sensors disrupts traffic management and emergency response.",
        "defense": [
            "Enable rate limiting on the router",
            "Shape or cap ICMP traffic",
            "Firewall ICMP from unknown sources",
            "LightGuard flags 100+ packets in 3 seconds",
        ],
        "mitre_technique": "T1498 – Network Denial of Service",
    },

    "rtsp_hijack": {
        "id":          "rtsp_hijack",
        "name":        "RTSP Camera Stream Hijack",
        "icon":        "📷",
        "severity":    "HIGH",
        "zone":        "Transportation",
        "target_role": "Traffic Camera",
        "duration_sec": 25,

        "what_is_it": "The attacker accesses surveillance feeds via RTSP left open without authentication.",
        "how_it_works": "Many IP cameras expose RTSP on port 554 with no password; tools like VLC or ffmpeg pull the stream directly.",
        "real_world_impact": "Live city camera access can leak locations, enable stalking, or aid criminal planning.",
        "defense": [
            "Set a strong password on every camera",
            "Firewall 554 from the internet",
            "Use VPN for administrative access to cameras",
            "LightGuard alerts on unauthorized RTSP connections",
        ],
        "mitre_technique": "T1078 – Valid Accounts (default credentials)",
    },
}


def run_scenario(scenario_id: str, target_ip: str):
    """
    Execute a real attack simulation scenario.
    Generates actual network traffic that the IDS will detect.
    """
    scenario = SCENARIOS.get(scenario_id)
    if not scenario:
        return

    # Log scenario start
    create_alert({
        "src_ip":           "Scenario Engine",
        "dst_ip":           target_ip,
        "attack_type":      f"[SIMULATION] {scenario['name']}",
        "severity":         scenario["severity"],
        "detection_method": "Attack Simulator",
        "description":      scenario["what_is_it"],
        "device_role":      scenario["target_role"],
        "zone":             scenario["zone"],
        "is_simulation":    True,
        "scenario_data":    json.dumps({
            "what_is_it":       scenario["what_is_it"],
            "how_it_works":     scenario["how_it_works"],
            "real_world_impact":scenario["real_world_impact"],
            "defense":          scenario["defense"],
            "mitre":            scenario["mitre_technique"],
        })
    })

    # Run in background thread
    t = threading.Thread(
        target=_execute_traffic,
        args=(scenario_id, target_ip, scenario["duration_sec"]),
        daemon=True
    )
    t.start()


def _execute_traffic(scenario_id: str, target_ip: str, duration: int):
    """
    Generate attack traffic for the scenario.
    Uses real Scapy packets when running as root; otherwise falls back to
    socket-level simulation that still exercises the IDS alert pipeline.
    """
    end_time = time.time() + duration

    if scenario_id == "port_scan":
        ports = [21, 22, 23, 80, 443, 554, 1883, 3306, 3389, 5900, 8080, 8554]
        while time.time() < end_time:
            if _SCAPY_AVAILABLE:
                try:
                    for port in ports:
                        send(IP(dst=target_ip)/TCP(sport=RandShort(), dport=port, flags="S"),
                             verbose=False)
                except Exception:
                    _simulate_port_scan(target_ip, ports)
            else:
                _simulate_port_scan(target_ip, ports)
            time.sleep(0.5)

    elif scenario_id == "brute_force_ssh":
        while time.time() < end_time:
            for _ in range(5):
                try:
                    s = socket.socket()
                    s.settimeout(0.3)
                    s.connect((target_ip, 22))
                    s.close()
                except Exception:
                    pass
            time.sleep(0.5)

    elif scenario_id == "arp_spoofing":
        fake_mac = "aa:bb:cc:dd:ee:ff"
        while time.time() < end_time:
            if _SCAPY_AVAILABLE:
                try:
                    sendp(
                        Ether(dst="ff:ff:ff:ff:ff:ff") /
                        ARP(op=2, pdst=target_ip, hwdst="ff:ff:ff:ff:ff:ff",
                            psrc=target_ip, hwsrc=fake_mac),
                        verbose=False
                    )
                except Exception:
                    _simulate_alert(target_ip, "ARP Spoofing", "ARP Cache Poisoning – simulated (no root)")
            else:
                _simulate_alert(target_ip, "ARP Spoofing", "ARP Cache Poisoning – simulated (no root)")
            time.sleep(2)

    elif scenario_id == "dos_attack":
        while time.time() < end_time:
            if _SCAPY_AVAILABLE:
                try:
                    send(IP(dst=target_ip)/ICMP(), count=50, verbose=False)
                except Exception:
                    _simulate_alert(target_ip, "DoS ICMP Flood", "ICMP Flood – simulated (no root)")
            else:
                _simulate_alert(target_ip, "DoS ICMP Flood", "ICMP Flood – simulated (no root)")
            time.sleep(0.1)

    elif scenario_id == "mqtt_hijack":
        while time.time() < end_time:
            if _SCAPY_AVAILABLE:
                try:
                    send(IP(dst=target_ip)/TCP(sport=RandShort(), dport=1883, flags="PA")/Raw(load="MQTT CONNECT"),
                         verbose=False)
                except Exception:
                    _simulate_alert(target_ip, "MQTT Hijack", "Unencrypted MQTT connection – simulated (no root)")
            else:
                _simulate_alert(target_ip, "MQTT Hijack", "Unencrypted MQTT connection – simulated (no root)")
            time.sleep(1)

    elif scenario_id == "rtsp_hijack":
        while time.time() < end_time:
            if _SCAPY_AVAILABLE:
                try:
                    send(IP(dst=target_ip)/TCP(sport=RandShort(), dport=554, flags="PA")/
                         Raw(load=f"DESCRIBE rtsp://{target_ip}/stream RTSP/1.0\r\nCSeq: 1\r\n\r\n"),
                         verbose=False)
                except Exception:
                    _simulate_alert(target_ip, "RTSP Stream Hijack", "Unauthenticated RTSP access – simulated (no root)")
            else:
                _simulate_alert(target_ip, "RTSP Stream Hijack", "Unauthenticated RTSP access – simulated (no root)")
            time.sleep(1)


def _simulate_port_scan(target_ip: str, ports: list):
    """Socket-level SYN-like scan – no raw sockets needed."""
    for port in ports:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.1)
            s.connect_ex((target_ip, port))
            s.close()
        except Exception:
            pass


def _simulate_alert(target_ip: str, attack_type: str, description: str):
    """Inject a simulated alert when raw packet sending is unavailable."""
    create_alert({
        "src_ip":           "Scenario Engine",
        "dst_ip":           target_ip,
        "attack_type":      f"[SIMULATION] {attack_type}",
        "severity":         "MEDIUM",
        "detection_method": "Attack Simulator (no-root fallback)",
        "description":      description,
        "is_simulation":    True,
    })
