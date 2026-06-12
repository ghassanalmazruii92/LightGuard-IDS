"""
Detection Engine — unified model gateway.
Reads USE_TFLITE from env (or DetectionConfig DB) to decide which
model backend to use. Exposes get_model() with the same interface
as AnomalyModel so alert_engine.py needs only a one-line change.
"""
import os

_active_model_name: str | None = None  # cached choice: "randomforest" | "tflite"


def _resolve_model_name() -> str:
    global _active_model_name
    if _active_model_name:
        return _active_model_name

    # Check DB first (runtime toggle via API)
    try:
        from database import SessionLocal, DetectionConfig
        db = SessionLocal()
        row = db.query(DetectionConfig).filter(DetectionConfig.key == "active_model").first()
        db.close()
        if row and row.value in ("randomforest", "tflite"):
            _active_model_name = row.value
            return _active_model_name
    except Exception:
        pass

    # Fall back to env var
    use_tflite = os.getenv("USE_TFLITE", "false").lower() in ("true", "1", "yes")
    _active_model_name = "tflite" if use_tflite else "randomforest"
    return _active_model_name


def set_active_model(name: str) -> None:
    """Called by the detection-config API to switch models at runtime."""
    global _active_model_name
    name = name.lower().strip()
    if name not in ("randomforest", "tflite"):
        raise ValueError(f"Unknown model: {name}")
    _active_model_name = name
    print(f"[detection_engine] Active model switched to: {name}")


def get_model():
    """Return the currently active model instance."""
    model_name = _resolve_model_name()

    if model_name == "tflite":
        try:
            import sys
            import os as _os
            # Add ml/ to path so tflite_inference can find model.tflite
            ml_dir = _os.path.join(
                _os.path.dirname(_os.path.abspath(__file__)), "..", "..", "ml"
            )
            if ml_dir not in sys.path:
                sys.path.insert(0, ml_dir)
            from tflite_model.tflite_inference import TFLiteInference
            return TFLiteInference()
        except Exception as exc:
            print(f"[detection_engine] TFLite load failed ({exc}), falling back to RandomForest")

    from .anomaly_model import AnomalyModel
    return AnomalyModel()
