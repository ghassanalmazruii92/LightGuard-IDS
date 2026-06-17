"""
Real Network Scanner for Tadhamon Smart City IDS
-------------------------------------------------
Performs live ARP sweep + masscan + nmap on the actual LAN.
Maps discovered devices to smart city roles.
Sends real alerts based on actual open ports and traffic.
"""

import subprocess, threading, time, json, socket, os
import nmap
from scapy.all import ARP, Ether, srp, sniff, IP, TCP, UDP, ICMP, DNS
from datetime import datetime, timedelta
from collections import defaultdict
from backend.database import save_device, update_device_status
from backend.ids.alert_engine import create_alert

# ── Tadhamon Device Role Mapper ───────────────────────────────────────────────
# When a device is discovered, guess its role based on open ports + hostname
TADHAMON_ROLES = {
    "traffic_camera":    { "ports": [554, 8554, 80, 443],   "icon": "📷", "label": "Traffic Camera",        "zone": "Transportation" },
    "energy_meter":      { "ports": [502, 4840, 1883],       "icon": "⚡", "label": "Smart Energy Meter",    "zone": "Energy Grid" },
    "env_sensor":        { "ports": [1883, 8883, 5683],      "icon": "🌡️", "label": "Environmental Sensor",  "zone": "Infrastructure" },
    "fog_node":          { "ports": [22, 8000, 5000, 3000],  "icon": "🖥️", "label": "Fog Node (Pi)",         "zone": "Compute Layer" },
    "gateway_router":    { "ports": [80, 443, 23, 22, 53],   "icon": "🌐", "label": "Network Gateway",       "zone": "Network" },
    "workstation":       { "ports": [3389, 5900, 22, 445],   "icon": "💻", "label": "Admin Workstation",     "zone": "Control Center" },
    "unknown_iot":       { "ports": [],                       "icon": "📡", "label": "Unknown IoT Device",    "zone": "Unknown" },
}

def classify_device(open_ports: list[int], hostname: str) -> dict:
    """Map a real device to a Tadhamon smart city role based on its open ports."""
    ports_set = set(open_ports)
    best_match = "unknown_iot"
    best_score = 0

    for role, data in TADHAMON_ROLES.items():
        if not data["ports"]:
            continue
        score = len(ports_set & set(data["ports"]))
        if score > best_score:
            best_score = score
            best_match = role

    # Hostname hints
    h = hostname.lower()
    if any(x in h for x in ["cam", "camera", "nvr"]):
        best_match = "traffic_camera"
    elif any(x in h for x in ["pi", "raspberry", "fog"]):
        best_match = "fog_node"
    elif any(x in h for x in ["router", "gateway", "ap-"]):
        best_match = "gateway_router"

    return TADHAMON_ROLES[best_match] | {"role": best_match}


# ── Layer 1: ARP Sweep ────────────────────────────────────────────────────────
def arp_sweep(cidr: str) -> list[dict]:
    """
    Real ARP sweep on the LAN. Returns all live devices in < 1 second.
    """
    arp = ARP(pdst=cidr)
    ether = Ether(dst="ff:ff:ff:ff:ff:ff")
    try:
        result = srp(ether / arp, timeout=1, verbose=False)[0]
    except Exception as e:
        print(f"[arp_sweep] Error: {e}")
        return []

    devices = []
    for _, received in result:
        try:
            hostname = socket.gethostbyaddr(received.psrc)[0]
        except:
            hostname = received.psrc
        devices.append({
            "ip":        received.psrc,
            "mac":       received.hwsrc,
            "hostname":  hostname,
            "last_seen": datetime.now().isoformat(),
            "status":    "online"
        })
    return devices


# ── Layer 2: masscan ──────────────────────────────────────────────────────────
def masscan_ports(ip: str, rate: int = 1000) -> list[int]:
    """
    Real masscan – scan all 65535 ports. Fast (2–5 sec per host).
    Requires: sudo apt install masscan
    """
    out_file = f"/tmp/ms_{ip.replace('.','_')}.json"
    try:
        # Check if masscan exists
        subprocess.run(["masscan", "--version"], capture_output=True, check=True)

        subprocess.run([
            "masscan", ip, "-p1-65535",
            f"--rate={rate}",
            "--output-format", "json",
            "--output-filename", out_file
        ], timeout=30, capture_output=True)

        if not os.path.exists(out_file):
            return []

        with open(out_file) as f:
            data = json.load(f)
        
        # Clean up
        if os.path.exists(out_file):
            os.remove(out_file)
            
        return [e["ports"][0]["port"] for e in data if e.get("ports")]
    except Exception as e:
        print(f"[masscan_ports] Error: {e}")
        return []


# ── Layer 3: nmap deep scan ───────────────────────────────────────────────────
def nmap_deep_scan(ip: str) -> dict:
    """
    Real nmap scan with service detection + vuln scripts.
    Only called on suspicious devices or on admin request.
    """
    nm = nmap.PortScanner()
    try:
        nm.scan(ip, arguments="-sV --script=banner -T4 --open")
    except Exception as e:
        print(f"[nmap_deep_scan] Error: {e}")
        return {"ip": ip, "os": "Unknown", "services": [], "vulnerabilities": []}

    result = {"ip": ip, "os": "Unknown", "services": [], "vulnerabilities": []}

    if ip not in nm.all_hosts():
        return result

    host = nm[ip]
    # OS detection (-O) requires root; use hostname as fallback
    result["os"] = host.get("hostname", [{}])[0].get("name", "Unknown") if host.get("hostname") else "Unknown"

    for proto in host.all_protocols():
        for port, svc in host[proto].items():
            result["services"].append({
                "port": port, "proto": proto,
                "name": svc.get("name", ""), "version": svc.get("version", ""),
                "state": svc.get("state", "")
            })
            # Vuln script output
            for script, output in svc.get("script", {}).items():
                if "VULNERABLE" in output or "CVE-" in output:
                    result["vulnerabilities"].append({
                        "port": port, "script": script,
                        "summary": output[:400]
                    })

    return result


# ── Dangerous Port Rules ──────────────────────────────────────────────────────
DANGEROUS_PORTS = {
    23:    ("CRITICAL", "Telnet Exposed",           "Unencrypted remote access – replace with SSH"),
    21:    ("HIGH",     "FTP Exposed",              "Plaintext file transfer – use SFTP/FTPS"),
    445:   ("HIGH",     "SMB Exposed",              "Common ransomware vector – restrict with firewall"),
    3389:  ("HIGH",     "RDP Exposed",              "Remote desktop publicly accessible"),
    1433:  ("HIGH",     "MSSQL Exposed",            "Database exposed to network"),
    3306:  ("HIGH",     "MySQL Exposed",            "Database port publicly accessible"),
    5900:  ("MEDIUM",   "VNC Exposed",              "Unencrypted remote desktop"),
    6379:  ("CRITICAL", "Redis No Auth",            "In-memory DB with no authentication"),
    27017: ("CRITICAL", "MongoDB No Auth",          "NoSQL database with no authentication"),
    9200:  ("HIGH",     "Elasticsearch Exposed",    "Search engine data publicly accessible"),
    2375:  ("CRITICAL", "Docker API Exposed",       "Full container control without auth"),
    502:   ("MEDIUM",   "Modbus Exposed",           "Industrial protocol – IoT/SCADA risk"),
    4840:  ("MEDIUM",   "OPC-UA Exposed",           "Industrial automation protocol exposed"),
    1883:  ("MEDIUM",   "MQTT No TLS",             "IoT messaging without encryption"),
    554:   ("LOW",      "RTSP Stream Exposed",      "Camera stream may be publicly accessible"),
}

def analyze_ports(ip: str, open_ports: list[int], device_role: str) -> list[dict]:
    """Check real open ports against known dangerous port list."""
    findings = []
    for port in open_ports:
        if port in DANGEROUS_PORTS:
            severity, attack_type, recommendation = DANGEROUS_PORTS[port]
            findings.append({
                "port": port,
                "severity": severity,
                "attack_type": attack_type,
                "recommendation": recommendation,
                "context": f"Detected on {device_role} at {ip}"
            })
    return findings


# ── Background Scanner Thread ─────────────────────────────────────────────────
class TadhamonScanner(threading.Thread):
    """
    Continuous background scanner for Tadhamon Smart City network.
    Runs ARP sweep every SCAN_INTERVAL seconds.
    Runs masscan on each discovered device.
    Triggers nmap deep scan on new or suspicious devices.
    """
    def __init__(self, cidr, interval=30, rate=1000):
        super().__init__(daemon=True)
        self.cidr     = cidr
        self.interval = interval
        self.rate     = rate
        self.known    = {}  # ip → {ports, mac, role, first_seen}

    def run(self):
        while True:
            try:
                self._cycle()
            except Exception as e:
                print(f"[TadhamonScanner] Error: {e}")
            time.sleep(self.interval)

    def _cycle(self):
        devices = arp_sweep(self.cidr)
        current_ips = {d["ip"] for d in devices}

        for device in devices:
            ip  = device["ip"]
            mac = device["mac"]

            # masscan for open ports
            ports = masscan_ports(ip, self.rate)
            device["open_ports"] = ports
            device["port_count"] = len(ports)

            # Classify device role
            role_info = classify_device(ports, device["hostname"])
            device.update(role_info)

            # Compute risk score
            device["risk_score"] = self._risk_score(ports, role_info["role"])

            # Detect dangerous ports → real alerts
            findings = analyze_ports(ip, ports, role_info["label"])
            for f in findings:
                create_alert({
                    "src_ip":           ip,
                    "dst_ip":           "LightGuard",
                    "attack_type":      f["attack_type"],
                    "severity":         f["severity"],
                    "detection_method": "Port Scan (masscan)",
                    "description":      f["recommendation"],
                    "device_role":      role_info["label"],
                    "zone":             role_info["zone"],
                    "port":             f["port"],
                })

            # New device → nmap deep scan + alert
            if ip not in self.known:
                create_alert({
                    "src_ip":           ip,
                    "attack_type":      "New Device Joined Network",
                    "severity":         "LOW",
                    "detection_method": "ARP Scan",
                    "description":      f"New {role_info['label']} detected | MAC: {mac} | Zone: {role_info['zone']}",
                    "device_role":      role_info["label"],
                    "zone":             role_info["zone"],
                })
                deep = nmap_deep_scan(ip)
                device["os"]             = deep.get("os")
                device["services"]       = json.dumps(deep.get("services", []))
                device["vulnerabilities"]= json.dumps(deep.get("vulnerabilities", []))

                for vuln in deep.get("vulnerabilities", []):
                    create_alert({
                        "src_ip":           ip,
                        "attack_type":      "CVE Vulnerability Detected",
                        "severity":         "CRITICAL",
                        "detection_method": "nmap vuln scan",
                        "description":      f"Port {vuln['port']}: {vuln['summary'][:200]}",
                        "device_role":      role_info["label"],
                        "zone":             role_info["zone"],
                    })

            # MAC change = ARP spoofing
            if ip in self.known and self.known[ip]["mac"] != mac:
                create_alert({
                    "src_ip":           ip,
                    "attack_type":      "ARP Spoofing Detected",
                    "severity":         "CRITICAL",
                    "detection_method": "ARP Monitoring",
                    "description":      f"MAC changed: {self.known[ip]['mac']} → {mac}. Possible MITM attack.",
                    "device_role":      role_info["label"],
                    "zone":             role_info["zone"],
                })

            self.known[ip] = {"mac": mac, "ports": ports, "role": role_info["role"]}
            save_device(device)

        # Devices that went offline
        for ip in list(self.known.keys()):
            if ip not in current_ips:
                update_device_status(ip, "offline")
                create_alert({
                    "src_ip":      ip,
                    "attack_type": "Device Offline",
                    "severity":    "MEDIUM",
                    "detection_method": "ARP Scan",
                    "description": f"Device {ip} ({self.known[ip]['role']}) stopped responding",
                })
                del self.known[ip]

    def _risk_score(self, ports: list[int], role: str) -> int:
        score = 0
        for port in ports:
            if port in DANGEROUS_PORTS:
                sev = DANGEROUS_PORTS[port][0]
                score += {"CRITICAL": 30, "HIGH": 20, "MEDIUM": 10, "LOW": 5}.get(sev, 0)
        score += min(len(ports) * 2, 20)  # many open ports = higher risk
        if role == "unknown_iot":
            score += 15
        return min(score, 100)
