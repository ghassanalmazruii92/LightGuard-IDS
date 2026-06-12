#!/usr/bin/env python3
"""
LightGuard — GNS3 Controller
Connects to GNS3 REST API (port 3080) and controls the Tadhamon topology.

Usage (from VS Code Task or Terminal):
  python3 scripts/gns3_controller.py --action status
  python3 scripts/gns3_controller.py --action start
  python3 scripts/gns3_controller.py --action stop
  python3 scripts/gns3_controller.py --action vpcs
  python3 scripts/gns3_controller.py --action nodes
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

try:
    import requests
except ImportError:
    print("[error] requests not installed. Run: pip install requests")
    sys.exit(1)

GNS3_URL     = os.getenv("GNS3_URL",     "http://localhost:3080")
GNS3_PROJECT = os.getenv("GNS3_PROJECT", "LightGuard_Tadhamon")

# Device IP mapping (matches seeds.py exactly)
DEVICE_IPS = {
    "cam-traffic-01":        "192.168.10.11",
    "cam-traffic-02":        "192.168.10.12",
    "traffic-light-ctrl-01": "192.168.10.13",
    "smart-meter-01":        "192.168.20.11",
    "smart-meter-02":        "192.168.20.12",
    "power-distribution-01": "192.168.20.21",
    "env-sensor-air-01":     "192.168.30.11",
    "env-sensor-water-01":   "192.168.30.12",
    "water-pump-ctrl-01":    "192.168.30.20",
    "fog-node-01":           "192.168.40.11",
    "fog-node-02":           "192.168.40.12",
    "fog-node-03":           "192.168.40.21",
    "gateway-main":          "192.168.50.1",
    "switch-core-01":        "192.168.50.2",
    "workstation-ops-01":    "192.168.99.11",
    "workstation-ops-02":    "192.168.99.12",
    "scada-server-01":       "192.168.99.20",
    "LightGuard-IDS-Server": "192.168.99.10",
}

# VPCS configuration commands (one per device)
VPCS_CONFIG = {
    "cam-traffic-01":        "ip 192.168.10.11/24 192.168.10.1",
    "cam-traffic-02":        "ip 192.168.10.12/24 192.168.10.1",
    "traffic-light-ctrl-01": "ip 192.168.10.13/24 192.168.10.1",
    "smart-meter-01":        "ip 192.168.20.11/24 192.168.20.1",
    "smart-meter-02":        "ip 192.168.20.12/24 192.168.20.1",
    "power-distribution-01": "ip 192.168.20.21/24 192.168.20.1",
    "env-sensor-air-01":     "ip 192.168.30.11/24 192.168.30.1",
    "env-sensor-water-01":   "ip 192.168.30.12/24 192.168.30.1",
    "water-pump-ctrl-01":    "ip 192.168.30.20/24 192.168.30.1",
    "fog-node-01":           "ip 192.168.40.11/24 192.168.40.1",
    "fog-node-02":           "ip 192.168.40.12/24 192.168.40.1",
    "fog-node-03":           "ip 192.168.40.21/24 192.168.40.1",
    "gateway-main":          "ip 192.168.50.1/24 192.168.50.254",
    "workstation-ops-01":    "ip 192.168.99.11/24 192.168.99.1",
    "workstation-ops-02":    "ip 192.168.99.12/24 192.168.99.1",
    "scada-server-01":       "ip 192.168.99.20/24 192.168.99.1",
}


def api(method: str, path: str, **kwargs):
    url = f"{GNS3_URL}/v2{path}"
    try:
        r = getattr(requests, method)(url, timeout=10, **kwargs)
        r.raise_for_status()
        return r.json() if r.content else {}
    except requests.ConnectionError:
        print(f"[error] Cannot reach GNS3 at {GNS3_URL}")
        print("        Make sure GNS3 is running and the server is started.")
        sys.exit(1)
    except requests.HTTPError as e:
        print(f"[error] HTTP {e.response.status_code}: {e.response.text[:200]}")
        sys.exit(1)


def find_project() -> dict:
    projects = api("get", "/projects")
    for p in projects:
        if p["name"] == GNS3_PROJECT:
            return p
    names = [p["name"] for p in projects]
    print(f"[error] Project '{GNS3_PROJECT}' not found.")
    print(f"        Available projects: {names}")
    sys.exit(1)


def action_status():
    print(f"\n{'─'*52}")
    print(f"  LightGuard GNS3 Controller — {GNS3_URL}")
    print(f"{'─'*52}")

    ver = api("get", "/version")
    print(f"  GNS3 version : {ver.get('version', '?')}")

    project = find_project()
    pid = project["project_id"]
    print(f"  Project      : {project['name']} ({pid[:8]}...)")
    print(f"  Status       : {project.get('status', '?')}")

    nodes = api("get", f"/projects/{pid}/nodes")
    running = sum(1 for n in nodes if n.get("status") == "started")
    print(f"  Nodes        : {len(nodes)} total, {running} running")
    print(f"{'─'*52}")
    print(f"  {'Node':<28} {'Type':<12} {'Status'}")
    print(f"  {'─'*26} {'─'*10} {'─'*10}")
    for node in sorted(nodes, key=lambda n: n["name"]):
        status = node.get("status", "?")
        color  = "✅" if status == "started" else "⏹️"
        ntype  = node.get("node_type", "?")[:10]
        ip     = DEVICE_IPS.get(node["name"], "")
        ip_str = f"  [{ip}]" if ip else ""
        print(f"  {color} {node['name']:<26} {ntype:<12}{ip_str}")
    print(f"{'─'*52}\n")


def action_start():
    project = find_project()
    pid = project["project_id"]
    print(f"[gns3] Starting all nodes in '{GNS3_PROJECT}'...")
    api("post", f"/projects/{pid}/nodes/start")
    print("[gns3] ✅ All nodes started. Waiting 3s for boot...")
    time.sleep(3)
    action_status()


def action_stop():
    project = find_project()
    pid = project["project_id"]
    print(f"[gns3] Stopping all nodes in '{GNS3_PROJECT}'...")
    api("post", f"/projects/{pid}/nodes/stop")
    print("[gns3] ✅ All nodes stopped.")


def action_nodes():
    project = find_project()
    pid = project["project_id"]
    nodes = api("get", f"/projects/{pid}/nodes")
    print(json.dumps(nodes, indent=2))


def action_vpcs():
    """Print VPCS IP configuration commands for all IoT devices."""
    print(f"\n{'─'*56}")
    print("  VPCS Configuration Commands — Tadhamon Smart City")
    print(f"{'─'*56}")
    print("  Run each command in the corresponding VPCS console:\n")
    zones = {
        "Transportation (VLAN 10)": ["cam-traffic-01","cam-traffic-02","traffic-light-ctrl-01"],
        "Energy Grid    (VLAN 20)": ["smart-meter-01","smart-meter-02","power-distribution-01"],
        "Infrastructure (VLAN 30)": ["env-sensor-air-01","env-sensor-water-01","water-pump-ctrl-01"],
        "Compute Layer  (VLAN 40)": ["fog-node-01","fog-node-02","fog-node-03"],
        "Network        (VLAN 50)": ["gateway-main"],
        "Control Center (VLAN 99)": ["workstation-ops-01","workstation-ops-02","scada-server-01"],
    }
    for zone, devices in zones.items():
        print(f"  ── {zone}")
        for dev in devices:
            cmd = VPCS_CONFIG.get(dev, "")
            print(f"     # {dev}")
            print(f"     {cmd}\n")
    print(f"{'─'*56}\n")


def action_configure_vpcs():
    """Send VPCS IP commands via GNS3 API console."""
    project = find_project()
    pid = project["project_id"]
    nodes = api("get", f"/projects/{pid}/nodes")
    node_map = {n["name"]: n for n in nodes}

    configured = 0
    for name, cmd in VPCS_CONFIG.items():
        node = node_map.get(name)
        if not node:
            print(f"[skip] {name} — not found in topology")
            continue
        if node.get("node_type") != "vpcs":
            print(f"[skip] {name} — not a VPCS node (type: {node.get('node_type')})")
            continue
        if node.get("status") != "started":
            print(f"[skip] {name} — not running (start nodes first)")
            continue

        node_id = node["node_id"]
        try:
            api("post",
                f"/projects/{pid}/nodes/{node_id}/console/reset")
            time.sleep(0.3)
            # Write command to console
            console_url = f"{GNS3_URL}/v2/projects/{pid}/nodes/{node_id}/console"
            requests.post(console_url, json={"input": cmd + "\n"}, timeout=5)
            print(f"[vpcs] ✅ {name:<28} → {cmd}")
            configured += 1
        except Exception as e:
            print(f"[vpcs] ⚠️  {name} — {e}")
        time.sleep(0.2)

    print(f"\n[done] Configured {configured}/{len(VPCS_CONFIG)} VPCS nodes.")


def main():
    parser = argparse.ArgumentParser(
        description="LightGuard GNS3 Controller — manages Tadhamon topology"
    )
    parser.add_argument(
        "--action",
        choices=["status", "start", "stop", "nodes", "vpcs", "configure-vpcs"],
        default="status",
        help="Action to perform (default: status)",
    )
    parser.add_argument("--url",     default=None, help="GNS3 server URL (default: http://localhost:3080)")
    parser.add_argument("--project", default=None, help=f"GNS3 project name (default: {GNS3_PROJECT})")
    args = parser.parse_args()

    global GNS3_URL, GNS3_PROJECT
    if args.url:
        GNS3_URL = args.url
    if args.project:
        GNS3_PROJECT = args.project

    actions = {
        "status":          action_status,
        "start":           action_start,
        "stop":            action_stop,
        "nodes":           action_nodes,
        "vpcs":            action_vpcs,
        "configure-vpcs":  action_configure_vpcs,
    }
    actions[args.action]()


if __name__ == "__main__":
    main()
