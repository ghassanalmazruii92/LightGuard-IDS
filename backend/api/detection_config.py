"""
Detection Config API
GET  /api/detection-config        → read all key/value pairs
PATCH /api/detection-config/model → update active_model (randomforest | tflite)
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db, DetectionConfig
from auth import get_current_user, admin_required

router = APIRouter()


def _get_all_config(db: Session) -> dict:
    rows = db.query(DetectionConfig).all()
    return {r.key: r.value for r in rows}


def _upsert(db: Session, key: str, value: str) -> None:
    row = db.query(DetectionConfig).filter(DetectionConfig.key == key).first()
    if row is None:
        row = DetectionConfig(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()


@router.get("/detection-config")
async def get_detection_config(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = _get_all_config(db)
    # Provide sensible defaults for keys that haven't been set yet
    config.setdefault("anomaly_threshold", "75.0")
    config.setdefault("last_tuned", "Never")
    config.setdefault("last_fp_rate", "N/A")
    config.setdefault("active_model", os.getenv("USE_TFLITE", "false") == "true" and "tflite" or "randomforest")
    return config


class ModelUpdate(BaseModel):
    model: str  # "randomforest" or "tflite"


@router.patch("/detection-config/model")
async def update_detection_model(
    body: ModelUpdate,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db),
):
    model_name = body.model.lower().strip()
    if model_name not in ("randomforest", "tflite"):
        raise HTTPException(status_code=400, detail="model must be 'randomforest' or 'tflite'")

    _upsert(db, "active_model", model_name)

    # Also update the live engine switch
    try:
        from backend.ids.detection_engine import set_active_model
        set_active_model(model_name)
    except Exception as exc:
        print(f"[detection_config] set_active_model warning: {exc}")

    return {"active_model": model_name, "status": "updated"}
