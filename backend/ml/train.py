"""Train the 30-minute forecast model and save it to backend/ml/model.json.

Run:  python -m backend.ml.train

Training data: 60 days of simulated 15-minute readings for every place (see backend/meter.py).
Replace this with real metered history when you have it; the features stay the same.
"""

import json
import time

import numpy as np

from ..data import LOADS, PROFILES
from ..meter import reading
from .forecast import HORIZON, MODEL_FILE, features

DAYS, HOLDOUT_DAYS, STEP = 60, 10, 900
RIDGE = 1e-3


def build(kind: str, start: float, end: float):
    X, y = [], []
    for load in (l for l in LOADS if l["profile"] == kind):
        for ts in np.arange(start, end, STEP):
            X.append(features(load, float(ts)))
            y.append(reading(load, float(ts) + HORIZON) / load["peak"])
    return np.array(X), np.array(y)


def main(now: float | None = None):
    now = now or time.time()
    start, split = now - DAYS * 86400, now - HOLDOUT_DAYS * 86400
    weights, errors = {}, {}
    for kind in PROFILES:
        X, y = build(kind, start, split)
        w = np.linalg.solve(X.T @ X + RIDGE * np.eye(X.shape[1]), X.T @ y)
        Xt, yt = build(kind, split, now - HORIZON)
        errors[kind] = float(np.mean(np.abs(Xt @ w - yt) / yt) * 100)
        weights[kind] = [round(float(v), 6) for v in w]
    model = {
        "type": "ridge regression, one per kind of place",
        "features": ["bias", "now", "30 min ago", "same time yesterday", "sin(time of day)", "cos(time of day)", "weekend"],
        "horizon_minutes": HORIZON // 60,
        "trained_days": DAYS - HOLDOUT_DAYS, "tested_days": HOLDOUT_DAYS,
        "trained_on": "simulated history (backend/meter.py)",
        "error_percent": {k: round(v, 2) for k, v in errors.items()},
        "weights": weights,
    }
    MODEL_FILE.write_text(json.dumps(model, indent=1))
    print("Saved", MODEL_FILE)
    for k, v in errors.items():
        print(f"  {k:10s} average error on {HOLDOUT_DAYS} unseen days: {v:.2f}%")


if __name__ == "__main__":
    main()
