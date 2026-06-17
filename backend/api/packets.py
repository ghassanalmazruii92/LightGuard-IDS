from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import Device, PacketEvent, Severity, get_db, SessionLocal

router = APIRouter(prefix="/api/packets", tags=["Packets"])

packet_broadcast_callback = None
packet_event_loop = None


def set_packet_broadcast_callback(callback, loop=None):
    global packet_broadcast_callback, packet_event_loop
    packet_broadcast_callback = callback
    packet_event_loop = loop


class PacketIn(BaseModel):
    src_ip: str
    dst_ip: str
    protocol: str = "TCP"
    src_port: Optional[int] = None
    dst_port: Optional[int] = None
    flags: Optional[str] = None
    length: int = Field(default=0, ge=0)
    zone: Optional[str] = None
    device_type: Optional[str] = None
    severity: str = "LOW"
    attack_type: Optional[str] = None
    source: str = "GNS3"
    raw_summary: Optional[str] = None
    create_alert: bool = True


def _severity(value: Optional[str]) -> Severity:
    try:
        return Severity[(value or "LOW").upper()]
    except KeyError:
        return Severity.LOW


def _packet_to_dict(row: PacketEvent) -> dict:
    sev = row.severity.value if row.severity else "LOW"
    return {
        "id": row.id,
        "timestamp": row.timestamp.isoformat() if row.timestamp else None,
        "src_ip": row.src_ip,
        "dst_ip": row.dst_ip,
        "protocol": row.protocol,
        "src_port": row.src_port,
        "dst_port": row.dst_port,
        "flags": row.flags,
        "length": row.length,
        "zone": row.zone,
        "device_type": row.device_type,
        "severity": sev,
        "attack_type": row.attack_type,
        "source": row.source,
        "raw_summary": row.raw_summary,
        "alert_id": row.alert_id,
    }


def _enrich_from_inventory(db: Session, payload: dict) -> dict:
    if payload.get("zone") and payload.get("device_type"):
        return payload
    device = None
    if payload.get("src_ip"):
        device = db.query(Device).filter(Device.ip == payload["src_ip"]).first()
    if device is None and payload.get("dst_ip"):
        device = db.query(Device).filter(Device.ip == payload["dst_ip"]).first()
    if device:
        payload.setdefault("zone", device.zone)
        payload.setdefault("device_type", device.role or device.label)
    return payload


def _broadcast_packet(packet: dict) -> None:
    if not packet_broadcast_callback:
        return
    try:
        loop = packet_event_loop or asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(
                packet_broadcast_callback(json.dumps(packet)),
                loop,
            )
    except Exception:
        pass


def create_packet_event(packet_data: dict, *, emit_alert: bool = True) -> dict:
    db = SessionLocal()
    try:
        payload = dict(packet_data)
        payload = _enrich_from_inventory(db, payload)
        severity = _severity(payload.get("severity"))

        alert_id = None
        attack_type = payload.get("attack_type")
        if emit_alert and attack_type and severity != Severity.LOW:
            from backend.ids.alert_engine import create_alert

            create_alert({
                "src_ip": payload.get("src_ip", "0.0.0.0"),
                "dst_ip": payload.get("dst_ip", "127.0.0.1"),
                "protocol": payload.get("protocol", "TCP"),
                "attack_type": attack_type,
                "severity": severity.value,
                "detection_method": payload.get("source", "Packet Capture"),
                "description": payload.get("raw_summary") or f"Packet event: {attack_type}",
                "zone": payload.get("zone"),
                "device_role": payload.get("device_type"),
                "port": payload.get("dst_port"),
                "is_simulation": payload.get("source") in ("Sandbox", "Scenario Engine"),
            })

        row = PacketEvent(
            src_ip=payload.get("src_ip"),
            dst_ip=payload.get("dst_ip"),
            protocol=(payload.get("protocol") or "TCP").upper(),
            src_port=payload.get("src_port"),
            dst_port=payload.get("dst_port"),
            flags=payload.get("flags"),
            length=int(payload.get("length") or 0),
            zone=payload.get("zone"),
            device_type=payload.get("device_type"),
            severity=severity,
            attack_type=attack_type,
            source=payload.get("source") or "Packet Capture",
            raw_summary=payload.get("raw_summary"),
            alert_id=alert_id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        packet = _packet_to_dict(row)
        _broadcast_packet(packet)
        return packet
    finally:
        db.close()


@router.get("/live")
async def live_packets(
    limit: int = Query(100, ge=1, le=500),
    severity: Optional[str] = Query(None),
    protocol: Optional[str] = Query(None),
    zone: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(PacketEvent).order_by(PacketEvent.timestamp.desc())
    if severity:
        query = query.filter(PacketEvent.severity == _severity(severity))
    if protocol:
        query = query.filter(PacketEvent.protocol.ilike(f"%{protocol}%"))
    if zone:
        query = query.filter(PacketEvent.zone.ilike(f"%{zone}%"))
    if source:
        query = query.filter(PacketEvent.source.ilike(f"%{source}%"))
    return [_packet_to_dict(row) for row in query.limit(limit).all()]


@router.post("/ingest", status_code=201)
async def ingest_packet(
    body: PacketIn,
    current_user=Depends(get_current_user),
):
    return create_packet_event(body.model_dump(), emit_alert=body.create_alert)


@router.get("/stats")
async def packet_stats(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = datetime.now() - timedelta(hours=24)
    rows = db.query(PacketEvent).filter(PacketEvent.timestamp >= since).all()
    by_protocol: dict[str, int] = {}
    by_source: dict[str, int] = {}
    by_zone: dict[str, int] = {}
    for row in rows:
        by_protocol[row.protocol or "UNKNOWN"] = by_protocol.get(row.protocol or "UNKNOWN", 0) + 1
        by_source[row.source or "unknown"] = by_source.get(row.source or "unknown", 0) + 1
        by_zone[row.zone or "Unknown"] = by_zone.get(row.zone or "Unknown", 0) + 1
    return {
        "total_24h": len(rows),
        "by_protocol": by_protocol,
        "by_source": by_source,
        "by_zone": by_zone,
    }
