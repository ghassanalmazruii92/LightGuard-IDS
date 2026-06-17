"""
No-Root Network Scanner for Tadhamon Smart City IDS
----------------------------------------------------
Works entirely without sudo / cap_net_raw:
  1. Ping sweep     → populate OS ARP cache
  2. ARP cache read → get MACs (arp -a / /proc/net/arp)
  3. RustScan       → ultra-fast port discovery (no root) – falls back to TCP connect
  4. nmap -sT       → service fingerprint on discovered ports (TCP connect, no root)

Drops in as a replacement for TadhamonScanner when the user does not
have root privileges or when MOCK_MODE is disabled but masscan/scapy
are unavailable.
"""

import os
import re
import socket
import subprocess
import threading
import time
import json
import ipaddress
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend.database import save_device, update_device_status
from backend.ids.alert_engine import create_alert
from backend.ids.real_scanner import classify_device, analyze_ports, TADHAMON_ROLES, DANGEROUS_PORTS


# ── Auto-detect local network CIDR ───────────────────────────────────────────
def get_local_cidr() -> str:
    """
    Detect the /24 subnet of the machine's primary outbound interface.
    Falls back to 192.168.1.0/24 if detection fails.
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        network = ipaddress.ip_network(f"{local_ip}/24", strict=False)
        return str(network)
    except Exception:
        return "192.168.1.0/24"

# ── Port list to scan (no root TCP connect) ────────────────────────────────
COMMON_PORTS = [
    21, 22, 23, 25, 53, 80, 110, 143, 443, 445,
    554, 502, 1433, 1883, 3306, 3389, 4840, 5900,
    6379, 8080, 8443, 8554, 8883, 9200, 27017, 2375,
]

SCAN_TIMEOUT = 0.5   # seconds per port
PING_TIMEOUT = 0.8   # seconds per ping
MAX_WORKERS  = 50    # concurrent port probes

_rustscan_available: bool | None = None  # cached availability check


def _check_rustscan() -> bool:
    global _rustscan_available
    if _rustscan_available is None:
        try:
            subprocess.run(["rustscan", "--version"], capture_output=True, timeout=5)
            _rustscan_available = True
            print("[SocketScanner] RustScan detected – using fast port discovery")
        except Exception:
            _rustscan_available = False
            print("[SocketScanner] RustScan not found – falling back to TCP connect")
    return _rustscan_available


def rustscan_ports(ip: str) -> list[int]:
    """
    Use RustScan for ultra-fast port discovery (no root needed).
    Uses --greppable mode to skip nmap and return open ports only.
    Output line format: Host: IP ()\\tPorts: 22/open/tcp//ssh///, 80/open/tcp//http///
    Returns sorted list of open ports, or [] on failure.
    """
    if not _check_rustscan():
        return []
    try:
        result = subprocess.run(
            [
                "rustscan", "-a", ip,
                "-b", "500",
                "--timeout", "1500",
                "--greppable",          # skip nmap, greppable output only
            ],
            capture_output=True, text=True, timeout=90
        )
        ports: list[int] = []
        for line in result.stdout.splitlines():
            line = line.strip()
            # Format 1: "IP -> [p1,p2,p3]"
            m = re.search(r"->\s*\[([^\]]+)\]", line)
            if m:
                for p in m.group(1).split(","):
                    p = p.strip()
                    if p.isdigit():
                        ports.append(int(p))
                continue
            # Format 2 (old greppable): "Host: IP ()\tPorts: PORT/open/tcp//..."
            if "Ports:" in line:
                parts = line.split("Ports:", 1)[1]
                for entry in parts.split(","):
                    pm = re.match(r"\s*(\d+)/open", entry.strip())
                    if pm:
                        ports.append(int(pm.group(1)))
        return sorted(set(ports))
    except Exception as e:
        print(f"[rustscan] Error on {ip}: {e}")
        return []


# ── Ping sweep (no root) ──────────────────────────────────────────────────
def ping_host(ip: str) -> bool:
    """Return True if host responds to ping. Works on Linux/macOS without root."""
    flag = "-c" if os.name != "nt" else "-n"
    try:
        result = subprocess.run(
            ["ping", flag, "1", "-W", str(int(PING_TIMEOUT * 1000))
             if os.name != "nt" else "-w", "1", ip],
            capture_output=True, timeout=PING_TIMEOUT + 0.5
        )
        return result.returncode == 0
    except Exception:
        return False


def ping_sweep(cidr: str) -> list[str]:
    """Ping all hosts in the subnet concurrently. Returns list of live IPs."""
    try:
        network = ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        return []

    live: list[str] = []
    hosts = list(network.hosts())

    with ThreadPoolExecutor(max_workers=64) as pool:
        futures = {pool.submit(ping_host, str(ip)): str(ip) for ip in hosts}
        for future in as_completed(futures):
            ip = futures[future]
            try:
                if future.result():
                    live.append(ip)
            except Exception:
                pass

    return live


# ── ARP cache reader (no root) ────────────────────────────────────────────
def read_arp_cache() -> dict[str, str]:
    """
    Read the OS ARP cache → {ip: mac}.
    Works without root on Linux and macOS.
    """
    arp_table: dict[str, str] = {}

    # Linux: /proc/net/arp
    if os.path.exists("/proc/net/arp"):
        try:
            with open("/proc/net/arp") as f:
                for line in f.readlines()[1:]:
                    parts = line.split()
                    if len(parts) >= 4 and parts[2] != "0x0":
                        arp_table[parts[0]] = parts[3]
            return arp_table
        except Exception:
            pass

    # macOS / BSD: arp -a
    try:
        result = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=5)
        for line in result.stdout.splitlines():
            m = re.search(
                r"\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]{17})",
                line, re.IGNORECASE
            )
            if m:
                arp_table[m.group(1)] = m.group(2)
    except Exception:
        pass

    return arp_table


# ── TCP connect port scanner (no root) ───────────────────────────────────
def tcp_probe(ip: str, port: int) -> int | None:
    """Try a TCP connect to ip:port. Returns port number if open, else None."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(SCAN_TIMEOUT)
            if s.connect_ex((ip, port)) == 0:
                return port
    except Exception:
        pass
    return None


def scan_ports(ip: str, ports: list[int] = COMMON_PORTS) -> list[int]:
    """
    Discover open ports on ip.
    Tries RustScan first (fast, all 65535 ports).
    Falls back to concurrent TCP connect on COMMON_PORTS if RustScan unavailable.
    """
    rs = rustscan_ports(ip)
    if rs:
        return rs

    open_ports: list[int] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(tcp_probe, ip, p): p for p in ports}
        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                open_ports.append(result)
    return sorted(open_ports)


# ── nmap -sT service scan (no root) ──────────────────────────────────────
def nmap_service_scan(ip: str, ports: list[int]) -> dict:
    """
    Run nmap -sT (TCP connect – no root) for service/OS fingerprint.
    Falls back to an empty dict if nmap is not installed.
    """
    result = {"ip": ip, "os": "Unknown", "services": [], "vulnerabilities": []}
    if not ports:
        return result

    port_str = ",".join(str(p) for p in ports[:30])  # limit to 30 ports

    try:
        subprocess.run(["nmap", "--version"], capture_output=True, check=True, timeout=5)
    except Exception:
        return result  # nmap not available

    try:
        import nmap as nmap_lib
        nm = nmap_lib.PortScanner()
        nm.scan(ip, port_str, arguments="-sT -sV --script=banner -T4 --open")

        if ip in nm.all_hosts():
            host = nm[ip]
            if host.get("osmatch"):
                result["os"] = host["osmatch"][0]["name"]
            for proto in host.all_protocols():
                for port, svc in host[proto].items():
                    result["services"].append({
                        "port": port, "proto": proto,
                        "name": svc.get("name", ""),
                        "version": svc.get("version", ""),
                        "state": svc.get("state", ""),
                    })
    except Exception as e:
        print(f"[socket_scanner] nmap_service_scan error: {e}")

    return result


# ── Hostname resolution ───────────────────────────────────────────────────
def resolve_hostname(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ip


# ── Background scanner thread (no root) ──────────────────────────────────
class SocketScanner(threading.Thread):
    """
    Continuous no-root background scanner for Tadhamon Smart City network.

    Cycle:
      1. Ping sweep → live IPs
      2. ARP cache  → MACs
      3. TCP connect → open ports
      4. nmap -sT   → services (optional)
      5. Classify role, compute risk, save to DB, fire alerts
    """

    def __init__(self, cidr: str, interval: int = 60):
        super().__init__(daemon=True)
        self.cidr     = cidr
        self.interval = interval
        self.known: dict[str, dict] = {}  # ip → {mac, ports, role}

    def run(self):
        while True:
            try:
                self._cycle()
            except Exception as e:
                print(f"[SocketScanner] Error: {e}")
            time.sleep(self.interval)

    def _cycle(self):
        print(f"[SocketScanner] Starting fast discovery on {self.cidr} …")
        # 1. Quick Ping Sweep
        live_ips = ping_sweep(self.cidr)
        arp_cache = read_arp_cache()
        current_ips = set(live_ips)

        # 2. Process live devices
        for ip in live_ips:
            # If we already know this device and it was scanned recently, skip deep port scan
            if ip in self.known and (datetime.now() - datetime.fromisoformat(self.known[ip]['last_seen'])).total_seconds() < 3600:
                update_device_status(ip, "online")
                continue

            mac = arp_cache.get(ip, "00:00:00:00:00:00")
            hostname = resolve_hostname(ip)
            
            # Fast port scan (only common ports first)
            ports = scan_ports(ip)
            role_info = classify_device(ports, hostname)
            risk = self._risk_score(ports, role_info["role"])

            device: dict = {
                "ip":         ip,
                "mac":        mac,
                "hostname":   hostname,
                "status":     "online",
                "open_ports": ports,
                "port_count": len(ports),
                "last_seen":  datetime.now().isoformat(),
                "risk_score": risk,
                "source":     "discovered",   # real device found on the network
            }
            device.update(role_info)
            
            self.known[ip] = {
                "mac": mac, 
                "ports": ports, 
                "role": role_info["role"],
                "last_seen": device["last_seen"]
            }
            save_device(device)
            print(f"[SocketScanner] Discovered: {ip} ({role_info['label']})")

        # Devices that went offline
        for ip in list(self.known.keys()):
            if ip not in current_ips:
                update_device_status(ip, "offline")
                create_alert({
                    "src_ip":      ip,
                    "attack_type": "Device Offline",
                    "severity":    "MEDIUM",
                    "detection_method": "Ping Sweep",
                    "description": f"Device {ip} ({self.known[ip]['role']}) stopped responding",
                })
                del self.known[ip]

    @staticmethod
    def _risk_score(ports: list[int], role: str) -> int:
        score = 0
        for port in ports:
            if port in DANGEROUS_PORTS:
                sev = DANGEROUS_PORTS[port][0]
                score += {"CRITICAL": 30, "HIGH": 20, "MEDIUM": 10, "LOW": 5}.get(sev, 0)
        score += min(len(ports) * 2, 20)
        if role == "unknown_iot":
            score += 15
        return min(score, 100)
