"""
Tadhamon Smart City – Demo Seed Data
-------------------------------------
Seeds 18 realistic smart-city devices across 6 zones with real CVEs,
services, and risk profiles. Also seeds demo alerts tied to those devices.

Run at startup if the devices table is empty.
"""

import copy
import json
import os
import random
import re
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.database import SessionLocal, Device, Alert, Severity, Vlan, FirewallRule

_ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


def _has_arabic(text: str | None) -> bool:
    if not text:
        return False
    return _ARABIC_RE.search(text) is not None

# ── Device Definitions ────────────────────────────────────────────────────
TADHAMON_DEVICES = [

    # ── Transportation Zone ───────────────────────────────────────────────
    {
        "ip": "192.168.10.11",
        "mac": "a4:23:05:3c:01:11",
        "hostname": "cam-traffic-01",
        "role": "traffic_camera",
        "label": "Traffic camera – Main intersection",
        "zone": "Transportation",
        "icon": "📷",
        "os": "Embedded Linux 3.4 (Hikvision DS-2CD2143)",
        "status": "online",
        "trusted": False,
        "open_ports": [80, 443, 554, 8000],
        "services": [
            {"port": 80,  "proto": "tcp", "name": "http",  "version": "Boa 0.94.14rc21", "state": "open"},
            {"port": 554, "proto": "tcp", "name": "rtsp",  "version": "Hikvision RTSP 2.0", "state": "open"},
            {"port": 8000,"proto": "tcp", "name": "http",  "version": "Hikvision Web", "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 8000,
                "script": "CVE-2021-36260",
                "severity": "CRITICAL",
                "summary": "Hikvision command injection: an attacker can run arbitrary OS commands on the camera without authentication via /SDK/webLanguage. CVSS 9.8.",
                "cve": "CVE-2021-36260",
                "recommendation": "Upgrade firmware to 5.5.800 or newer immediately."
            },
            {
                "port": 554,
                "script": "RTSP-NoAuth",
                "severity": "HIGH",
                "summary": "RTSP stream exposed without a password—anyone on the LAN can view live video at rtsp://192.168.10.11/stream.",
                "cve": None,
                "recommendation": "Enable RTSP authentication in the camera settings."
            },
        ],
        "risk_score": 85,
    },
    {
        "ip": "192.168.10.12",
        "mac": "a4:23:05:3c:01:12",
        "hostname": "cam-traffic-02",
        "role": "traffic_camera",
        "label": "Traffic camera – Highway",
        "zone": "Transportation",
        "icon": "📷",
        "os": "Embedded Linux 3.4 (Dahua IPC-HFW2831S)",
        "status": "online",
        "trusted": False,
        "open_ports": [80, 554, 37777],
        "services": [
            {"port": 80,    "proto": "tcp", "name": "http",  "version": "Dahua Web 3.0", "state": "open"},
            {"port": 554,   "proto": "tcp", "name": "rtsp",  "version": "Dahua RTSP",    "state": "open"},
            {"port": 37777, "proto": "tcp", "name": "dahua", "version": "Dahua SDK",      "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 37777,
                "script": "CVE-2021-33044",
                "severity": "CRITICAL",
                "summary": "Dahua authentication bypass allows full auth bypass and leakage of stored credentials. CVSS 9.8.",
                "cve": "CVE-2021-33044",
                "recommendation": "Update firmware and disable remote access if not required."
            },
        ],
        "risk_score": 78,
    },
    {
        "ip": "192.168.10.13",
        "mac": "b8:27:eb:ff:10:13",
        "hostname": "traffic-light-ctrl-01",
        "role": "unknown_iot",
        "label": "Traffic signal controller",
        "zone": "Transportation",
        "icon": "🚦",
        "os": "Raspberry Pi OS (Buster)",
        "status": "online",
        "trusted": True,
        "open_ports": [22, 80, 8080],
        "services": [
            {"port": 22,   "proto": "tcp", "name": "ssh",  "version": "OpenSSH 7.9", "state": "open"},
            {"port": 8080, "proto": "tcp", "name": "http", "version": "nginx 1.14",  "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 22,
                "script": "SSH-DefaultCreds",
                "severity": "HIGH",
                "summary": "SSH accepts default password 'raspberry'—pi:raspberry login succeeded. An attacker gains full control of the signal controller.",
                "cve": None,
                "recommendation": "Change the password immediately and use SSH keys only."
            },
        ],
        "risk_score": 55,
    },

    # ── Energy Grid Zone ──────────────────────────────────────────────────
    {
        "ip": "192.168.20.11",
        "mac": "00:50:c2:82:20:11",
        "hostname": "smart-meter-01",
        "role": "energy_meter",
        "label": "Smart meter – North zone",
        "zone": "Energy Grid",
        "icon": "⚡",
        "os": "FreeRTOS 10.4 (Landis+Gyr E650)",
        "status": "online",
        "trusted": False,
        "open_ports": [502, 80],
        "services": [
            {"port": 502, "proto": "tcp", "name": "modbus", "version": "Modbus/TCP",     "state": "open"},
            {"port": 80,  "proto": "tcp", "name": "http",   "version": "Embedded HTTP",  "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 502,
                "script": "Modbus-NoAuth",
                "severity": "HIGH",
                "summary": "Modbus/TCP exposed with no authentication—attackers can read/write energy registers, enabling billing fraud or outages.",
                "cve": None,
                "recommendation": "Apply Modbus security extensions or firewall TCP/502."
            },
            {
                "port": 502,
                "script": "CVE-2019-10997",
                "severity": "MEDIUM",
                "summary": "Modbus stack overflow on some legacy meters causes DoS when a crafted function code is sent. CVSS 7.5.",
                "cve": "CVE-2019-10997",
                "recommendation": "Update the meter firmware."
            },
        ],
        "risk_score": 72,
    },
    {
        "ip": "192.168.20.12",
        "mac": "00:50:c2:82:20:12",
        "hostname": "smart-meter-02",
        "role": "energy_meter",
        "label": "Smart meter – South zone",
        "zone": "Energy Grid",
        "icon": "⚡",
        "os": "FreeRTOS 10.4 (Itron OpenWay)",
        "status": "online",
        "trusted": True,
        "open_ports": [502, 4840],
        "services": [
            {"port": 502,  "proto": "tcp", "name": "modbus", "version": "Modbus/TCP",  "state": "open"},
            {"port": 4840, "proto": "tcp", "name": "opc-ua", "version": "OPC-UA 1.04", "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 4840,
                "script": "OPC-UA-NoTLS",
                "severity": "MEDIUM",
                "summary": "OPC-UA server without TLS—industrial automation traffic is plaintext and vulnerable to sniffing.",
                "cve": None,
                "recommendation": "Enable Security Mode SignAndEncrypt in OPC-UA."
            },
        ],
        "risk_score": 45,
    },
    {
        "ip": "192.168.20.21",
        "mac": "00:50:c2:82:20:21",
        "hostname": "power-distribution-01",
        "role": "energy_meter",
        "label": "Primary power distribution unit",
        "zone": "Energy Grid",
        "icon": "🔌",
        "os": "VxWorks 7.0 (Schneider Electric PM8000)",
        "status": "online",
        "trusted": True,
        "open_ports": [80, 443, 502, 21],
        "services": [
            {"port": 21,  "proto": "tcp", "name": "ftp",    "version": "Schneider FTP 1.0", "state": "open"},
            {"port": 502, "proto": "tcp", "name": "modbus", "version": "Modbus/TCP",        "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 21,
                "script": "FTP-Exposed",
                "severity": "HIGH",
                "summary": "FTP exposed—file transfers are unencrypted. Credentials and data are sent in cleartext.",
                "cve": None,
                "recommendation": "Replace FTP with SFTP or FTPS immediately."
            },
        ],
        "risk_score": 60,
    },

    # ── Infrastructure Zone ───────────────────────────────────────────────
    {
        "ip": "192.168.30.11",
        "mac": "54:10:ec:ff:30:11",
        "hostname": "env-sensor-air-01",
        "role": "env_sensor",
        "label": "Air quality sensor – Central park",
        "zone": "Infrastructure",
        "icon": "🌡️",
        "os": "Contiki-NG 4.7 (ST Nucleo L073RZ)",
        "status": "online",
        "trusted": False,
        "open_ports": [1883, 80],
        "services": [
            {"port": 1883, "proto": "tcp", "name": "mqtt", "version": "Mosquitto 1.6", "state": "open"},
            {"port": 80,   "proto": "tcp", "name": "http", "version": "lwIP 2.1",      "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 1883,
                "script": "MQTT-NoTLS-NoAuth",
                "severity": "HIGH",
                "summary": "MQTT broker open without TLS or auth on 1883—any host can subscribe to all topics or publish fake readings.",
                "cve": None,
                "recommendation": "Move to MQTT TLS on port 8883 and add ACLs."
            },
            {
                "port": 1883,
                "script": "CVE-2020-13224",
                "severity": "MEDIUM",
                "summary": "Mosquitto MQTT DoS—a malformed PUBLISH can crash the broker. CVSS 7.5.",
                "cve": "CVE-2020-13224",
                "recommendation": "Upgrade Mosquitto to 1.6.11 or newer."
            },
        ],
        "risk_score": 68,
    },
    {
        "ip": "192.168.30.12",
        "mac": "54:10:ec:ff:30:12",
        "hostname": "env-sensor-water-01",
        "role": "env_sensor",
        "label": "Water monitoring sensor",
        "zone": "Infrastructure",
        "icon": "💧",
        "os": "FreeRTOS 10.4 (ESP32 DevKit)",
        "status": "online",
        "trusted": True,
        "open_ports": [1883, 8883],
        "services": [
            {"port": 8883, "proto": "tcp", "name": "mqtt-tls", "version": "Mosquitto 2.0 TLS", "state": "open"},
        ],
        "vulnerabilities": [],
        "risk_score": 15,
    },
    {
        "ip": "192.168.30.20",
        "mac": "54:10:ec:ff:30:20",
        "hostname": "water-pump-ctrl-01",
        "role": "env_sensor",
        "label": "Water pump controller",
        "zone": "Infrastructure",
        "icon": "🔧",
        "os": "Embedded Linux 4.19 (Siemens LOGO! 8)",
        "status": "online",
        "trusted": False,
        "open_ports": [102, 502, 80],
        "services": [
            {"port": 102, "proto": "tcp", "name": "s7comm", "version": "S7comm (Siemens)", "state": "open"},
            {"port": 502, "proto": "tcp", "name": "modbus", "version": "Modbus/TCP",       "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 102,
                "script": "S7Comm-NoAuth",
                "severity": "CRITICAL",
                "summary": "S7comm (Siemens PLC) exposed without authentication—remote start/stop of pumps. Similar risks featured in Stuxnet-style attacks.",
                "cve": None,
                "recommendation": "Isolate the PLC in a dedicated VLAN with strict firewall rules."
            },
        ],
        "risk_score": 90,
    },

    # ── Compute Layer ─────────────────────────────────────────────────────
    {
        "ip": "192.168.40.11",
        "mac": "b8:27:eb:40:10:11",
        "hostname": "fog-node-01",
        "role": "fog_node",
        "label": "Fog Node – Central compute #1",
        "zone": "Compute Layer",
        "icon": "🖥️",
        "os": "Ubuntu Server 20.04 LTS (Raspberry Pi 4)",
        "status": "online",
        "trusted": True,
        "open_ports": [22, 80, 8000, 5000],
        "services": [
            {"port": 22,   "proto": "tcp", "name": "ssh",  "version": "OpenSSH 8.2p1", "state": "open"},
            {"port": 8000, "proto": "tcp", "name": "http", "version": "uvicorn 0.18",   "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 22,
                "script": "CVE-2023-38408",
                "severity": "CRITICAL",
                "summary": "OpenSSH RCE via ssh-agent—a crafted SSH session may execute arbitrary code. CVSS 9.8.",
                "cve": "CVE-2023-38408",
                "recommendation": "Upgrade OpenSSH to 9.3p2 or newer immediately."
            },
        ],
        "risk_score": 65,
    },
    {
        "ip": "192.168.40.12",
        "mac": "b8:27:eb:40:10:12",
        "hostname": "fog-node-02",
        "role": "fog_node",
        "label": "Fog Node – Central compute #2",
        "zone": "Compute Layer",
        "icon": "🖥️",
        "os": "Debian 11 (x86_64)",
        "status": "online",
        "trusted": True,
        "open_ports": [22, 6379, 8080],
        "services": [
            {"port": 22,   "proto": "tcp", "name": "ssh",   "version": "OpenSSH 8.4p1",  "state": "open"},
            {"port": 6379, "proto": "tcp", "name": "redis", "version": "Redis 6.2.6",    "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 6379,
                "script": "Redis-NoAuth",
                "severity": "CRITICAL",
                "summary": "Redis listening on the network with no password—read/write cache data; RCE possible via cron or authorized_keys.",
                "cve": None,
                "recommendation": "Bind Redis to 127.0.0.1 and set requirepass in redis.conf."
            },
            {
                "port": 6379,
                "script": "CVE-2022-0543",
                "severity": "CRITICAL",
                "summary": "Redis Lua sandbox escape allows host code execution on affected Debian/Ubuntu installs. CVSS 10.0.",
                "cve": "CVE-2022-0543",
                "recommendation": "Upgrade Redis to 6.2.7+ and disable EVAL if not needed."
            },
        ],
        "risk_score": 95,
    },
    {
        "ip": "192.168.40.21",
        "mac": "b8:27:eb:40:10:21",
        "hostname": "fog-node-03",
        "role": "fog_node",
        "label": "Fog Node – Docker Host",
        "zone": "Compute Layer",
        "icon": "🐳",
        "os": "Ubuntu 22.04 LTS + Docker 24",
        "status": "online",
        "trusted": False,
        "open_ports": [22, 2375, 8080],
        "services": [
            {"port": 2375, "proto": "tcp", "name": "docker", "version": "Docker 24.0 (HTTP)", "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 2375,
                "script": "Docker-API-Exposed",
                "severity": "CRITICAL",
                "summary": "Docker API exposed without TLS or auth—full control of the engine; deploy containers or reach host files. CVSS 10.0.",
                "cve": None,
                "recommendation": "Close port 2375; use Docker TLS on 2376 with client certificates."
            },
        ],
        "risk_score": 100,
    },

    # ── Network Zone ──────────────────────────────────────────────────────
    {
        "ip": "192.168.50.1",
        "mac": "c4:e9:84:10:01:01",
        "hostname": "gateway-main",
        "role": "gateway_router",
        "label": "Primary gateway – Tadhamon",
        "zone": "Network",
        "icon": "🌐",
        "os": "MikroTik RouterOS 6.49",
        "status": "online",
        "trusted": True,
        "open_ports": [22, 23, 80, 443, 8291],
        "services": [
            {"port": 23,   "proto": "tcp", "name": "telnet",  "version": "MikroTik Telnet", "state": "open"},
            {"port": 8291, "proto": "tcp", "name": "winbox",  "version": "MikroTik Winbox", "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 23,
                "script": "Telnet-Exposed",
                "severity": "CRITICAL",
                "summary": "Telnet enabled on the gateway—credentials traverse the LAN in cleartext and can be sniffed.",
                "cve": None,
                "recommendation": "Disable Telnet; use SSH only."
            },
            {
                "port": 8291,
                "script": "CVE-2018-14847",
                "severity": "CRITICAL",
                "summary": "MikroTik Winbox arbitrary file read—user database (/flash/rw/store/user.dat) without auth. CVSS 9.1; widely exploited.",
                "cve": "CVE-2018-14847",
                "recommendation": "Upgrade RouterOS to 6.49.9+ and restrict external Winbox."
            },
        ],
        "risk_score": 92,
    },
    {
        "ip": "192.168.50.2",
        "mac": "c4:e9:84:10:01:02",
        "hostname": "switch-core-01",
        "role": "gateway_router",
        "label": "Core switch – Distribution layer",
        "zone": "Network",
        "icon": "🔀",
        "os": "Cisco IOS 15.2 (Catalyst 2960-X)",
        "status": "online",
        "trusted": True,
        "open_ports": [22, 23, 161, 443],
        "services": [
            {"port": 23,  "proto": "tcp", "name": "telnet", "version": "Cisco IOS Telnet", "state": "open"},
            {"port": 161, "proto": "udp", "name": "snmp",   "version": "SNMPv1/v2c",       "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 161,
                "script": "SNMP-Community-Public",
                "severity": "HIGH",
                "summary": "SNMP v1/v2c with default community 'public'—full network discovery (topology, MAC table, routing).",
                "cve": None,
                "recommendation": "Migrate to SNMPv3 with authentication and encryption."
            },
        ],
        "risk_score": 58,
    },

    # ── Control Center ────────────────────────────────────────────────────
    {
        "ip": "192.168.99.11",
        "mac": "18:66:da:99:10:11",
        "hostname": "workstation-ops-01",
        "role": "workstation",
        "label": "Primary operations workstation",
        "zone": "Control Center",
        "icon": "💻",
        "os": "Windows 10 Pro 21H2 (Build 19044)",
        "status": "online",
        "trusted": True,
        "open_ports": [135, 139, 445, 3389],
        "services": [
            {"port": 3389, "proto": "tcp", "name": "rdp",  "version": "Microsoft RDP 10.0", "state": "open"},
            {"port": 445,  "proto": "tcp", "name": "smb",  "version": "SMB 2.1",             "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 3389,
                "script": "CVE-2019-0708",
                "severity": "CRITICAL",
                "summary": "BlueKeep—pre-auth RDP remote code execution; SYSTEM privileges. CVSS 9.8; wormable.",
                "cve": "CVE-2019-0708",
                "recommendation": "Install KB4499175 and never expose RDP to the internet."
            },
            {
                "port": 445,
                "script": "CVE-2017-0144",
                "severity": "CRITICAL",
                "summary": "EternalBlue—SMB remote code execution; used in WannaCry 2017. CVSS 8.1.",
                "cve": "CVE-2017-0144",
                "recommendation": "Apply MS17-010 and disable SMBv1."
            },
        ],
        "risk_score": 98,
    },
    {
        "ip": "192.168.99.12",
        "mac": "18:66:da:99:10:12",
        "hostname": "workstation-ops-02",
        "role": "workstation",
        "label": "Security analyst workstation",
        "zone": "Control Center",
        "icon": "💻",
        "os": "Windows 11 Pro 22H2",
        "status": "online",
        "trusted": True,
        "open_ports": [135, 3389],
        "services": [
            {"port": 3389, "proto": "tcp", "name": "rdp", "version": "Microsoft RDP 10.0", "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 3389,
                "script": "RDP-WeakAuth",
                "severity": "MEDIUM",
                "summary": "RDP without Network Level Authentication—brute-force attempts hit the login screen directly.",
                "cve": None,
                "recommendation": "Enable NLA in System Properties → Remote Desktop."
            },
        ],
        "risk_score": 40,
    },
    {
        "ip": "192.168.99.20",
        "mac": "18:66:da:99:20:20",
        "hostname": "scada-server-01",
        "role": "workstation",
        "label": "SCADA server – Facilities management",
        "zone": "Control Center",
        "icon": "🏭",
        "os": "Windows Server 2019 + SCADA Pro 8.5",
        "status": "online",
        "trusted": True,
        "open_ports": [80, 443, 1433, 4840],
        "services": [
            {"port": 1433, "proto": "tcp", "name": "mssql", "version": "SQL Server 2019", "state": "open"},
            {"port": 4840, "proto": "tcp", "name": "opc-ua","version": "OPC-UA 1.04",     "state": "open"},
        ],
        "vulnerabilities": [
            {
                "port": 1433,
                "script": "MSSQL-Exposed",
                "severity": "HIGH",
                "summary": "SQL Server reachable network-wide—sensitive SCADA database exposed from any internal host.",
                "cve": None,
                "recommendation": "Restrict SQL Server to known IPs via Windows Firewall."
            },
        ],
        "risk_score": 75,
    },
]

TADHAMON_SEED_IPS = frozenset(d["ip"] for d in TADHAMON_DEVICES)

# (src_ip, dst_ip, attack_type, severity, detection_method, description, zone, device_role)
TADHAMON_DEMO_ALERT_TEMPLATES = (
    ("192.168.10.11", "192.168.99.11", "CVE-2021-36260 Exploit Attempt",
     "CRITICAL", "Signature",
     "Attempted exploitation of Hikvision command injection on the main-intersection camera.",
     "Transportation", "Traffic Camera"),
    ("192.168.40.12", "192.168.50.1", "Redis Unauthorized Access",
     "CRITICAL", "Port Scan (TCP connect)",
     "Redis 6379 exposed without authentication on Fog Node-02.",
     "Compute Layer", "Fog Node (Pi)"),
    ("192.168.50.1", "192.168.99.11", "Telnet Unencrypted Session",
     "CRITICAL", "Signature",
     "Active Telnet session on the primary gateway—credentials exposed.",
     "Network", "Network Gateway"),
    ("192.168.40.21", "192.168.50.1", "Docker API Exposed",
     "CRITICAL", "Port Scan (TCP connect)",
     "Docker Engine API exposed without TLS on Fog Node-03.",
     "Compute Layer", "Fog Node (Pi)"),
    ("192.168.99.11", "192.168.50.2", "EternalBlue Scan Detected",
     "CRITICAL", "AI",
     "SMBv1 scan from operations workstation—possible WannaCry-style activity.",
     "Control Center", "Admin Workstation"),
    ("192.168.30.20", "192.168.20.11", "S7comm PLC Access",
     "CRITICAL", "Signature",
     "Unauthorized S7comm connection to the pump controller.",
     "Infrastructure", "Environmental Sensor"),
    ("192.168.10.12", "192.168.99.12", "RTSP Stream Access Attempt",
     "HIGH", "Signature",
     "Attempt to access highway traffic camera RTSP without authentication.",
     "Transportation", "Traffic Camera"),
    ("192.168.20.21", "192.168.40.11", "FTP Plain-text Transfer",
     "HIGH", "Signature",
     "Cleartext FTP file transfer from the power distribution unit.",
     "Energy Grid", "Smart Energy Meter"),
    ("192.168.30.11", "192.168.50.1", "MQTT Topic Enumeration",
     "HIGH", "AI",
     "Subscription to all MQTT topics (#) from an unknown IP.",
     "Infrastructure", "Environmental Sensor"),
    ("192.168.10.13", "192.168.99.11", "SSH Brute Force",
     "HIGH", "Signature",
     "15 failed SSH logins to the traffic controller in 10 seconds.",
     "Transportation", "Traffic Camera"),
    ("192.168.50.2", "192.168.40.12", "SNMP Public Community String",
     "HIGH", "Port Scan (TCP connect)",
     "Core switch still uses default SNMP community 'public'.",
     "Network", "Network Gateway"),
    ("192.168.20.11", "192.168.50.1", "Modbus Write Register",
     "MEDIUM", "Signature",
     "Attempted Modbus register write on the north-zone meter.",
     "Energy Grid", "Smart Energy Meter"),
    ("192.168.99.12", "192.168.40.21", "Port Scan",
     "MEDIUM", "AI",
     "Port scan originating from the security analyst workstation.",
     "Control Center", "Admin Workstation"),
    ("192.168.30.12", "192.168.20.12", "New Device Joined Network",
     "LOW", "Ping Sweep",
     "New device joined the infrastructure segment.",
     "Infrastructure", "Environmental Sensor"),
    ("192.168.40.11", "192.168.50.1", "Unusual Outbound Traffic",
     "MEDIUM", "AI",
     "Unusual outbound traffic from Fog Node-01 outside business hours.",
     "Compute Layer", "Fog Node (Pi)"),
)

TADHAMON_DEMO_ATTACK_TYPES = frozenset(t[2] for t in TADHAMON_DEMO_ALERT_TEMPLATES)


# ── Demo Alerts ──────────────────────────────────────────────────────────
def _make_demo_alerts(_devices: list[dict] | None = None) -> list[dict]:
    """Generate realistic demo alerts tied to the seeded devices."""
    alerts = []
    now = datetime.now()

    for i, (src, dst, attack, severity, method, desc, zone, role) in enumerate(TADHAMON_DEMO_ALERT_TEMPLATES):
        hours_ago = random.randint(0, 23)
        minutes_ago = random.randint(0, 59)
        ts = now - timedelta(hours=hours_ago, minutes=minutes_ago)
        alerts.append({
            "src_ip": src, "dst_ip": dst,
            "protocol": "TCP",
            "attack_type": attack,
            "severity": severity,
            "detection_method": method,
            "raw_payload": f"[Demo Alert #{i+1}] {desc}",
            "device_role": role,
            "zone": zone,
            "is_simulation": False,
            "timestamp": ts,
        })

    return alerts


def _decrypt_payload_if_any(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        from backend.security.encryption import decrypt
        return decrypt(raw) or raw
    except Exception:
        return raw


def _alert_text_needs_refresh(alert: Alert) -> bool:
    if _has_arabic(alert.attack_type) or _has_arabic(alert.scenario_data):
        return True
    combined = _decrypt_payload_if_any(alert.raw_payload)
    return _has_arabic(combined)


def _device_text_needs_refresh(device: Device) -> bool:
    if _has_arabic(device.label) or _has_arabic(device.hostname) or _has_arabic(device.os):
        return True
    for blob in (device.vulnerabilities, device.services, device.open_ports):
        if _has_arabic(blob):
            return True
    return False


def _db_demo_locale_stale(db: Session) -> bool:
    if os.getenv("LIGHTGUARD_RESEED_ENGLISH", "").lower() in ("1", "true", "yes"):
        return True
    for d in db.query(Device).filter(Device.ip.in_(TADHAMON_SEED_IPS)).all():
        if _device_text_needs_refresh(d):
            return True
    for d in db.query(Device).filter(Device.source == "seed").all():
        if d.ip not in TADHAMON_SEED_IPS and _device_text_needs_refresh(d):
            return True
    for a in db.query(Alert).filter(Alert.is_simulation == True).all():  # noqa: E712
        if _alert_text_needs_refresh(a):
            return True
    q_demo = db.query(Alert).filter(
        Alert.src_ip.in_(TADHAMON_SEED_IPS),
        Alert.attack_type.in_(TADHAMON_DEMO_ATTACK_TYPES),
    )
    for a in q_demo.all():
        if _alert_text_needs_refresh(a):
            return True
    return False


def sync_tadhamon_demo_locale_if_needed() -> None:
    """
    SQLite keeps old demo rows after locale changes in code. Refresh canonical
    seed devices and replace demo + simulation alerts when Arabic (or other
    stale non-English demo text) is detected, or when LIGHTGUARD_RESEED_ENGLISH=1.
    """
    db = SessionLocal()
    try:
        if not _db_demo_locale_stale(db):
            return
        print("[seeds] Refreshing Tadhamon demo data to current English locale…")

        for template in TADHAMON_DEVICES:
            dev_data = copy.deepcopy(template)
            services = dev_data.pop("services", [])
            vulnerabilities = dev_data.pop("vulnerabilities", [])
            open_ports = dev_data.pop("open_ports", [])
            trusted = dev_data.pop("trusted", False)
            status = dev_data.pop("status", "online")
            ip = dev_data["ip"]
            fields = {
                **dev_data,
                "open_ports": json.dumps(open_ports),
                "services": json.dumps(services),
                "vulnerabilities": json.dumps(vulnerabilities),
                "trusted": trusted,
                "status": status,
                "source": "seed",
            }
            row = db.query(Device).filter(Device.ip == ip).first()
            if row:
                for k, v in fields.items():
                    setattr(row, k, v)
            else:
                db.add(Device(
                    **fields,
                    first_seen=datetime.now() - timedelta(days=random.randint(10, 90)),
                    last_seen=datetime.now() - timedelta(minutes=random.randint(0, 30)),
                ))

        db.query(Alert).filter(Alert.is_simulation == True).delete(synchronize_session=False)  # noqa: E712
        db.query(Alert).filter(Alert.raw_payload.like("[Demo Alert%")).delete(synchronize_session=False)
        db.query(Alert).filter(
            Alert.src_ip.in_(TADHAMON_SEED_IPS),
            Alert.attack_type.in_(TADHAMON_DEMO_ATTACK_TYPES),
        ).delete(synchronize_session=False)

        db.commit()

        alert_dicts = _make_demo_alerts()
        for a in alert_dicts:
            severity_str = a.pop("severity")
            severity_map = {
                "CRITICAL": Severity.CRITICAL,
                "HIGH": Severity.HIGH,
                "MEDIUM": Severity.MEDIUM,
                "LOW": Severity.LOW,
            }
            db.add(Alert(
                severity=severity_map.get(severity_str, Severity.MEDIUM),
                **a,
            ))
        db.commit()
        print(f"[seeds] Re-inserted {len(alert_dicts)} English demo alerts; cleared stale simulation rows.")
    except Exception as e:
        db.rollback()
        print(f"[seeds] Error refreshing demo locale: {e}")
        raise
    finally:
        db.close()


def sync_control_center_vlan99_if_needed() -> None:
    """Move stale Control Center seed rows from VLAN 50 IPs to VLAN 99 IPs."""
    replacements = {
        "192.168.50.10": ("192.168.99.11", "18:66:da:99:10:11"),
        "192.168.50.11": ("192.168.99.12", "18:66:da:99:10:12"),
        "192.168.50.20": ("192.168.99.20", "18:66:da:99:20:20"),
    }
    alert_ip_map = {
        "192.168.50.10": "192.168.99.11",
        "192.168.50.11": "192.168.99.12",
        "192.168.50.20": "192.168.99.20",
    }
    db = SessionLocal()
    changed = False
    try:
        for old_ip, (new_ip, new_mac) in replacements.items():
            old = db.query(Device).filter(Device.ip == old_ip).first()
            if old:
                existing_new = db.query(Device).filter(Device.ip == new_ip).first()
                if existing_new:
                    db.delete(old)
                else:
                    old.ip = new_ip
                    old.mac = new_mac
                    old.zone = "Control Center"
                    old.source = old.source or "seed"
                changed = True

        for old_ip, new_ip in alert_ip_map.items():
            for alert in db.query(Alert).filter(Alert.src_ip == old_ip).all():
                alert.src_ip = new_ip
                changed = True
            for alert in db.query(Alert).filter(Alert.dst_ip == old_ip).all():
                alert.dst_ip = new_ip
                changed = True

        if changed:
            db.commit()
            print("[seeds] Synced Control Center devices to VLAN 99 IP plan.")
    except Exception as e:
        db.rollback()
        print(f"[seeds] Control Center VLAN 99 sync failed: {e}")
    finally:
        db.close()


# ── Main seed function ────────────────────────────────────────────────────
def seed_tadhamon_data(force: bool = False):
    """
    Seed the database with Tadhamon Smart City demo data.
    Skips if devices already exist (unless force=True).
    """
    db: Session = SessionLocal()
    try:
        existing = db.query(Device).count()
        if existing > 0 and not force:
            print(f"[seeds] DB already has {existing} devices – skipping seed.")
            return

        if force:
            db.query(Device).delete()
            db.commit()

        print("[seeds] Seeding Tadhamon Smart City demo data…")

        for template in TADHAMON_DEVICES:
            dev_data = copy.deepcopy(template)
            services = dev_data.pop("services", [])
            vulnerabilities = dev_data.pop("vulnerabilities", [])
            open_ports = dev_data.pop("open_ports", [])
            trusted = dev_data.pop("trusted", False)
            status = dev_data.pop("status", "online")

            device = Device(
                **dev_data,
                open_ports=json.dumps(open_ports),
                services=json.dumps(services),
                vulnerabilities=json.dumps(vulnerabilities),
                trusted=trusted,
                status=status,
                source="seed",
                first_seen=datetime.now() - timedelta(days=random.randint(10, 90)),
                last_seen=datetime.now() - timedelta(minutes=random.randint(0, 30)),
            )
            db.add(device)

        db.commit()
        print(f"[seeds] Seeded {len(TADHAMON_DEVICES)} devices.")

        # Seed demo alerts
        existing_alerts = db.query(Alert).count()
        if existing_alerts < 50:
            alert_dicts = _make_demo_alerts()
            for a in alert_dicts:
                severity_str = a.pop("severity")
                severity_map = {
                    "CRITICAL": Severity.CRITICAL,
                    "HIGH": Severity.HIGH,
                    "MEDIUM": Severity.MEDIUM,
                    "LOW": Severity.LOW,
                }
                alert = Alert(
                    severity=severity_map.get(severity_str, Severity.MEDIUM),
                    **a,
                )
                db.add(alert)
            db.commit()
            print(f"[seeds] Seeded {len(alert_dicts)} demo alerts.")

    except Exception as e:
        db.rollback()
        print(f"[seeds] Error seeding data: {e}")
        raise
    finally:
        db.close()


# ── VLAN + Firewall seed ───────────────────────────────────────────────────

TADHAMON_VLANS = [
    {"vlan_id": 10, "name": "Transportation", "cidr": "192.168.10.0/24",
     "color": "#F59E0B", "zone": "Transportation"},
    {"vlan_id": 20, "name": "Energy Grid",    "cidr": "192.168.20.0/24",
     "color": "#EF4444", "zone": "Energy Grid"},
    {"vlan_id": 30, "name": "Infrastructure", "cidr": "192.168.30.0/24",
     "color": "#3B82F6", "zone": "Infrastructure"},
    {"vlan_id": 40, "name": "Compute Layer",  "cidr": "192.168.40.0/24",
     "color": "#8B5CF6", "zone": "Compute Layer"},
    {"vlan_id": 50, "name": "Network",        "cidr": "192.168.50.0/24",
     "color": "#06B6D4", "zone": "Network"},
    {"vlan_id": 99, "name": "Control Center", "cidr": "192.168.99.0/24",
     "color": "#0D9488", "zone": "Control Center"},
]

TADHAMON_FIREWALL_RULES = [
    # Control Center → everything: allow
    {"src_zone": "Control Center", "dst_zone": "*",
     "protocol": "*", "port": None, "action": "allow",
     "priority": 10, "description": "Control Center can reach all zones"},
    # Deny Transportation ↔ Energy direct traffic
    {"src_zone": "Transportation", "dst_zone": "Energy Grid",
     "protocol": "*", "port": None, "action": "deny",
     "priority": 20, "description": "Block cross-zone lateral movement"},
    # Allow all zones → Fog (Compute) on specific ports
    {"src_zone": "*", "dst_zone": "Compute Layer",
     "protocol": "TCP", "port": 8001, "action": "allow",
     "priority": 30, "description": "Fog Node ingest port"},
    # Allow HTTPS to Infrastructure
    {"src_zone": "*", "dst_zone": "Infrastructure",
     "protocol": "TCP", "port": 443, "action": "allow",
     "priority": 40, "description": "HTTPS to Infrastructure sensors"},
    # Block Telnet everywhere
    {"src_zone": "*", "dst_zone": "*",
     "protocol": "TCP", "port": 23, "action": "deny",
     "priority": 50, "description": "Block Telnet (insecure)"},
    # Default allow inter-zone
    {"src_zone": "*", "dst_zone": "*",
     "protocol": "*", "port": None, "action": "allow",
     "priority": 999, "description": "Default allow"},
]


def seed_network_topology(force: bool = False):
    """Seed VLAN and Firewall rule tables. Safe to call multiple times."""
    db: Session = SessionLocal()
    try:
        existing_vlans = db.query(Vlan).count()
        if existing_vlans > 0 and not force:
            print(f"[seeds] VLANs already seeded ({existing_vlans}) – skipping.")
            return

        if force:
            db.query(FirewallRule).delete()
            db.query(Vlan).delete()
            db.commit()

        for v in TADHAMON_VLANS:
            db.add(Vlan(**v))
        for r in TADHAMON_FIREWALL_RULES:
            db.add(FirewallRule(**r))

        db.commit()
        print(f"[seeds] Seeded {len(TADHAMON_VLANS)} VLANs and "
              f"{len(TADHAMON_FIREWALL_RULES)} firewall rules.")

    except Exception as e:
        db.rollback()
        print(f"[seeds] Error seeding network topology: {e}")
    finally:
        db.close()


# ── Demo Users seed ───────────────────────────────────────────────────────

DEMO_USERS = [
    # username       password          role
    ("admin",       "lightguard123",  "ADMIN"),
    ("analyst",     "analyst123",     "ANALYST"),
    ("monitor",     "monitor123",     "MONITOR"),
    ("technical",   "technical123",   "TECHNICAL"),
    ("viewer",      "viewer123",      "VIEWER"),
]


def seed_demo_users(force: bool = False) -> None:
    """
    Create the five demo accounts if they don't already exist.
    Safe to call at every startup — skips existing usernames.
    Set force=True to reset all demo user passwords.
    """
    from backend.database import User, UserRole
    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

    role_map = {
        "ADMIN":     UserRole.ADMIN,
        "ANALYST":   UserRole.ANALYST,
        "MONITOR":   UserRole.MONITOR,
        "VIEWER":    UserRole.VIEWER,
        "TECHNICAL": UserRole.TECHNICAL,
    }

    db: Session = SessionLocal()
    try:
        created = 0
        updated = 0
        for username, password, role_str in DEMO_USERS:
            hashed = pwd_context.hash(password)
            role_enum = role_map[role_str]
            existing = db.query(User).filter(User.username == username).first()
            if existing:
                if force:
                    existing.hashed_password = hashed
                    existing.role = role_enum
                    updated += 1
            else:
                db.add(User(
                    username=username,
                    hashed_password=hashed,
                    role=role_enum,
                    mfa_enabled=False,
                ))
                created += 1

        db.commit()
        if created:
            print(f"[seeds] Created {created} demo user(s).")
        if updated:
            print(f"[seeds] Reset {updated} demo user password(s).")
        if not created and not updated:
            print("[seeds] Demo users already exist — skipping.")
    except Exception as e:
        db.rollback()
        print(f"[seeds] Error seeding users: {e}")
        raise
    finally:
        db.close()
