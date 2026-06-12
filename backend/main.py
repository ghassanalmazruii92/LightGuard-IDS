import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import asyncio
import json
import os
from typing import List

from database import init_db, get_db, User, UserRole, Alert, Severity, SessionLocal
from auth import get_password_hash, get_user_from_token
from backend.api import auth_router, alerts, logs, stats, users, devices, scenarios
from backend.api import ai_chat
from backend.api import detection_config, fog_forward
from backend.api import network as network_api
from backend.api import packets as packets_api
try:
    from security.mfa import router as mfa_router
except ImportError:
    try:
        from backend.security.mfa import router as mfa_router
    except ImportError:
        mfa_router = None
from backend.ids.packet_capture import start_capture, stop_capture
from backend.ids.snort_parser import start_log_observer, stop_log_observer
from backend.ids.alert_engine import set_alert_broadcast_callback
from backend.ids.attack_patterns import SQLiMiddleware
from backend.ids.attack_patterns import router as attack_patterns_router

app = FastAPI(title="LightGuard IDS – Tadhamon Smart City", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SQL injection inspection middleware (Feature 2)
app.add_middleware(SQLiMiddleware)


# ── WebSocket manager ─────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"[ws] broadcast error: {e}")
                self.disconnect(connection)


manager = ConnectionManager()
packet_manager = ConnectionManager()


async def authenticate_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        header = websocket.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            token = header.split(" ", 1)[1].strip()
    if not token:
        await websocket.close(code=1008)
        return None

    db = SessionLocal()
    try:
        return get_user_from_token(token, db)
    except Exception:
        await websocket.close(code=1008)
        return None
    finally:
        db.close()


# ── Startup ───────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    # Setup alert engine callback with current loop
    loop = asyncio.get_running_loop()
    set_alert_broadcast_callback(manager.broadcast, loop)
    packets_api.set_packet_broadcast_callback(packet_manager.broadcast, loop)

    # 1. Build tables
    init_db()

    # 2. Default users
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(
                username="admin",
                hashed_password=get_password_hash("lightguard123"),
                role=UserRole.ADMIN,
            ))
        if not db.query(User).filter(User.username == "viewer").first():
            db.add(User(
                username="viewer",
                hashed_password=get_password_hash("viewer123"),
                role=UserRole.VIEWER,
            ))
        for username, password, role in (
            ("analyst", "analyst123", UserRole.ANALYST),
            ("monitor", "monitor123", UserRole.MONITOR),
            ("technical", "technical123", UserRole.TECHNICAL),
        ):
            if not db.query(User).filter(User.username == username).first():
                db.add(User(
                    username=username,
                    hashed_password=get_password_hash(password),
                    role=role,
                ))
        db.commit()
    finally:
        db.close()

    # 3. Seed Tadhamon demo data if DB is empty
    from backend.seeds import (
        seed_tadhamon_data,
        seed_network_topology,
        sync_control_center_vlan99_if_needed,
        sync_tadhamon_demo_locale_if_needed,
    )
    seed_tadhamon_data()
    sync_control_center_vlan99_if_needed()
    sync_tadhamon_demo_locale_if_needed()
    seed_network_topology()

    # 4. Start IDS capture + log observer
    start_capture()
    start_log_observer()

    # 6. Start adaptive optimizer (Feature 1)
    from backend.ids.adaptive_optimizer import start_adaptive_optimizer
    start_adaptive_optimizer()

    # 7. Initialise encryption key (auto-generates if missing) (Feature 3)
    from backend.security.encryption import _get_fernet
    _get_fernet()

    # 5. Choose scanner based on MOCK_MODE
    mock_mode = os.getenv("MOCK_MODE", "true").lower() in ("true", "1", "yes")

    from backend.ids.socket_scanner import get_local_cidr

    if mock_mode:
        # No-root socket scanner (RustScan → TCP connect)
        from backend.ids.socket_scanner import SocketScanner
        cidr     = os.getenv("NETWORK_CIDR") or get_local_cidr()
        interval = int(os.getenv("SCAN_INTERVAL", "60"))
        scanner  = SocketScanner(cidr=cidr, interval=interval)
        scanner.start()
        app.state.scanner = scanner
        print(f"[startup] SocketScanner started – CIDR: {cidr}, interval: {interval}s")
    else:
        # Real scanner (needs root / cap_net_raw)
        from backend.ids.real_scanner import TadhamonScanner
        cidr     = os.getenv("NETWORK_CIDR") or get_local_cidr()
        interval = int(os.getenv("SCAN_INTERVAL", "30"))
        rate     = int(os.getenv("MASSCAN_RATE", "1000"))
        scanner  = TadhamonScanner(cidr=cidr, interval=interval, rate=rate)
        scanner.start()
        app.state.scanner = scanner
        print(f"[startup] TadhamonScanner (real) started – CIDR: {cidr}")


@app.on_event("shutdown")
def shutdown_event():
    stop_capture()
    stop_log_observer()


# ── WebSocket ─────────────────────────────────────────────────────────────
@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    if await authenticate_websocket(websocket) is None:
        return
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.websocket("/ws/packets")
async def websocket_packets(websocket: WebSocket):
    if await authenticate_websocket(websocket) is None:
        return
    await packet_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        packet_manager.disconnect(websocket)


# ── Routers ───────────────────────────────────────────────────────────────
app.include_router(auth_router.router,  prefix="/auth",         tags=["auth"])
app.include_router(alerts.router,       prefix="/api/alerts",   tags=["alerts"])
app.include_router(logs.router,         prefix="/api/logs",     tags=["logs"])
app.include_router(stats.router,        prefix="/api/stats",    tags=["stats"])
app.include_router(users.router,        prefix="/api/users",    tags=["users"])
app.include_router(devices.router)                              # prefix="/api/devices" inside
app.include_router(scenarios.router,        prefix="/api")      # → /api/scenarios
app.include_router(ai_chat.router,          prefix="/api")      # → /api/ai
app.include_router(detection_config.router, prefix="/api")      # → /api/detection-config
app.include_router(fog_forward.router,      prefix="/api")      # → /api/fog/forward
app.include_router(attack_patterns_router,  prefix="/api")      # → /api/ids/report-login-failure
app.include_router(network_api.router)                          # → /api/network/...
app.include_router(packets_api.router)                          # → /api/packets/...
if mfa_router is not None:
    app.include_router(mfa_router)                                      # → /auth/mfa/...


# ── Static files (React SPA) ──────────────────────────────────────────────
static_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

if os.path.exists(static_path):
    assets_path = os.path.join(static_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    @app.get("/")
    async def serve_root():
        index_file = os.path.join(static_path, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "LightGuard IDS – Build frontend to see UI."}

    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Don't serve SPA for API / auth / websocket paths
        if full_path.startswith(("api/", "auth/", "ws/")):
            from fastapi import Response
            return Response(status_code=404, content='{"detail":"Not Found"}',
                            media_type="application/json")
        if "." in full_path and not full_path.endswith(".html"):
            file_path = os.path.join(static_path, full_path)
            if os.path.exists(file_path):
                return FileResponse(file_path)
        index_file = os.path.join(static_path, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "LightGuard IDS – Static folder not found."}
else:
    @app.get("/{full_path:path}")
    async def root_fallback(full_path: str):
        return {"message": "LightGuard IDS – Static folder not found."}
