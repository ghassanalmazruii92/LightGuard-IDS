from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Enum, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from datetime import datetime
import enum
import os

# Pytest shared file DB — must be identical string for BOTH `database` and `backend.database` imports (two module objects).
_testing_url = os.environ.get("LIGHTGUARD_TEST_DATABASE_URL")
if os.getenv("LIGHTGUARD_TESTING") == "1":
    SQLALCHEMY_DATABASE_URL = _testing_url or "sqlite:///./lightguard_test.sqlite"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    SQLALCHEMY_DATABASE_URL = "sqlite:///./lightguard.db"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class UserRole(enum.Enum):
    ADMIN    = "admin"     # SOC Admin    — full system access
    ANALYST  = "analyst"   # SOC Analyst  — view alerts, run scenarios, generate reports
    MONITOR  = "monitor"   # Monitoring Staff — read-only dashboard and logs
    VIEWER   = "viewer"    # Read-Only Viewer — summary dashboard only
    # Backward-compatible alias
    TECHNICAL = "technical"  # Technical Staff — device and fog node config

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role             = Column(Enum(UserRole), default=UserRole.VIEWER)
    mfa_secret       = Column(String, nullable=True)  # TOTP secret — RFC 6238 MFA via pyotp
    mfa_enabled      = Column(Boolean, default=False)

class Severity(enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    src_ip = Column(String, index=True)
    dst_ip = Column(String, index=True, default="127.0.0.1")
    protocol = Column(String, default="TCP")
    attack_type = Column(String)
    severity = Column(Enum(Severity))
    detection_method = Column(String)  # "Signature" or "AI"
    raw_payload = Column(Text, nullable=True)
    device_role = Column(String, nullable=True)
    zone = Column(String, nullable=True)
    port = Column(Integer, nullable=True)
    is_simulation = Column(Boolean, default=False)
    scenario_data = Column(Text, nullable=True)  # JSON with explanation
    is_false_positive = Column(Boolean, default=False)

class PacketEvent(Base):
    __tablename__ = "packet_events"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    src_ip = Column(String, index=True)
    dst_ip = Column(String, index=True)
    protocol = Column(String, default="TCP", index=True)
    src_port = Column(Integer, nullable=True)
    dst_port = Column(Integer, nullable=True)
    flags = Column(String, nullable=True)
    length = Column(Integer, default=0)
    zone = Column(String, nullable=True, index=True)
    device_type = Column(String, nullable=True)
    severity = Column(Enum(Severity), default=Severity.LOW, index=True)
    attack_type = Column(String, nullable=True, index=True)
    source = Column(String, default="Packet Capture")
    raw_summary = Column(Text, nullable=True)
    alert_id = Column(Integer, nullable=True, index=True)

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    event_type = Column(String)  # "INFO", "WARNING", "ERROR", "SYSTEM"
    description = Column(Text)

class DetectionConfig(Base):
    __tablename__ = "detection_config"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=True)


class Device(Base):
    __tablename__ = "devices"
    id              = Column(Integer, primary_key=True)
    ip              = Column(String, unique=True, index=True)
    mac             = Column(String)
    hostname        = Column(String)
    role            = Column(String)             # traffic_camera, fog_node, etc.
    label           = Column(String)             # "Traffic Camera"
    zone            = Column(String)             # "Transportation"
    icon            = Column(String)             # "📷"
    os              = Column(String, nullable=True)
    status          = Column(String, default="online")
    open_ports      = Column(Text, nullable=True)  # JSON
    services        = Column(Text, nullable=True)  # JSON
    vulnerabilities = Column(Text, nullable=True)  # JSON
    risk_score      = Column(Integer, default=0)
    trusted         = Column(Boolean, default=False)
    source          = Column(String, default="seed")  # "seed" | "discovered" | "manual"
    first_seen      = Column(DateTime, default=datetime.utcnow)
    last_seen       = Column(DateTime, default=datetime.utcnow)

class Vlan(Base):
    __tablename__ = "vlans"

    id      = Column(Integer, primary_key=True)
    vlan_id = Column(Integer, unique=True, index=True)   # e.g. 10, 20, 30 …
    name    = Column(String)                              # "Transportation"
    cidr    = Column(String)                              # "192.168.10.0/24"
    color   = Column(String, default="#0D9488")           # hex for topology UI
    zone    = Column(String)                              # matches Device.zone


class FirewallRule(Base):
    __tablename__ = "firewall_rules"

    id          = Column(Integer, primary_key=True)
    src_zone    = Column(String)      # "Transportation" | "*"
    dst_zone    = Column(String)      # "Energy Grid"    | "*"
    protocol    = Column(String, default="*")   # TCP/UDP/ICMP/*
    port        = Column(Integer, nullable=True)
    action      = Column(String, default="allow")  # "allow" | "deny"
    enabled     = Column(Boolean, default=True)
    description = Column(String, nullable=True)
    priority    = Column(Integer, default=100)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

import json

# Helper functions:
def save_device(data: dict):
    db = SessionLocal()
    try:
        db_device = db.query(Device).filter(Device.ip == data["ip"]).first()
        if db_device:
            # Update
            for key, value in data.items():
                if key in ["open_ports", "services", "vulnerabilities"] and value is not None:
                    if isinstance(value, (list, dict)):
                        setattr(db_device, key, json.dumps(value))
                    else:
                        setattr(db_device, key, value)
                elif hasattr(db_device, key):
                    setattr(db_device, key, value)
            setattr(db_device, "last_seen", datetime.utcnow())
            setattr(db_device, "risk_score", compute_risk_score(db_device))
        else:
            # Insert
            if "open_ports" in data and data["open_ports"] is not None and isinstance(data["open_ports"], (list, dict)):
                data["open_ports"] = json.dumps(data["open_ports"])
            if "services" in data and data["services"] is not None and isinstance(data["services"], (list, dict)):
                data["services"] = json.dumps(data["services"])
            if "vulnerabilities" in data and data["vulnerabilities"] is not None and isinstance(data["vulnerabilities"], (list, dict)):
                data["vulnerabilities"] = json.dumps(data["vulnerabilities"])
            
            db_device = Device(**data)
            setattr(db_device, "risk_score", compute_risk_score(db_device))
            db.add(db_device)
        db.commit()
    finally:
        db.close()

def update_device_status(ip: str, status: str):
    db = SessionLocal()
    try:
        db_device = db.query(Device).filter(Device.ip == ip).first()
        if db_device:
            setattr(db_device, "status", status)
            if status == "online":
                setattr(db_device, "last_seen", datetime.utcnow())
            db.commit()
    finally:
        db.close()

def get_all_devices():
    db = SessionLocal()
    try:
        return db.query(Device).all()
    finally:
        db.close()

def compute_risk_score(device) -> int:
    score = 0
    
    # Open ports count
    try:
        ports = json.loads(device.open_ports) if isinstance(device.open_ports, str) else (device.open_ports or [])
        score += len(ports) * 2
    except:
        pass
    
    # Dangerous ports
    DANGEROUS_PORTS = {
        23, 21, 445, 3389, 1433, 3306, 5900, 6379, 27017, 9200, 2375, 502, 4840, 1883, 554
    }
    try:
        for port in ports:
            if port in DANGEROUS_PORTS:
                score += 20
    except:
        pass
        
    # Status
    if device.status == "suspicious":
        score += 30
    
    if device.role == "unknown_iot":
        score += 15
        
    return min(score, 100)

def init_db():
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations():
    """Add any missing columns to existing tables (SQLite ALTER TABLE)."""
    migrations = [
        ("alerts",  "device_role",  "VARCHAR"),
        ("alerts",  "zone",         "VARCHAR"),
        ("alerts",  "port",         "INTEGER"),
        ("alerts",  "is_simulation",    "BOOLEAN DEFAULT 0"),
        ("alerts",  "scenario_data",    "TEXT"),
        ("alerts",  "is_false_positive","BOOLEAN DEFAULT 0"),
        ("devices", "source",           "VARCHAR DEFAULT 'seed'"),
        ("users",   "mfa_secret",       "VARCHAR"),
        ("users",   "mfa_enabled",      "BOOLEAN DEFAULT 0"),
        ("packet_events", "src_port",    "INTEGER"),
        ("packet_events", "dst_port",    "INTEGER"),
        ("packet_events", "flags",       "VARCHAR"),
        ("packet_events", "length",      "INTEGER DEFAULT 0"),
        ("packet_events", "zone",        "VARCHAR"),
        ("packet_events", "device_type", "VARCHAR"),
        ("packet_events", "attack_type", "VARCHAR"),
        ("packet_events", "source",      "VARCHAR DEFAULT 'Packet Capture'"),
        ("packet_events", "raw_summary", "TEXT"),
        ("packet_events", "alert_id",    "INTEGER"),
        # topology tables — new columns are handled by create_all,
        # but we keep the pattern consistent for backward compatibility.
        ("firewall_rules", "priority", "INTEGER DEFAULT 100"),
    ]
    with engine.connect() as conn:
        for table, col, col_type in migrations:
            try:
                conn.execute(
                    __import__('sqlalchemy').text(
                        f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"
                    )
                )
                conn.commit()
                print(f"[migration] Added column {table}.{col}")
            except Exception:
                pass  # Column already exists
