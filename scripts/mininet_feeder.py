#!/usr/bin/env python3
"""
Mininet / Containerlab → LightGuard feeder
===========================================
Usage (standalone simulation — no actual Mininet required):

    python scripts/mininet_feeder.py --url http://localhost:8000 \
        --token <JWT> --interval 10

Or with a real Mininet topology:

    sudo python scripts/mininet_feeder.py --mininet --url http://localhost:8000 \
        --token <JWT>

The script either:
  a) (default) Replays a realistic sequence of simulated attack events
     from a pre-defined scenario list (no Mininet install needed), or
  b) (--mininet) Starts a Mininet topology matching Tadhamon zones and
     sends real flow events to LightGuard via /api/network/ingest.

Authentication:
  Pass a valid LightGuard JWT as --token, or set LIGHTGUARD_TOKEN env var.
  Obtain a token with:
    curl -s -X POST http://localhost:8000/auth/token \
         -d "username=admin&password=lightguard123" | jq -r .access_token
"""
import argparse
import os
import random
import sys
import time

import requests

# ── Attack scenario library ────────────────────────────────────────────────
SCENARIOS = [
    # (src_ip,            dst_ip,           attack_type,               severity,  zone,              protocol, port)
    ("192.168.10.11",  "192.168.99.10",  "RTSP_STREAM_HIJACK",      "HIGH",    "Transportation",  "TCP",    554),
    ("192.168.20.11",  "192.168.40.11",  "MODBUS_WRITE_REGISTER",   "CRITICAL","Energy Grid",     "TCP",    502),
    ("10.0.0.5",       "192.168.30.11",  "MQTT_TOPIC_FLOOD",        "HIGH",    "Infrastructure",  "TCP",    1883),
    ("192.168.10.13",  "192.168.99.10",  "SSH_BRUTE_FORCE",         "HIGH",    "Transportation",  "TCP",    22),
    ("192.168.1.2",    "192.168.40.12",  "SNMP_PUBLIC_COMMUNITY",   "MEDIUM",  "Network",         "UDP",    161),
    ("172.16.0.100",   "192.168.20.12",  "VOLGATE_SPIKE_ANOMALY",   "CRITICAL","Energy Grid",     "TCP",    502),
    ("192.168.99.12",  "192.168.30.11",  "PORT_SCAN",               "MEDIUM",  "Control Center",  "TCP",    None),
    ("192.168.40.11",  "8.8.8.8",        "UNUSUAL_OUTBOUND_TRAFFIC","MEDIUM",  "Compute Layer",   "TCP",    443),
    ("10.0.0.55",      "192.168.10.12",  "CAMERA_PACKET_FLOOD",     "HIGH",    "Transportation",  "UDP",    None),
    ("192.168.20.21",  "192.168.99.10",  "FTP_PLAIN_TEXT_TRANSFER", "HIGH",    "Energy Grid",     "TCP",    21),
    ("10.0.0.77",      "192.168.30.11",  "SQL_INJECTION",           "CRITICAL","Infrastructure",  "TCP",    443),
    ("192.168.10.11",  "192.168.40.11",  "CVE_2021_36260_EXPLOIT",  "CRITICAL","Transportation",  "TCP",    8000),
    ("192.168.1.100",  "192.168.20.11",  "BRUTE_FORCE",             "HIGH",    "Energy Grid",     "TCP",    22),
    ("192.168.30.12",  "192.168.40.21",  "NEW_DEVICE_JOINED",       "LOW",     "Infrastructure",  "TCP",    None),
    ("172.16.5.10",    "192.168.99.11",  "DNS_AMPLIFICATION",       "HIGH",    "Network",         "UDP",    53),
]


def send_event(base_url: str, token: str, event: dict) -> bool:
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.post(
            f"{base_url}/api/network/ingest",
            json=event,
            headers=headers,
            timeout=5,
        )
        if resp.status_code == 200:
            print(f"  [+] Ingested: {event['attack_type']} from {event['src_ip']} → {event['dst_ip']} [{event['severity']}]")
            return True
        else:
            print(f"  [!] HTTP {resp.status_code}: {resp.text[:200]}")
            return False
    except requests.RequestException as e:
        print(f"  [!] Request error: {e}")
        return False


def run_simulation(base_url: str, token: str, interval: float, count: int):
    """Replay simulated attack events in a loop."""
    print(f"[feeder] Simulation mode – sending events to {base_url}")
    print(f"[feeder] interval={interval}s, count={'∞' if count < 0 else count}")
    sent = 0
    while count < 0 or sent < count:
        src_ip, dst_ip, attack_type, severity, zone, protocol, port = random.choice(SCENARIOS)
        event = {
            "src_ip":      src_ip,
            "dst_ip":      dst_ip,
            "attack_type": attack_type,
            "severity":    severity,
            "zone":        zone,
            "protocol":    protocol,
            "port":        port,
            "description": f"[Mininet Feeder] {attack_type} simulated event",
        }
        send_event(base_url, token, event)
        sent += 1
        if count < 0 or sent < count:
            time.sleep(interval)


def run_mininet(base_url: str, token: str):
    """
    Start a real Mininet topology and capture flow events.
    Requires: sudo, mininet, and the mininet Python package.
    """
    try:
        from mininet.net import Mininet
        from mininet.topo import Topo
        from mininet.node import OVSController
        from mininet.link import TCLink
        from mininet.log import setLogLevel
    except ImportError:
        print("[feeder] Mininet not installed. Run: pip install mininet  (or install via OS package)")
        sys.exit(1)

    setLogLevel('warning')

    class TadhamonTopo(Topo):
        """6 zones mapped to 6 switches + 1 host per zone."""
        def build(self):
            core = self.addSwitch('s0')
            for i, zone_ip in enumerate(['10', '20', '30', '40', '50', '99'], 1):
                sw = self.addSwitch(f's{i}')
                h  = self.addHost(f'h{i}', ip=f'192.168.{zone_ip}.100/24')
                self.addLink(core, sw)
                self.addLink(sw, h)

    topo = TadhamonTopo()
    net  = Mininet(topo=topo, controller=OVSController, link=TCLink)
    net.start()
    print("[feeder] Mininet topology started. Sending ping events as IDS alerts…")
    print("[feeder] Press Ctrl-C to stop.")

    hosts = net.hosts
    try:
        while True:
            h1, h2 = random.sample(hosts, 2)
            result = h1.cmd(f"ping -c 1 -W 1 {h2.IP()}")
            attack_type = "PING_SWEEP" if "1 packets transmitted" in result else "PING_TIMEOUT"
            event = {
                "src_ip":      h1.IP(),
                "dst_ip":      h2.IP(),
                "attack_type": attack_type,
                "severity":    "LOW",
                "protocol":    "ICMP",
                "description": f"Mininet ping {h1.IP()} → {h2.IP()}",
            }
            send_event(base_url, token, event)
            time.sleep(2)
    except KeyboardInterrupt:
        pass
    finally:
        net.stop()
        print("[feeder] Mininet stopped.")


def main():
    parser = argparse.ArgumentParser(description="LightGuard Mininet/Simulation Feeder")
    parser.add_argument("--url",      default="http://localhost:8000",   help="LightGuard base URL")
    parser.add_argument("--token",    default=os.getenv("LIGHTGUARD_TOKEN", ""), help="JWT bearer token")
    parser.add_argument("--interval", type=float, default=8.0,           help="Seconds between events (simulation mode)")
    parser.add_argument("--count",    type=int,   default=-1,            help="Number of events to send (-1 = infinite)")
    parser.add_argument("--mininet",  action="store_true",               help="Use real Mininet topology instead of simulation")
    args = parser.parse_args()

    if not args.token:
        print("[feeder] No token provided. Set --token or LIGHTGUARD_TOKEN env var.")
        print("[feeder] Get a token: curl -s -X POST http://localhost:8000/auth/token "
              "-d 'username=admin&password=lightguard123' | python3 -c \"import sys,json; print(json.load(sys.stdin)['access_token'])\"")
        sys.exit(1)

    if args.mininet:
        run_mininet(args.url, args.token)
    else:
        run_simulation(args.url, args.token, args.interval, args.count)


if __name__ == "__main__":
    main()
