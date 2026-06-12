"""
TFLite Model Training — Feature 5
Trains a lightweight neural network on NSL-KDD data (or synthetic fallback)
and converts it to TFLite format for edge/fog deployment.

Usage:
    cd /path/to/Ghassan
    python -m ml.tflite_model.train_tflite
"""
import os
import numpy as np
import joblib

# ── Feature columns (same subset as ml/train.py) ─────────────────────────────

FEATURE_COLS = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
    "land", "wrong_fragment", "urgent", "count", "srv_count",
]

COLUMNS = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
    "land", "wrong_fragment", "urgent", "hot", "num_failed_logins", "logged_in",
    "num_compromised", "root_shell", "su_attempted", "num_root", "num_file_creations",
    "num_shells", "num_access_files", "num_outbound_cmds", "is_host_login",
    "is_guest_login", "count", "srv_count", "serror_rate", "srv_serror_rate",
    "rerror_rate", "srv_rerror_rate", "same_srv_rate", "diff_srv_rate",
    "srv_diff_host_rate", "dst_host_count", "dst_host_srv_count",
    "dst_host_same_srv_rate", "dst_host_diff_srv_rate", "dst_host_same_src_port_rate",
    "dst_host_srv_diff_host_rate", "dst_host_serror_rate", "dst_host_srv_serror_rate",
    "dst_host_rerror_rate", "dst_host_srv_rerror_rate", "label", "difficulty_level",
]

_OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_data(data_path: str):
    import pandas as pd
    from sklearn.preprocessing import LabelEncoder

    df = pd.read_csv(data_path, names=COLUMNS)
    X = df[FEATURE_COLS].copy()
    y = df["label"].apply(lambda v: 0 if v == "normal" else 1).values.astype(np.float32)

    for col in ["protocol_type", "service", "flag"]:
        X[col] = LabelEncoder().fit_transform(X[col].astype(str))

    return X.values.astype(np.float32), y


def _synthetic_data():
    """Fallback when NSL-KDD dataset is not available."""
    from sklearn.datasets import make_classification
    X, y = make_classification(
        n_samples=2000, n_features=len(FEATURE_COLS), n_informative=8,
        random_state=42,
    )
    return X.astype(np.float32), y.astype(np.float32)


def train(data_path: str = "ml/KDDTrain+.txt"):
    try:
        import tensorflow as tf
    except ImportError:
        print("[train_tflite] TensorFlow not installed. Install it with: pip install tensorflow")
        return

    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split

    print("[train_tflite] Loading data …")
    if os.path.exists(data_path):
        X, y = _load_data(data_path)
        print(f"[train_tflite] Loaded NSL-KDD: {X.shape[0]} samples")
    else:
        print("[train_tflite] NSL-KDD not found — using synthetic data")
        X, y = _synthetic_data()

    scaler = StandardScaler()
    X = scaler.fit_transform(X)
    joblib.dump(scaler, os.path.join(_OUT_DIR, "scaler.pkl"))

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # 3-layer neural network
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(X.shape[1],)),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(1, activation="sigmoid"),
    ])
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])

    print("[train_tflite] Training …")
    model.fit(X_train, y_train, epochs=10, batch_size=64, validation_split=0.1, verbose=1)

    loss, acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"[train_tflite] Test accuracy: {acc:.4f}")

    # Convert to TFLite
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()

    out_path = os.path.join(_OUT_DIR, "model.tflite")
    with open(out_path, "wb") as f:
        f.write(tflite_model)
    print(f"[train_tflite] TFLite model saved to {out_path}")


if __name__ == "__main__":
    train()
