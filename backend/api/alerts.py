from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy import func

from database import get_db, Alert, Severity, UserRole
from auth import get_current_user, admin_required

router = APIRouter()


def _alert_to_dict(alert: Alert) -> dict:
    """Serialize an Alert ORM object, decrypting raw_payload if present."""
    from backend.security.encryption import decrypt

    return {
        "id": alert.id,
        "timestamp": alert.timestamp.isoformat() if alert.timestamp else None,
        "src_ip": alert.src_ip,
        "dst_ip": alert.dst_ip,
        "protocol": alert.protocol,
        "attack_type": alert.attack_type,
        "severity": alert.severity.value if alert.severity else None,
        "detection_method": alert.detection_method,
        "raw_payload": decrypt(alert.raw_payload) if alert.raw_payload else None,
        "device_role": alert.device_role,
        "zone": alert.zone,
        "port": alert.port,
        "is_simulation": alert.is_simulation,
        "scenario_data": alert.scenario_data,
        "is_false_positive": alert.is_false_positive,
    }


@router.get("")
@router.get("/")
async def get_alerts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    severity: Optional[Severity] = None,
    method: Optional[str] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Alert)

    if severity:
        query = query.filter(Alert.severity == severity)
    if method:
        query = query.filter(Alert.detection_method == method)

    total = query.count()
    alerts = query.order_by(Alert.timestamp.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "items": [_alert_to_dict(a) for a in alerts],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/stats")
async def get_alert_stats(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now()
    today_start = datetime(now.year, now.month, now.day)

    today_count = db.query(Alert).filter(Alert.timestamp >= today_start).count()

    by_severity = db.query(
        Alert.severity, func.count(Alert.id)
    ).group_by(Alert.severity).all()

    by_hour = []
    for i in range(24):
        hour_start = today_start + timedelta(hours=i)
        hour_end = today_start + timedelta(hours=i + 1)
        count = db.query(Alert).filter(
            Alert.timestamp >= hour_start, Alert.timestamp < hour_end
        ).count()
        by_hour.append({"hour": i, "count": count})

    return {
        "today_count": today_count,
        "by_severity": {s.value: count for s, count in by_severity},
        "by_hour": by_hour,
    }


@router.get("/live")
async def get_live_alerts(
    limit: int = Query(50, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the last 50 alerts for initial WebSocket load."""
    alerts = db.query(Alert).order_by(Alert.timestamp.desc()).limit(limit).all()
    return [_alert_to_dict(a) for a in alerts]


@router.post("/{alert_id}/false-positive")
async def mark_false_positive(
    alert_id: int,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db),
):
    """Admin-only: mark an alert as a false positive to help the adaptive optimizer."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_false_positive = True
    db.commit()
    return {"id": alert_id, "is_false_positive": True, "status": "updated"}
