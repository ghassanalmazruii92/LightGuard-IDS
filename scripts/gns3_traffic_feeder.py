#!/usr/bin/env python3
"""
GNS3 / PCAP -> LightGuard packet feeder.

Examples:
  python3 scripts/gns3_traffic_feeder.py --login --count 20
  python3 scripts/gns3_traffic_feeder.py --token "$LIGHTGUARD_TOKEN" --attack port_scan
  python3 scripts/gns3_traffic_feeder.py --login --pcap demo_attack.pcap
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parents[1]
GNS3_FILE = REPO / "gns3" / "LightGuard_Tadhamon.gns3"

DEVICE_IPS = {
    "cam-traffic-01": "192.168.10.11",
    "cam-traffic-02": "192.168.10.12",
    "traffic-light-ctrl-01": "192.168.10.13",
    "smart-meter-01": "192.168.20.11",
    "smart-meter-02": "192.168.20.12",
    "power-distribution-01": "192.168.20.21",
    "env-sensor-air-01": "192.168.30.11",
    "env-sensor-water-01": "192.168.30.12",
    "water-pump-ctrl-01": "192.168.30.20",
    "fog-node-01": "192.168.40.11",
    "fog-node-02": "192.168.40.12",
    "fog-node-03": "192.168.40.21",
    "gateway-main": "192.168.50.1",
    "switch-core-01": "192.168.50.2",
    "workstation-ops-01": "192.168.99.11",
    "workstation-ops-02": "192.168.99.12",
    "scada-server-01": "192.168.99.20",
    "LightGuard-IDS-Server": "192.168.99.10",
}

ATTACKS = {
    "port_scan": ("Port Scan Attack", "MEDIUM", "TCP", "SYN", None),
    "ssh_bruteforce": ("SSH Brute Force", "HIGH", "TCP", "SYN", 22),
    "rtsp_hijack": ("RTSP Camera Stream Hijack", "HIGH", "TCP", "PSH/ACK", 554),
    "mqtt_flood": ("MQTT Topic Flood", "HIGH", "TCP", "PSH/ACK", 1883),
    "icmp_flood": ("ICMP Flood (DoS)", "HIGH", "ICMP", "ECHO", None),
    "cve_2021_36260": ("CVE-2021-36260 Exploit Attempt", "CRITICAL", "TCP", "PSH/ACK", 8000),
}


def load_gns3_nodes() -> dict[str, str]:
    if not GNS3_FILE.exists():
        return DEVICE_IPS
    try:
        data = json.loads(GNS3_FILE.read_text(encoding="utf-8"))
    except Exception:
        return DEVICE_IPS
    names = {}
    for node in data.get("topology", {}).get("nodes", []):
        name = node.get("name")
        if name in DEVICE_IPS:
            names[name] = DEVICE_IPS[name]
    return names or DEVICE_IPS


def login(base_url: str, username: str, password: str) -> str:
    r = requests.post(
        f"{base_url}/auth/login",
        data={"username": username, "password": password},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def post_packet(base_url: str, token: str, packet: dict) -> None:
    r = requests.post(
        f"{base_url}/api/packets/ingest",
        json=packet,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    r.raise_for_status()
    print(f"[gns3] {packet['src_ip']} -> {packet['dst_ip']} {packet['attack_type']} [{packet['severity']}]")


def zone_for_ip(ip: str) -> str:
    if ip.startswith("192.168.10."):
        return "Transportation"
    if ip.startswith("192.168.20."):
        return "Energy Grid"
    if ip.startswith("192.168.30."):
        return "Infrastructure"
    if ip.startswith("192.168.40."):
        return "Compute Layer"
    if ip.startswith("192.168.50."):
        return "Network"
    if ip.startswith("192.168.99."):
        return "Control Center"
    return "External"


def replay_synthetic(base_url: str, token: str, count: int, interval: float, attack: str) -> None:
    nodes = load_gns3_nodes()
    src_pool = [ip for name, ip in nodes.items() if name.startswith("workstation") or ip.startswith("192.168.99.")]
    dst_pool = [ip for name, ip in nodes.items() if name.startswith(("cam", "smart", "env", "water", "fog", "traffic"))]
    src_pool = src_pool or ["192.168.99.12"]
    dst_pool = dst_pool or ["192.168.10.11"]
    attacks = [attack] if attack != "mixed" else list(ATTACKS)
    for i in range(count):
        key = random.choice(attacks)
        attack_type, severity, proto, flags, port = ATTACKS[key]
        dst_ip = random.choice(dst_pool)
        src_ip = random.choice(src_pool)
        packet = {
            "src_ip": src_ip,
            "dst_ip": dst_ip,
            "protocol": proto,
            "src_port": random.randint(20000, 60999) if proto == "TCP" else None,
            "dst_port": port,
            "flags": flags,
            "length": random.randint(74, 1514),
            "zone": zone_for_ip(dst_ip),
            "device_type": "gns3_node",
            "severity": severity,
            "attack_type": attack_type,
            "source": "GNS3",
            "raw_summary": f"GNS3 demo packet {i + 1}/{count}: {attack_type}",
            "create_alert": True,
        }
        post_packet(base_url, token, packet)
        if i + 1 < count:
            time.sleep(interval)


def replay_pcap(base_url: str, token: str, pcap: Path, limit: int) -> None:
    try:
        from scapy.all import IP, TCP, UDP, ICMP, rdpcap
    except Exception as exc:
        raise SystemExit(f"Scapy is required for --pcap replay: {exc}") from exc

    for idx, pkt in enumerate(rdpcap(str(pcap))[:limit]):
        if IP not in pkt:
            continue
        proto = "TCP" if TCP in pkt else "UDP" if UDP in pkt else "ICMP" if ICMP in pkt else "IP"
        src_port = int(pkt[TCP].sport) if TCP in pkt else int(pkt[UDP].sport) if UDP in pkt else None
        dst_port = int(pkt[TCP].dport) if TCP in pkt else int(pkt[UDP].dport) if UDP in pkt else None
        flags = str(pkt[TCP].flags) if TCP in pkt else ("ECHO" if ICMP in pkt else None)
        post_packet(base_url, token, {
            "src_ip": pkt[IP].src,
            "dst_ip": pkt[IP].dst,
            "protocol": proto,
            "src_port": src_port,
            "dst_port": dst_port,
            "flags": flags,
            "length": len(pkt),
            "zone": zone_for_ip(pkt[IP].dst),
            "device_type": "pcap_replay",
            "severity": "MEDIUM" if idx % 7 == 0 else "LOW",
            "attack_type": "PCAP Replay Event" if idx % 7 == 0 else None,
            "source": "PCAP Replay",
            "raw_summary": pkt.summary(),
            "create_alert": idx % 7 == 0,
        })


def main() -> None:
    parser = argparse.ArgumentParser(description="Feed GNS3 or PCAP traffic into LightGuard.")
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--token", default="")
    parser.add_argument("--login", action="store_true")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="lightguard123")
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--attack", choices=["mixed", *ATTACKS.keys()], default="mixed")
    parser.add_argument("--pcap", type=Path)
    args = parser.parse_args()

    token = args.token
    if args.login:
        token = login(args.url, args.username, args.password)
    if not token:
        raise SystemExit("Provide --token or use --login.")

    if args.pcap:
        replay_pcap(args.url, token, args.pcap, args.count)
    else:
        replay_synthetic(args.url, token, args.count, args.interval, args.attack)


if __name__ == "__main__":
    main()
