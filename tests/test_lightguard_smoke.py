"""Smoke tests for thesis Appendix / CI — screenshot `pytest tests/ -v`."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


@pytest.fixture(scope="module")
def client():
    # Import app after conftest adjusts PYTHONPATH / env
    from main import app

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_health_login_evaluation_summary(client: TestClient) -> None:
    r = client.post(
        "/auth/login",
        data={"username": "admin", "password": "lightguard123"},
    )
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    hdr = {"Authorization": f"Bearer {tok}"}

    ev = client.get("/api/stats/evaluation-summary", headers=hdr)
    assert ev.status_code == 200
    body = ev.json()
    assert "runtime" in body
    assert "database_alerts" in body


def test_unconfirmed_mfa_secret_does_not_block_login(client: TestClient) -> None:
    from database import SessionLocal, User

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        assert admin is not None
        admin.mfa_secret = "JBSWY3DPEHPK3PXP"
        admin.mfa_enabled = False
        db.commit()

        r = client.post(
            "/auth/login",
            data={"username": "admin", "password": "lightguard123"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["mfa_required"] is False
        assert "access_token" in body
    finally:
        admin = db.query(User).filter(User.username == "admin").first()
        if admin is not None:
            admin.mfa_secret = None
            admin.mfa_enabled = False
            db.commit()
        db.close()


def test_admin_can_list_users(client: TestClient) -> None:
    r = client.post(
        "/auth/login",
        data={"username": "admin", "password": "lightguard123"},
    )
    tok = r.json()["access_token"]
    hdr = {"Authorization": f"Bearer {tok}"}

    users = client.get("/api/users", headers=hdr)
    assert users.status_code == 200
    assert isinstance(users.json(), list)
    names = {u["username"] for u in users.json()}
    assert "admin" in names


def test_admin_can_create_professional_roles(client: TestClient) -> None:
    r = client.post(
        "/auth/login",
        data={"username": "admin", "password": "lightguard123"},
    )
    tok = r.json()["access_token"]
    hdr = {"Authorization": f"Bearer {tok}"}

    for role in ("analyst", "monitor", "technical", "viewer"):
        username = f"pytest_{role}"
        created = client.post(
            "/api/users",
            json={"username": username, "password": "secret123", "role": role},
            headers=hdr,
        )
        assert created.status_code in (201, 400), created.text
        if created.status_code == 201:
            assert created.json()["role"] == role


def test_packet_ingest_and_logs_attack_filter(client: TestClient) -> None:
    r = client.post(
        "/auth/login",
        data={"username": "admin", "password": "lightguard123"},
    )
    tok = r.json()["access_token"]
    hdr = {"Authorization": f"Bearer {tok}"}

    packet = client.post(
        "/api/packets/ingest",
        json={
            "src_ip": "192.168.99.12",
            "dst_ip": "192.168.10.11",
            "protocol": "TCP",
            "dst_port": 554,
            "flags": "SYN",
            "length": 96,
            "zone": "Transportation",
            "device_type": "traffic_camera",
            "severity": "HIGH",
            "attack_type": "PYTEST_GNS3_RTSP",
            "source": "GNS3",
            "raw_summary": "pytest packet ingest",
            "create_alert": True,
        },
        headers=hdr,
    )
    assert packet.status_code == 201, packet.text
    assert packet.json()["source"] == "GNS3"

    live = client.get("/api/packets/live?limit=10", headers=hdr)
    assert live.status_code == 200
    assert any(p["attack_type"] == "PYTEST_GNS3_RTSP" for p in live.json())

    logs = client.get("/api/logs?attack_type=PYTEST_GNS3_RTSP", headers=hdr)
    assert logs.status_code == 200
    assert logs.json()["total"] >= 1


def test_packet_websocket_requires_token(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/packets"):
            pass

    r = client.post(
        "/auth/login",
        data={"username": "admin", "password": "lightguard123"},
    )
    tok = r.json()["access_token"]
    with client.websocket_connect(f"/ws/packets?token={tok}"):
        pass


def test_control_center_devices_use_vlan99(client: TestClient) -> None:
    r = client.post(
        "/auth/login",
        data={"username": "admin", "password": "lightguard123"},
    )
    tok = r.json()["access_token"]
    hdr = {"Authorization": f"Bearer {tok}"}

    topo = client.get("/api/network/topology", headers=hdr)
    assert topo.status_code == 200
    control = [d for d in topo.json()["devices"] if d.get("zone") == "Control Center"]
    assert control
    assert all(d["ip"].startswith("192.168.99.") for d in control)
