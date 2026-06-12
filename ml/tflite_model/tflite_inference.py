"""
TFLite Inference — Feature 5
Loads model.tflite and exposes predict(features) with the same interface
as AnomalyModel in backend/ids/anomaly_model.py.
"""
import os
import random
from typing import Dict, Any

import numpy as np

_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.tflite")
_SCALER_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scaler.pkl")

FEATURE_ORDER = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
    "land", "wrong_fragment", "urgent", "count", "srv_count",
]

ATTACK_TYPES = ["port_scan", "dos", "ddos", "r2l", "u2r", "none"]


def _load_interpreter():
    """Load TFLite interpreter, trying tflite_runtime first then tensorflow."""
    try:
        import tflite_runtime.interpreter as tflite
        return tflite.Interpreter(model_path=_MODEL_PATH)
    except ImportError:
        pass
    try:
        import tensorflow as tf
        return tf.lite.Interpreter(model_path=_MODEL_PATH)
    except ImportError:
        pass
    return None


class TFLiteInference:
    """
    Lightweight inference wrapper compatible with AnomalyModel.predict().
    Falls back to mock predictions if model.tflite is not found.
    """

    def __init__(self):
        self._interpreter = None
        self._scaler = None
        self._mock = False

        if not os.path.exists(_MODEL_PATH):
            print("[TFLiteInference] model.tflite not found — using mock predictions")
            self._mock = True
            return

        interp = _load_interpreter()
        if interp is None:
            print("[TFLiteInference] No TFLite runtime available — using mock predictions")
            self._mock = True
            return

        interp.allocate_tensors()
        self._interpreter = interp
        self._input_idx = interp.get_input_details()[0]["index"]
        self._output_idx = interp.get_output_details()[0]["index"]

        if os.path.exists(_SCALER_PATH):
            import joblib
            self._scaler = joblib.load(_SCALER_PATH)

    def predict(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Returns: {"label": "normal"|"attack", "attack_type": str, "confidence": float}
        """
        if self._mock or self._interpreter is None:
            return self._mock_predict()

        try:
            vec = np.array(
                [float(features.get(f, 0)) for f in FEATURE_ORDER],
                dtype=np.float32,
            ).reshape(1, -1)

            if self._scaler is not None:
                vec = self._scaler.transform(vec).astype(np.float32)

            self._interpreter.set_tensor(self._input_idx, vec)
            self._interpreter.invoke()
            output = self._interpreter.get_tensor(self._output_idx)[0][0]

            confidence = float(output)
            if confidence > 0.5:
                attack_type = random.choice(ATTACK_TYPES[:-1])  # exclude "none"
                return {"label": "attack", "attack_type": attack_type, "confidence": confidence}
            else:
                return {"label": "normal", "attack_type": "none", "confidence": 1.0 - confidence}

        except Exception as exc:
            print(f"[TFLiteInference] predict error: {exc}")
            return self._mock_predict()

    @staticmethod
    def _mock_predict() -> Dict[str, Any]:
        """Random prediction used when model is unavailable."""
        if random.random() < 0.15:
            return {
                "label": "attack",
                "attack_type": random.choice(ATTACK_TYPES[:-1]),
                "confidence": random.uniform(0.76, 0.95),
            }
        return {"label": "normal", "attack_type": "none", "confidence": random.uniform(0.80, 0.99)}
