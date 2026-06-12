from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import ipaddress
import json
import threading

from pydantic import BaseModel, Field, field_validator

from backend.database import get_db, Device, Alert, Vlan, compute_risk_score
from backend.auth import get_current_user, technical_required
from backend.ids.real_scanner import nmap_deep_scan

router = APIRouter(prefix="/api/devices", tags=["Devices"])


class DeviceCreate(BaseModel):
    ip: str = Field(..., description="IPv4 address for the host")
    zone: str = Field(..., description="Must match an existing VLAN zone name")
    hostname: Optional[str] = None
    mac: Optional[str] = None
    label: Optional[str] = None
    role: Optional[str] = "generic_host"
    icon: Optional[str] = "📟"
    os: Optional[str] = None
    status: Optional[str] = "online"

    @field_validator("ip")
    @classmethod
    def normalize_ip(cls, v: str) -> str:
        try:
            addr = ipaddress.ip_address(v.strip())
        except ValueError:
            raise ValueError("Invalid IP address") from None
        if addr.version != 4:
            raise ValueError("Only IPv4 is supported for topology hosts")
        return str(addr)


def _prepare_device_json(device: Device) -> None:
    """Mutate JSON-ish columns on an ORM row for consistent API responses."""
    if device.open_ports and isinstance(device.open_ports, str):
        try:
            device.open_ports = json.loads(device.open_ports)
        except Exception:
            device.open_ports = []
    elif device.open_ports is None:
        device.open_ports = []
    if device.services and isinstance(device.services, str):
        try:
            device.services = json.loads(device.services)
        except Exception:
            device.services = []
    elif device.services is None:
        device.services = []
    if device.vulnerabilities and isinstance(device.vulnerabilities, str):
        try:
            device.vulnerabilities = json.loads(device.vulnerabilities)
        except Exception:
            device.vulnerabilities = []
    elif device.vulnerabilities is None:
        device.vulnerabilities = []


@router.get("")
@router.get("/")
async def list_devices(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all devices with role, risk, zone."""
    devices = db.query(Device).all()
    for device in devices:
        _prepare_device_json(device)
    return devices

@router.get("/stats")
async def get_device_stats(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Summary stats for all devices."""
    devices = db.query(Device).all()
    total = len(devices)
    online = sum(1 for d in devices if d.status == "online")
    offline = sum(1 for d in devices if d.status == "offline")
    suspicious = sum(1 for d in devices if d.status == "suspicious")
    avg_risk = round(sum(d.risk_score or 0 for d in devices) / total, 1) if total else 0
    return {
        "total": total,
        "online": online,
        "offline": offline,
        "suspicious": suspicious,
        "avg_risk_score": avg_risk,
    }

@router.get("/zones")
async def get_zone_summary(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Zone summary { zone: { count, risk, alerts_today } }."""
    devices = db.query(Device).all()
    zones = {}
    
    # Get alerts today
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    alerts = db.query(Alert).filter(Alert.timestamp >= today).all()
    
    for device in devices:
        zone = device.zone or "Unknown"
        if zone not in zones:
            zones[zone] = {"count": 0, "risk": 0, "alerts_today": 0}
        zones[zone]["count"] += 1
        zones[zone]["risk"] = max(zones[zone]["risk"], device.risk_score)
        
    for alert in alerts:
        zone = alert.zone or "Unknown"
        if zone in zones:
            zones[zone]["alerts_today"] += 1
            
    return zones


@router.post("")
@router.post("/")
@router.post("/register")
async def create_device(
    body: DeviceCreate,
    current_user=Depends(technical_required),
    db: Session = Depends(get_db),
):
    """
    Register a host manually so it appears under the chosen VLAN zone on the topology map.
    SOC Admin and Technical Staff may add inventory rows; IP must fall inside that zone's CIDR if defined.
    """
    zone_name = body.zone.strip()
    vlan = db.query(Vlan).filter(Vlan.zone == zone_name).first()
    if not vlan:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown zone '{zone_name}'. Pick a zone that matches an existing VLAN.",
        )

    if vlan.cidr and "/" in vlan.cidr:
        try:
            net = ipaddress.ip_network(vlan.cidr.strip(), strict=False)
            host = ipaddress.ip_address(body.ip)
            if host not in net:
                raise HTTPException(
                    status_code=400,
                    detail=f"IP {body.ip} is outside {zone_name} subnet ({vlan.cidr}).",
                )
        except HTTPException:
            raise
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"VLAN '{zone_name}' has an invalid CIDR ({vlan.cidr}).",
            )

    dup = db.query(Device).filter(Device.ip == body.ip).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"Device with IP {body.ip} already exists.")

    label = (body.label or body.hostname or body.ip).strip() or body.ip
    hostname = (body.hostname or label).strip()

    row = Device(
        ip=body.ip,
        mac=(body.mac or "").strip() or "—",
        hostname=hostname,
        role=(body.role or "generic_host").strip(),
        label=label,
        zone=zone_name,
        icon=(body.icon or "📟").strip(),
        os=(body.os or "").strip() or None,
        status=(body.status or "online").strip(),
        source="manual",
        open_ports=json.dumps([]),
        services=json.dumps([]),
        vulnerabilities=json.dumps([]),
    )
    row.risk_score = compute_risk_score(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    _prepare_device_json(row)
    return row


@router.post("/scan-network")
async def trigger_network_scan(
    request: Request,
    current_user = Depends(technical_required),
):
    """
    Trigger an immediate network scan cycle.
    Runs in the background – discovered devices appear in the device list shortly after.
    """
    scanner = getattr(request.app.state, "scanner", None)
    if scanner is None:
        raise HTTPException(status_code=503, detail="Scanner not initialised")

    def _run():
        try:
            scanner._cycle()
        except Exception as e:
            print(f"[scan-network] Error: {e}")

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return {"status": "scanning", "cidr": scanner.cidr}


@router.get("/{ip}")
async def get_device_detail(
    ip: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Full detail: ports, services, vulnerabilities, alert history."""
    device = db.query(Device).filter(Device.ip == ip).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    _prepare_device_json(device)

    alerts = db.query(Alert).filter(Alert.src_ip == ip).order_by(Alert.timestamp.desc()).limit(20).all()
    return {"device": device, "alerts": alerts}


@router.post("/{ip}/scan")
async def trigger_scan(
    ip: str,
    current_user = Depends(technical_required),
    db: Session = Depends(get_db)
):
    """Trigger on-demand nmap deep scan (admin only)."""
    result = nmap_deep_scan(ip)

    device = db.query(Device).filter(Device.ip == ip).first()
    if device:
        if result.get("os"):
            device.os = result["os"]
        if result.get("services"):
            device.services = json.dumps(result["services"])
        if result.get("vulnerabilities"):
            device.vulnerabilities = json.dumps(result["vulnerabilities"])
        device.last_seen = datetime.utcnow()
        device.risk_score = compute_risk_score(device)
        db.commit()

    return result


@router.post("/{ip}/trust")
async def trust_device(
    ip: str,
    trusted: bool = True,
    current_user = Depends(technical_required),
    db: Session = Depends(get_db)
):
    """Mark a device as trusted (admin only)."""
    device = db.query(Device).filter(Device.ip == ip).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    device.trusted = trusted
    db.commit()
    return {"status": "success", "message": f"Device {ip} trusted: {trusted}"}
