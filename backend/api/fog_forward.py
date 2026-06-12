"""
Fog Forward API — receives HIGH/CRITICAL alerts forwarded from fog nodes
and stores them via the existing alert pipeline.
POST /api/fog/forward  (internal bearer token, no JWT required)
"""
import os
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

_INTERNAL_TOKEN = os.getenv("FOG_INTERNAL_TOKEN", "lightguard-fog-internal-token-2025")


class FogAlertPayload(BaseModel):
    src_ip: str
    dst_ip: str = "10.0.0.1"
    protocol: str = "UDP"
    attack_type: str
    severity: str  # HIGH | CRITICAL
    detection_method: str = "Signature"
    description: Optional[str] = None
    zone: Optional[str] = None
    device_role: Optional[str] = None


@router.post("/fog/forward")
async def fog_forward(
    payload: FogAlertPayload,
    authorization: str = Header(...),
):
    """Receive a forwarded alert from a fog node and persist it."""
    token = authorization.removeprefix("Bearer ").strip()
    if token != _INTERNAL_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid fog internal token")

    from backend.ids.alert_engine import create_alert
    create_alert(
        {
            "src_ip": payload.src_ip,
            "dst_ip": payload.dst_ip,
            "protocol": payload.protocol,
            "attack_type": payload.attack_type,
            "severity": payload.severity,
            "detection_method": f"Fog:{payload.detection_method}",
            "description": payload.description or "",
            "zone": payload.zone,
            "device_role": payload.device_role,
            "is_simulation": False,
        }
    )
    return {"status": "accepted", "attack_type": payload.attack_type}
