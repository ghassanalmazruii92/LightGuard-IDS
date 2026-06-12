from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db, Event, Alert, Severity, UserRole
from auth import get_current_user

router = APIRouter()


@router.get("")
@router.get("/")
async def get_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    severity: Optional[str] = Query(None),
    protocol: Optional[str] = Query(None),
    zone: Optional[str] = Query(None),
    attack_type: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    SOC-grade log feed — returns enriched alert-based log entries with
    Source, Destination, Protocol, Port, Zone, Severity, and Action Taken.
    """
    query = db.query(Alert).order_by(Alert.timestamp.desc())

    if severity:
        try:
            query = query.filter(Alert.severity == Severity[severity.upper()])
        except KeyError:
            pass
    if protocol:
        query = query.filter(Alert.protocol.ilike(f"%{protocol}%"))
    if zone:
        query = query.filter(Alert.zone.ilike(f"%{zone}%"))
    if attack_type:
        query = query.filter(Alert.attack_type.ilike(f"%{attack_type}%"))

    total = query.count()
    alerts = query.offset((page - 1) * limit).limit(limit).all()

    items = []
    for a in alerts:
        # Determine action taken based on severity
        sev = a.severity.value if a.severity else "UNKNOWN"
        if sev == "CRITICAL":
            action_taken = "Traffic Flagged — Under Monitoring"
        elif sev == "HIGH":
            action_taken = "Alert Raised — Traffic Inspection Active"
        elif a.is_simulation:
            action_taken = "Simulation — Logged Only"
        else:
            action_taken = "Logged & Monitored"

        items.append({
            "id":              a.id,
            "timestamp":       a.timestamp.isoformat() if a.timestamp else None,
            "source_ip":       a.src_ip or "—",
            "destination_ip":  a.dst_ip or "—",
            "protocol":        a.protocol or "—",
            "port":            a.port,
            "zone":            a.zone or "—",
            "device_role":     a.device_role or "—",
            "attack_type":     a.attack_type or "—",
            "severity":        sev,
            "detection_method": a.detection_method or "—",
            "action_taken":    action_taken,
            "is_simulation":   a.is_simulation,
            "is_false_positive": a.is_false_positive,
        })

    return {
        "items":  items,
        "total":  total,
        "page":   page,
        "limit":  limit,
    }


@router.get("/events")
async def get_system_events(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """System-level event log (INFO / WARNING / ERROR / FIREWALL_BLOCK)."""
    query = db.query(Event).order_by(Event.timestamp.desc())
    total = query.count()
    events = query.offset((page - 1) * limit).limit(limit).all()
    return {"items": events, "total": total, "page": page, "limit": limit}
