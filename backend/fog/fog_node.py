"""
Fog Node Simulation — Feature 4
Lightweight FastAPI application that runs on port 8001.
Simulates three fog nodes serving Tadhamon Smart City zones:
  - Zone A: Transportation
  - Zone B: Energy Grid
  - Zone C: Public Safety

Run independently with:  python start_fog_node.py
or:  uvicorn backend.fog.fog_node:app --port 8001 --reload
"""
import json
import os
import random
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import psutil
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="LightGuard Fog Node — Tadhamon Smart City")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Real system metrics via psutil ────────────────────────────────────────────

def _get_real_metrics() -> dict:
    """Collect actual CPU, RAM, disk, and network metrics from this host."""
    try:
        cpu_pct = psutil.cpu_percent(interval=0.3)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        net_before = psutil.net_io_counters()
        import time; time.sleep(0.5)
        net_after = psutil.net_io_counters()
        bytes_per_sec = (net_after.bytes_sent - net_before.bytes_sent +
                         net_after.bytes_recv - net_before.bytes_recv) / 0.5
        mbps = round(bytes_per_sec / (1024 * 1024), 3)
        pps = round(bytes_per_sec / 1500, 1)  # approx packets/sec assuming 1500B avg

        return {
            "cpu_pct":      round(cpu_pct, 1),
            "ram_pct":      round(mem.percent, 1),
            "ram_used_mb":  round(mem.used / (1024 * 1024), 1),
            "ram_total_mb": round(mem.total / (1024 * 1024), 1),
            "disk_pct":     round(disk.percent, 1),
            "bandwidth_mbps": mbps,
            "packet_rate":  pps,
            "latency_ms":   round(random.uniform(1.2, 8.5), 2),  # simulated RTT
        }
    except Exception:
        return {
            "cpu_pct": random.uniform(15, 65),
            "ram_pct": random.uniform(30, 75),
            "bandwidth_mbps": random.uniform(0.5, 5.0),
            "packet_rate": random.uniform(100, 900),
            "latency_ms": random.uniform(2, 15),
        }

# ── Node registry ─────────────────────────────────────────────────────────────

_NODES: Dict[str, Dict[str, Any]] = {
    "zone_a": {
        "id": "zone_a",
        "name": "Zone A – Transportation",
        "zone": "Transportation",
        "device_types": ["traffic_sensor", "security_camera"],
        "status": "online",
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "alerts_forwarded": 0,
        "alerts_local": 0,
    },
    "zone_b": {
        "id": "zone_b",
        "name": "Zone B – Energy Grid",
        "zone": "Energy Grid",
        "device_types": ["energy_meter", "env_sensor"],
        "status": "online",
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "alerts_forwarded": 0,
        "alerts_local": 0,
    },
    "zone_c": {
        "id": "zone_c",
        "name": "Zone C – Public Safety",
        "zone": "Public Safety",
        "device_types": ["security_camera", "env_sensor"],
        "status": "online",
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "alerts_forwarded": 0,
        "alerts_local": 0,
    },
}

_LOG_PATH = Path(__file__).resolve().parents[2] / "fog_node_log.json"

# ── Signature rules (lightweight, no ML) ─────────────────────────────────────

_RULES = [
    {
        "name": "HIGH_TRAFFIC_SPIKE",
        "field": "packets_per_sec",
        "threshold": 800,
        "severity": "HIGH",
        "attack_type": "DOS",
    },
    {
        "name": "ABNORMAL_TEMP",
        "field": "temperature",
        "threshold": 80,
        "severity": "MEDIUM",
        "attack_type": "ENV_ANOMALY",
    },
    {
        "name": "VOLTAGE_SPIKE",
        "field": "voltage",
        "threshold": 260,
        "severity": "CRITICAL",
        "attack_type": "POWER_SURGE",
    },
    {
        "name": "CAMERA_PACKET_FLOOD",
        "field": "bandwidth_mbps",
        "threshold": 90,
        "severity": "HIGH",
        "attack_type": "RTSP_FLOOD",
    },
]


def _run_signature_check(payload: dict) -> Optional[dict]:
    """Return a match dict if any rule is triggered, else None."""
    for rule in _RULES:
        val = payload.get(rule["field"])
        if val is not None and float(val) > rule["threshold"]:
            return rule
    return None


# ── Log helper ────────────────────────────────────────────────────────────────

def _log_local(node_id: str, entry: dict) -> None:
    logs: List[dict] = []
    if _LOG_PATH.exists():
        try:
            logs = json.loads(_LOG_PATH.read_text())
        except Exception:
            logs = []
    logs.append({"node_id": node_id, "timestamp": datetime.now().isoformat(), **entry})
    # Keep last 500 entries
    logs = logs[-500:]
    _LOG_PATH.write_text(json.dumps(logs, indent=2))


# ── Forwarding helper ─────────────────────────────────────────────────────────

_MAIN_SERVER_URL = os.getenv("FOG_MAIN_SERVER_URL", "http://localhost:8000")
_INTERNAL_TOKEN = os.getenv("FOG_INTERNAL_TOKEN", "lightguard-fog-internal-token-2025")


def _forward_to_main(node: dict, rule: dict, payload: dict) -> None:
    try:
        data = {
            "src_ip": payload.get("device_ip", "10.99.0.1"),
            "dst_ip": "10.0.0.1",
            "protocol": "UDP",
            "attack_type": rule["attack_type"],
            "severity": rule["severity"],
            "detection_method": "Signature",
            "description": (
                f"[Fog:{node['name']}] Rule '{rule['name']}' triggered. "
                f"Field '{rule['field']}' = {payload.get(rule['field'])}. "
                f"Device: {payload.get('device_type', 'unknown')}"
            ),
            "zone": node["zone"],
            "device_role": payload.get("device_type", "iot_device"),
        }
        headers = {"Authorization": f"Bearer {_INTERNAL_TOKEN}"}
        httpx.post(
            f"{_MAIN_SERVER_URL}/api/fog/forward",
            json=data,
            headers=headers,
            timeout=5.0,
        )
        node["alerts_forwarded"] += 1
    except Exception as exc:
        print(f"[fog_node] forward error: {exc}")


# ── Heartbeat thread ──────────────────────────────────────────────────────────

def _heartbeat_loop():
    while True:
        for node in _NODES.values():
            node["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
        time.sleep(30)


threading.Thread(target=_heartbeat_loop, daemon=True, name="fog_heartbeat").start()

# ── Routes ────────────────────────────────────────────────────────────────────


class IngestPayload(BaseModel):
    node_id: str
    device_type: str  # traffic_sensor | energy_meter | security_camera | env_sensor
    device_ip: Optional[str] = "10.99.0.1"
    # Measurement fields — any subset may be present
    packets_per_sec: Optional[float] = None
    bandwidth_mbps: Optional[float] = None
    temperature: Optional[float] = None
    voltage: Optional[float] = None
    humidity: Optional[float] = None
    motion_detected: Optional[bool] = None
    extra: Optional[dict] = None


@app.post("/fog/ingest")
async def ingest(body: IngestPayload):
    node_id = body.node_id
    if node_id not in _NODES:
        raise HTTPException(status_code=404, detail=f"Unknown node_id: {node_id}")

    node = _NODES[node_id]
    payload = body.model_dump(exclude_none=True)

    match = _run_signature_check(payload)

    if match is None:
        severity = "LOW"
    else:
        severity = match["severity"]

    if severity in ("HIGH", "CRITICAL") and match:
        _forward_to_main(node, match, payload)
    else:
        _log_local(node_id, {"severity": severity, "payload": payload})
        node["alerts_local"] += 1

    return {
        "node_id": node_id,
        "severity": severity,
        "action": "forwarded" if severity in ("HIGH", "CRITICAL") else "logged_locally",
        "rule_triggered": match["name"] if match else None,
    }


@app.get("/fog/status")
async def fog_status():
    return {"nodes": list(_NODES.values())}


@app.get("/fog/logs")
async def fog_logs():
    if not _LOG_PATH.exists():
        return {"logs": []}
    try:
        return {"logs": json.loads(_LOG_PATH.read_text())}
    except Exception:
        return {"logs": []}
