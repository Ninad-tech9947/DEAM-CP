"""30-minute-ahead demand forecast for every place.

The model is a small linear regression per kind of place, trained by backend/ml/train.py.
For a place at time t it predicts demand at t + 30 minutes from:

    [1, now, 30 min ago, same time yesterday (t + 30 min - 1 day),
     sin and cos of the time of day at t + 30 min, weekend flag]

All values are divided by the place's peak first, so one model fits every place of that kind.
"""

import json
import math
from pathlib import Path

from ..meter import ist_parts, reading

HORIZON = 1800  # seconds ahead (30 minutes)
MODEL_FILE = Path(__file__).with_name("model.json")


def features(load: dict, ts: float) -> list[float]:
    peak = load["peak"]
    _, dow, sec = ist_parts(ts + HORIZON)
    ang = 2 * math.pi * sec / 86400
    return [1.0, reading(load, ts) / peak, reading(load, ts - HORIZON) / peak,
            reading(load, ts + HORIZON - 86400) / peak, math.sin(ang), math.cos(ang), 1.0 if dow >= 5 else 0.0]


def load_model() -> dict:
    return json.loads(MODEL_FILE.read_text())


def predict_demand(load: dict, ts: float, model: dict) -> float:
    """Predicted demand in MW for one place, 30 minutes after ts."""
    w = model["weights"][load["profile"]]
    return load["peak"] * sum(a * b for a, b in zip(w, features(load, ts)))
