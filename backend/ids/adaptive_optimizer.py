"""
Adaptive Optimization Engine
Runs as a background daemon thread every 30 minutes.
Reads the last 200 alerts, calculates the false-positive rate,
and adjusts the anomaly_threshold in DetectionConfig accordingly.
"""
import threading
import time
from datetime import datetime

from database import SessionLocal, Alert, DetectionConfig

TUNE_INTERVAL_SECONDS = 1800  # 30 minutes
WINDOW_SIZE = 200
DEFAULT_THRESHOLD = 75.0  # percent

_thread: threading.Thread | None = None


def _get_or_init_threshold(db) -> float:
    row = db.query(DetectionConfig).filter(DetectionConfig.key == "anomaly_threshold").first()
    if row is None:
        row = DetectionConfig(key="anomaly_threshold", value=str(DEFAULT_THRESHOLD))
        db.add(row)
        db.commit()
    try:
        return float(row.value)
    except (TypeError, ValueError):
        return DEFAULT_THRESHOLD


def _set_config(db, key: str, value: str) -> None:
    row = db.query(DetectionConfig).filter(DetectionConfig.key == key).first()
    if row is None:
        row = DetectionConfig(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()


def run_optimization_cycle() -> dict:
    """Execute one optimization cycle and return a summary dict."""
    db = SessionLocal()
    try:
        recent_alerts = (
            db.query(Alert)
            .order_by(Alert.timestamp.desc())
            .limit(WINDOW_SIZE)
            .all()
        )

        total = len(recent_alerts)
        if total == 0:
            return {"status": "skipped", "reason": "no_alerts"}

        fp_count = sum(1 for a in recent_alerts if a.is_false_positive)
        fp_rate = fp_count / total  # 0.0 – 1.0

        current_threshold = _get_or_init_threshold(db)
        new_threshold = current_threshold

        if fp_rate > 0.20:
            # Too many false positives → lower sensitivity (raise threshold)
            new_threshold = min(current_threshold + 5.0, 99.0)
            action = "raised_threshold"
        elif fp_rate < 0.05:
            # Very few false positives → raise sensitivity (lower threshold)
            new_threshold = max(current_threshold - 5.0, 10.0)
            action = "lowered_threshold"
        else:
            action = "no_change"

        now_str = datetime.utcnow().isoformat()
        _set_config(db, "anomaly_threshold", str(round(new_threshold, 2)))
        _set_config(db, "last_tuned", now_str)
        _set_config(db, "last_fp_rate", str(round(fp_rate * 100, 2)))
        _set_config(db, "last_window_size", str(total))

        print(
            f"[adaptive_optimizer] fp_rate={fp_rate:.1%} "
            f"threshold: {current_threshold}% → {new_threshold}% ({action})"
        )
        return {
            "status": "ok",
            "action": action,
            "fp_rate": fp_rate,
            "old_threshold": current_threshold,
            "new_threshold": new_threshold,
            "tuned_at": now_str,
        }
    except Exception as exc:
        print(f"[adaptive_optimizer] error: {exc}")
        return {"status": "error", "detail": str(exc)}
    finally:
        db.close()


def _loop():
    # Initial short delay so the server finishes startup first
    time.sleep(10)
    while True:
        run_optimization_cycle()
        time.sleep(TUNE_INTERVAL_SECONDS)


def start_adaptive_optimizer():
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _thread = threading.Thread(target=_loop, daemon=True, name="adaptive_optimizer")
    _thread.start()
    print("[adaptive_optimizer] Started — tuning every 30 minutes")
