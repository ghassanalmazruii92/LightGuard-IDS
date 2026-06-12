"""
Network Topology API
Provides:
  GET  /api/network/topology          - full topology for React Flow
  GET  /api/network/vlans             - list VLANs
  GET  /api/network/firewall          - list firewall rules
  POST /api/network/firewall          - add rule (admin)
  PATCH /api/network/firewall/{id}    - update rule (admin)
  DELETE /api/network/firewall/{id}   - delete rule (admin)
  POST /api/network/ingest            - external event (Mininet / Containerlab)
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db, Device, Vlan, FirewallRule
from backend.auth import get_current_user, admin_required

router = APIRouter(prefix="/api/network", tags=["Network Topology"])


def _gateway_from_cidr(cidr: Optional[str]) -> Optional[str]:
    """Typical enterprise SVI: first usable host (.1)."""
    if not cidr or "/" not in cidr:
        return None
    parts = cidr.split("/")[0].split(".")
    if len(parts) != 4:
        return None
    parts[3] = "1"
    return ".".join(parts)


def _mgmt_lo(cidr: Optional[str], last_octet: int) -> Optional[str]:
    if not cidr or "/" not in cidr:
        return None
    parts = cidr.split("/")[0].split(".")
    if len(parts) != 4:
        return None
    parts[3] = str(last_octet)
    return ".".join(parts)


# ── Pydantic schemas ───────────────────────────────────────────────────────

class FirewallRuleIn(BaseModel):
    src_zone:    str
    dst_zone:    str
    protocol:    str = "*"
    port:        Optional[int] = None
    action:      str = "allow"
    enabled:     bool = True
    priority:    int = 100
    description: Optional[str] = None


class FirewallRuleUpdate(BaseModel):
    src_zone:    Optional[str] = None
    dst_zone:    Optional[str] = None
    protocol:    Optional[str] = None
    port:        Optional[int] = None
    action:      Optional[str] = None
    enabled:     Optional[bool] = None
    priority:    Optional[int] = None
    description: Optional[str] = None


class IngestEvent(BaseModel):
    src_ip:      str
    dst_ip:      str = "10.0.0.1"
    attack_type: str
    severity:    str = "MEDIUM"
    protocol:    str = "TCP"
    port:        Optional[int] = None
    zone:        Optional[str] = None
    device_role: Optional[str] = None
    description: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────

def _vlan_to_dict(v: Vlan) -> dict:
    return {
        "id": v.id, "vlan_id": v.vlan_id, "name": v.name,
        "cidr": v.cidr, "color": v.color, "zone": v.zone,
        "gateway": _gateway_from_cidr(v.cidr),
    }


def _rule_to_dict(r: FirewallRule) -> dict:
    return {
        "id": r.id, "src_zone": r.src_zone, "dst_zone": r.dst_zone,
        "protocol": r.protocol, "port": r.port, "action": r.action,
        "enabled": r.enabled, "priority": r.priority,
        "description": r.description,
    }


def _device_to_dict(d: Device) -> dict:
    try:
        open_ports = json.loads(d.open_ports) if isinstance(d.open_ports, str) else (d.open_ports or [])
    except Exception:
        open_ports = []
    return {
        "id": d.id, "ip": d.ip, "mac": d.mac, "hostname": d.hostname,
        "role": d.role, "label": d.label, "zone": d.zone, "icon": d.icon,
        "os": d.os, "status": d.status, "risk_score": d.risk_score,
        "trusted": d.trusted, "open_ports": open_ports,
    }


# Static infrastructure (lab-realistic naming; illustrative models)
_INFRA_NODES = [
    {
        "id": "internet",
        "type": "infra",
        "label": "WAN / ISP handoff",
        "hostname": "INTERNET-UPLINK",
        "circuit": "10G LR · SINGLE-MODE · /29",
        "site": "Tadhamon-DC1",
        "layer": "wan",
        "color": "#64748b",
    },
    {
        "id": "firewall-01",
        "type": "infra",
        "label": "NGFW perimeter",
        "hostname": "FW-EDGE-01.tadhamon.local",
        "model": "Policy engine + App-ID · HA pair (sim)",
        "mgmt_ip": "192.168.255.2",
        "site": "Tadhamon-DC1",
        "layer": "edge",
        "color": "#ef4444",
    },
    {
        "id": "core-switch",
        "type": "infra",
        "label": "Core L3 · distribution",
        "hostname": "CORE-AGG-01.tadhamon.local",
        "model": "48×10G + 8×40G · STP root",
        "mgmt_ip": "192.168.255.10",
        "site": "Tadhamon-DC1",
        "layer": "core",
        "color": "#6366f1",
    },
    {
        "id": "control-center",
        "type": "infra",
        "label": "SOC / SCADA consoles",
        "hostname": "NOC-STACK-01.tadhamon.local",
        "model": "Operators + historians · VLAN 99",
        "mgmt_ip": "192.168.99.10",
        "site": "Tadhamon-DC1",
        "layer": "mgmt",
        "color": "#0d9488",
    },
    {
        "id": "ids-engine",
        "type": "infra",
        "label": "IDS / NSM tap",
        "hostname": "SENSOR-SPAN-01.tadhamon.local",
        "model": "Suricata + eve.json · TAP after FW",
        "mgmt_ip": "192.168.255.22",
        "site": "Tadhamon-DC1",
        "layer": "security",
        "color": "#f59e0b",
    },
]

_INFRA_EDGES = [
    {
        "id": "e-inet-fw",
        "source": "internet",
        "target": "firewall-01",
        "label": "WAN 10GE",
        "data": {
            "link_class": "wan",
            "speed": "10 Gbps",
            "src_port": "ISP:CIRCUIT-2219",
            "dst_port": "xe-0/0/0",
        },
    },
    {
        "id": "e-fw-sw",
        "source": "firewall-01",
        "target": "core-switch",
        "label": "Inside trunk · 802.1Q",
        "data": {
            "link_class": "trunk",
            "speed": "40 Gbps",
            "src_port": "lag1",
            "dst_port": "Po1",
        },
    },
    {
        "id": "e-sw-cc",
        "source": "core-switch",
        "target": "control-center",
        "label": "Mgmt / ops path",
        "data": {
            "link_class": "trunk",
            "speed": "10 Gbps",
            "src_port": "Vlan99",
            "dst_port": "eth0",
        },
    },
    {
        "id": "e-fw-ids",
        "source": "firewall-01",
        "target": "ids-engine",
        "label": "SPAN / mirror",
        "data": {
            "link_class": "span",
            "speed": "10 Gbps",
            "src_port": "span0 (FW inside)",
            "dst_port": "snf0",
        },
    },
]


# ── Routes ─────────────────────────────────────────────────────────────────

@router.get("/topology")
async def get_topology(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the full network topology:
      - infra:   static infrastructure nodes (firewall, switch, control center)
      - vlans:   VLAN segments
      - devices: all IoT/edge devices with zone assignment
      - edges:   logical connections
    """
    vlans   = db.query(Vlan).order_by(Vlan.vlan_id).all()
    devices = db.query(Device).all()

    vlan_dicts   = [_vlan_to_dict(v) for v in vlans]
    device_dicts = [_device_to_dict(d) for d in devices]

    edges = list(_INFRA_EDGES)

    zone_to_vlan = {v.zone: v for v in vlans}

    # Core → each access (ToR) switch
    for i, v in enumerate(vlans):
        switch_id = f"vlan-switch-{v.vlan_id}"
        core_port = f"Eth1/{49 + i}"
        edges.append({
            "id": f"e-sw-{v.vlan_id}",
            "source": "core-switch",
            "target": switch_id,
            "label": f"10G · VLAN {v.vlan_id}",
            "data": {
                "link_class": "distribution",
                "speed": "10 Gbps",
                "vlan_id": v.vlan_id,
                "vlan_name": v.name,
                "color": v.color,
                "src_port": core_port,
                "dst_port": "Te1/1 (uplink)",
            },
        })

    port_by_zone: dict[str, int] = defaultdict(int)
    for d in sorted(devices, key=lambda x: (x.zone or "", x.ip or "")):
        v = zone_to_vlan.get(d.zone)
        if not v:
            continue
        vlan_id = v.vlan_id
        port_by_zone[d.zone] += 1
        pnum = port_by_zone[d.zone]
        edges.append({
            "id": f"e-dev-{d.ip}",
            "source": f"vlan-switch-{vlan_id}",
            "target": f"dev-{d.ip}",
            "label": f"1G access",
            "data": {
                "link_class": "access",
                "speed": "1 Gbps",
                "zone": d.zone,
                "src_port": f"Gi1/0/{pnum}",
                "dst_port": "NIC1",
            },
        })

    return {
        "infra":   _INFRA_NODES,
        "vlans":   vlan_dicts,
        "devices": device_dicts,
        "edges":   edges,
    }


@router.get("/vlans")
async def list_vlans(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_vlan_to_dict(v) for v in db.query(Vlan).order_by(Vlan.vlan_id).all()]


@router.get("/firewall")
async def list_firewall_rules(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rules = db.query(FirewallRule).order_by(FirewallRule.priority).all()
    return [_rule_to_dict(r) for r in rules]


@router.post("/firewall")
async def create_firewall_rule(
    body: FirewallRuleIn,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db),
):
    rule = FirewallRule(**body.dict())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_to_dict(rule)


@router.patch("/firewall/{rule_id}")
async def update_firewall_rule(
    rule_id: int,
    body: FirewallRuleUpdate,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db),
):
    rule = db.query(FirewallRule).filter(FirewallRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field, value in body.dict(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return _rule_to_dict(rule)


@router.delete("/firewall/{rule_id}")
async def delete_firewall_rule(
    rule_id: int,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db),
):
    rule = db.query(FirewallRule).filter(FirewallRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"status": "deleted", "id": rule_id}


@router.post("/ingest")
async def ingest_external_event(
    body: IngestEvent,
    current_user=Depends(get_current_user),
):
    """
    Accept network events from Mininet / Containerlab feeders and
    create IDS alerts from them.
    """
    from backend.ids.alert_engine import create_alert
    create_alert({
        "src_ip":      body.src_ip,
        "dst_ip":      body.dst_ip,
        "attack_type": body.attack_type,
        "severity":    body.severity,
        "protocol":    body.protocol,
        "port":        body.port,
        "zone":        body.zone,
        "device_role": body.device_role,
        "detection_method": "External",
        "description": body.description or f"External event: {body.attack_type} from {body.src_ip}",
    })
    return {"status": "ingested", "src_ip": body.src_ip, "attack_type": body.attack_type}
