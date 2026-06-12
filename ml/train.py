import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timezone
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, accuracy_score, precision_recall_fscore_support
import joblib
import json
import os


# Column names for the NSL-KDD dataset
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
    "dst_host_rerror_rate", "dst_host_srv_rerror_rate", "label", "difficulty_level"
]


def _write_metrics(payload: dict) -> None:
    out = Path(__file__).resolve().parent / "training_metrics.json"
    payload.setdefault("trained_at_iso", datetime.now(timezone.utc).isoformat())
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Metrics saved to {out}")


def train_model(data_path="ml/KDDTrain+.txt"):
    """
    Train a RandomForest model on the NSL-KDD dataset.
    """
    if not os.path.exists(data_path):
        print(f"Dataset not found at {data_path}. Please download the NSL-KDD dataset.")
        print("Mock training complete (generating a dummy model).")
        # For demo purposes, we'll create a dummy model if the dataset is missing
        # This allows the rest of the app to function
        from sklearn.datasets import make_classification

        X, y = make_classification(n_samples=1000, n_features=20, random_state=42)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        model = RandomForestClassifier(n_estimators=100, max_depth=15)
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        acc = float(accuracy_score(y_test, y_pred))
        p, r, f1, sup = precision_recall_fscore_support(
            y_test, y_pred, average="binary", zero_division=0
        )
        joblib.dump(model, "ml/model.pkl")
        _write_metrics(
            {
                "dataset": "synthetic_fallback (make_classification)",
                "dataset_path": data_path,
                "model": "RandomForestClassifier",
                "note": "NSL-KDD file missing — metrics are for a synthetic binary toy problem only, not for thesis attack detection benchmarks.",
                "accuracy_test_holdout": acc,
                "precision_binary_average": float(p),
                "recall_binary_average": float(r),
                "f1_binary_average": float(f1),
                "n_test_samples": int(len(y_test)),
            }
        )
        print("Accuracy:", acc)
        print("Classification Report:\n", classification_report(y_test, y_pred, zero_division=0))
        return

    # Load dataset
    df = pd.read_csv(data_path, names=COLUMNS)
    
    # Feature selection (using features available at runtime from packets)
    selected_features = [
        "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
        "land", "wrong_fragment", "urgent", "count", "srv_count"
    ]
    
    X = df[selected_features]
    y = df["label"].apply(lambda x: "normal" if x == "normal" else "attack")
    
    # Encode categorical features
    label_encoders = {}
    for col in ["protocol_type", "service", "flag"]:
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col])
        label_encoders[col] = le
        
    # Save label encoders and feature list
    with open("ml/encoders.json", "w") as f:
        # Serializing encoders is tricky, simplified here
        pass
    
    with open("ml/features.json", "w") as f:
        json.dump(selected_features, f)

    # Train/Test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Model: RandomForest
    model = RandomForestClassifier(n_estimators=100, max_depth=15)
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    acc = float(accuracy_score(y_test, y_pred))
    print("Accuracy:", acc)
    print("Classification Report:\n", classification_report(y_test, y_pred))
    labs = ["normal", "attack"]
    p, r, f1, sup = precision_recall_fscore_support(
        y_test, y_pred, labels=labs, zero_division=0
    )
    per_label = {}
    for i, lab in enumerate(labs):
        per_label[lab] = {
            "precision": float(p[i]),
            "recall": float(r[i]),
            "f1_score": float(f1[i]),
            "support": int(sup[i]),
        }

    # Save model
    joblib.dump(model, "ml/model.pkl")
    print("Model saved to ml/model.pkl")

    _write_metrics(
        {
            "dataset": "NSL-KDD",
            "dataset_path": data_path,
            "model": "RandomForestClassifier",
            "accuracy_test_holdout": acc,
            "per_label_metrics": per_label,
            "n_test_samples": int(len(y_test)),
            "classification_report_lines": classification_report(y_test, y_pred).splitlines(),
        }
    )

if __name__ == "__main__":
    train_model()
