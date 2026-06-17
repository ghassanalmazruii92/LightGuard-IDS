from fastapi import APIRouter, Depends
import psutil
import time
import json
from pathlib import Path
from typing import Dict, Any, Optional

from auth import get_current_user
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta

from database import get_db, Alert

router = APIRouter()

# Global variables for tracking uptime and packet rate
start_time = time.time()
last_packet_count = 0
last_check_time = time.time()


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _load_ml_metrics() -> Optional[Dict[str, Any]]:
    p = _repo_root() / "ml" / "training_metrics.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


@router.get("/system")
async def get_system_stats(current_user=Depends(get_current_user)):
    global last_packet_count, last_check_time

    cpu_percent = psutil.cpu_percent(interval=None)
    memory = psutil.virtual_memory()

    current_io = psutil.net_io_counters()
    current_packets = current_io.packets_sent + current_io.packets_recv
    now = time.time()

    time_diff = now - last_check_time
    if time_diff > 0:
        packet_rate = (current_packets - last_packet_count) / time_diff
    else:
        packet_rate = 0

    last_packet_count = current_packets
    last_check_time = now

    return {
        "cpu": cpu_percent,
        "ram": memory.percent,
        "packets_per_sec": int(packet_rate),
        "uptime": int(now - start_time),
        "memory_used_mb": round(memory.used / (1024 * 1024), 1),
    }


@router.get("/evaluation-summary")
async def evaluation_summary(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Aggregates metrics useful for thesis Chapter 5 (detection benchmarks + runtime).
    Run `python3 ml/train.py` first to populate ml/training_metrics.json after training on NSL-KDD.
    """
    memory = psutil.virtual_memory()

    total_alerts = db.query(func.count(Alert.id)).scalar() or 0
    fp_marked = (
        db.query(func.count(Alert.id)).filter(Alert.is_false_positive.is_(True)).scalar()
        or 0
    )
    fp_pct = round(100.0 * fp_marked / total_alerts, 2) if total_alerts else 0.0

    since_24h = datetime.now() - timedelta(hours=24)
    alerts_24h = (
        db.query(func.count(Alert.id)).filter(Alert.timestamp >= since_24h).scalar() or 0
    )

    by_method_rows = (
        db.query(Alert.detection_method, func.count(Alert.id)).group_by(Alert.detection_method).all()
    )
    by_method = {str(m or "unknown"): int(c) for m, c in by_method_rows}

    ml_blob = _load_ml_metrics()

    return {
        "generated_at_utc": datetime.now().isoformat() + "Z",
        "runtime": {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "memory_percent": memory.percent,
            "memory_used_mb": round(memory.used / (1024 * 1024), 1),
            "uptime_seconds": int(time.time() - start_time),
        },
        "database_alerts": {
            "total": int(total_alerts),
            "last_24_hours": int(alerts_24h),
            "marked_false_positives": int(fp_marked),
            "marked_false_positive_rate_percent": fp_pct,
            "by_detection_method": by_method,
        },
        "ml_holdout_evaluation": ml_blob,
        "notes_for_thesis": [
            "Hold-out accuracy/recall/precision reflect the NSL-KDD test split produced by ml/train.py — not live-network labelled ground truth.",
            "Operational FP rate uses admin-marked alerts (Alerts page → Mark FP) since the adaptive optimizer tune cycle.",
            "Screenshot this JSON via GET /api/stats/evaluation-summary (authenticated) or copy from API docs for Appendix figures.",
        ],
    }
