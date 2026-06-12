"""
Real network scanner – 3 layers:
  1. ARP (Scapy)   – instant LAN device discovery
  2. masscan       – fast port sweep
  3. nmap (python-nmap) – deep scan on demand

Runs as a continuous background thread.
Every 30 seconds: ARP sweep → update device list → masscan new/changed hosts
On threat detected: trigger nmap on that specific IP
"""

import os
import subprocess
import threading
import time
import json
import nmap  # python-nmap
from scapy.all import ARP, Ether, srp
from datetime import datetime
from backend.database import save_device, update_device_status, get_db
from backend.ids.alert_engine import create_alert

# ── CONFIG ────────────────────────────────────────────────────────────────────
# Read from lightguard.env (via environment variables)

def arp_sweep(cidr: str) -> list[dict]:
    """
    Layer 1: ARP sweep – returns list of {ip, mac, hostname} in < 1 second.
    Uses Scapy broadcast ARP request.
    """
    arp = ARP(pdst=cidr)
    ether = Ether(dst="ff:ff:ff:ff:ff:ff")
    packet = ether / arp
    try:
        result = srp(packet, timeout=1, verbose=False)[0]
    except Exception as e:
        print(f"[Scanner] ARP sweep error: {e}")
        return []

    devices = []
    for sent, received in result:
        devices.append({
            "ip": received.psrc,
            "mac": received.hwsrc,
            "hostname": _resolve_hostname(received.psrc),
            "last_seen": datetime.utcnow().isoformat(),
            "status": "online"
        })
    return devices


def masscan_ports(ip: str, rate: int = 1000) -> list[int]:
    """
    Layer 2: masscan – scan all 65535 ports on a single IP.
    Returns list of open ports in 2–5 seconds.
    Requires masscan installed: sudo apt install masscan
    """
    try:
        temp_file = f"/tmp/masscan_{ip.replace('.','_')}.json"
        cmd = [
            "masscan", ip,
            "-p1-65535",
            f"--rate={rate}",
            "--output-format", "json",
            "--output-filename", temp_file
        ]
        # We might need sudo for masscan, but the prompt says:
        # "OR: run backend with sudo (simpler for Pi 5)"
        subprocess.run(cmd, timeout=30, capture_output=True)

        if not os.path.exists(temp_file):
            return []

        with open(temp_file) as f:
            data = json.load(f)

        ports = []
        for entry in data:
            if "ports" in entry:
                for p in entry["ports"]:
                    ports.append(p["port"])
        
        # Clean up
        if os.path.exists(temp_file):
            os.remove(temp_file)
            
        return ports
    except Exception as e:
        print(f"[Scanner] Masscan error for {ip}: {e}")
        return []


def nmap_deep_scan(ip: str) -> dict:
    """
    Layer 3: nmap – detailed scan on a specific IP.
    Returns OS, services, CVE hints.
    Only called when a device looks suspicious.
    Run on-demand, NOT in the background loop.
    """
    try:
        nm = nmap.PortScanner()
        nm.scan(ip, arguments="-sV -O --script=vuln -T4")

        result = {
            "ip": ip,
            "os": "Unknown",
            "services": [],
            "vulnerabilities": []
        }

        if ip in nm.all_hosts():
            host = nm[ip]

            # OS detection
            if host.get("osmatch"):
                result["os"] = host["osmatch"][0]["name"]

            # Services
            for proto in host.all_protocols():
                for port in host[proto].keys():
                    svc = host[proto][port]
                    result["services"].append({
                        "port": port,
                        "protocol": proto,
                        "service": svc.get("name", ""),
                        "version": svc.get("version", ""),
                        "state": svc.get("state", "")
                    })

            # Vuln script output
            for proto in host.all_protocols():
                for port in host[proto].keys():
                    script_output = host[proto][port].get("script", {})
                    for script_name, output in script_output.items():
                        if "VULNERABLE" in output or "CVE" in output:
                            result["vulnerabilities"].append({
                                "port": port,
                                "script": script_name,
                                "output": output[:500]  # truncate
                            })

        return result
    except Exception as e:
        print(f"[Scanner] Nmap error for {ip}: {e}")
        return {"ip": ip, "error": str(e)}


def detect_threats_from_ports(ip: str, open_ports: list[int]) -> list[str]:
    """
    Analyze open ports and flag suspicious ones.
    Returns list of threat descriptions.
    """
    threats = []

    DANGEROUS_PORTS = {
        23: "Telnet open – unencrypted remote access",
        21: "FTP open – plaintext file transfer",
        445: "SMB open – potential ransomware vector",
        3389: "RDP open – remote desktop exposed",
        1433: "MSSQL exposed",
        3306: "MySQL exposed publicly",
        5900: "VNC open – remote desktop",
        6379: "Redis open without auth",
        27017: "MongoDB open without auth",
        9200: "Elasticsearch exposed",
        2375: "Docker daemon exposed (critical)",
        8080: "HTTP proxy / admin panel exposed",
    }

    for port in open_ports:
        if port in DANGEROUS_PORTS:
            threats.append(DANGEROUS_PORTS[port])

    # Too many open ports = potential compromised device
    if len(open_ports) > 20:
        threats.append(f"Unusual: {len(open_ports)} open ports detected")

    return threats


def _resolve_hostname(ip: str) -> str:
    try:
        import socket
        return socket.gethostbyaddr(ip)[0]
    except:
        return ip


class NetworkScannerThread(threading.Thread):
    """
    Background thread – runs continuously:
    Every SCAN_INTERVAL seconds:
      1. ARP sweep → get all live devices
      2. masscan each device → get open ports
      3. Compare with last scan → detect new devices, new ports
      4. Flag threats → send to alert_engine
    """
    def __init__(self, cidr: str, interval: int = 30, masscan_rate: int = 1000):
        super().__init__(daemon=True)
        self.cidr = cidr
        self.interval = interval
        self.masscan_rate = masscan_rate
        self.previous_state = {}  # ip → {ports, mac}

    def run(self):
        while True:
            try:
                self._scan_cycle()
            except Exception as e:
                print(f"[Scanner Error] {e}")
            time.sleep(self.interval)

    def _scan_cycle(self):
        print(f"[Scanner] Starting ARP sweep on {self.cidr}")
        devices = arp_sweep(self.cidr)

        for device in devices:
            ip = device["ip"]
            
            # Port scan each device
            open_ports = masscan_ports(ip, self.masscan_rate)
            device["open_ports"] = open_ports

            # Compare with previous state
            prev = self.previous_state.get(ip, {})
            prev_ports = set(prev.get("ports", []))
            curr_ports = set(open_ports)

            new_ports = curr_ports - prev_ports
            if new_ports:
                print(f"[Scanner] New ports on {ip}: {new_ports}")
                # Trigger deep nmap scan for this IP
                deep = nmap_deep_scan(ip)
                device["os"] = deep.get("os")
                device["services"] = deep.get("services", [])

                # Check for vulnerabilities
                if deep.get("vulnerabilities"):
                    create_alert({
                        "src_ip": ip,
                        "attack_type": "Vulnerability Detected",
                        "severity": "HIGH",
                        "detection_method": "nmap-vuln-scan",
                        "description": str(deep["vulnerabilities"][:3])
                    })

            # Check dangerous ports
            threats = detect_threats_from_ports(ip, open_ports)
            for threat in threats:
                create_alert({
                    "src_ip": ip,
                    "attack_type": "Dangerous Port Exposed",
                    "severity": "HIGH",
                    "detection_method": "masscan",
                    "description": threat
                })

            # Detect new device on network
            if ip not in self.previous_state:
                create_alert({
                    "src_ip": ip,
                    "attack_type": "New Device Detected",
                    "severity": "LOW",
                    "detection_method": "arp-scan",
                    "description": f"New device: MAC {device['mac']} | Host: {device['hostname']}"
                })

            # Save/Update in DB
            save_device(device)

            self.previous_state[ip] = {
                "ports": list(curr_ports),
                "mac": device["mac"]
            }

        # Detect devices that went offline
        current_ips = {d["ip"] for d in devices}
        for ip in list(self.previous_state.keys()):
            if ip not in current_ips:
                update_device_status(ip, "offline")
                del self.previous_state[ip]
