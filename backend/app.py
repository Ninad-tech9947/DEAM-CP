"""FastAPI server for the Pune Power Brain dashboard."""

import json
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from .data import AREAS, DEFAULTS, FAULT_LOSS, GRID_NAME, L_BITS, LOADS, N_SHED, REGIONS, SURGE_ALERT
from .logic import Controller
from .meter import reading
from .ml.forecast import HORIZON, load_model, predict_demand

ROOT = Path(__file__).resolve().parent.parent
MSEDCL_FILE = ROOT / "data" / "msedcl_pune.json"

app = FastAPI(title="Pune Power Brain")
MODEL = load_model()
controller = Controller(MODEL)
lock = threading.Lock()


def msedcl_summary():
    if not MSEDCL_FILE.exists():
        return None
    data = json.loads(MSEDCL_FILE.read_text())
    return [{"file": r["file"], "report": r["report"], "title": r["title"], "rows": r["pune_rows"][:5]}
            for r in data["reports"] if r["pune_rows"]]


@app.get("/api/config")
def config():
    return {"grid": GRID_NAME, "regions": REGIONS, "areas": AREAS, "loads": LOADS, "n_shed": N_SHED, "l_bits": L_BITS,
            "defaults": DEFAULTS, "fault_loss": FAULT_LOSS, "surge_alert": SURGE_ALERT,
            "model": {k: v for k, v in MODEL.items() if k != "weights"}, "msedcl": msedcl_summary()}


@app.get("/api/state")
def state(supply: float = DEFAULTS["supply"], fault: bool = False):
    """Called every second: readings now, predictions for +30 min, and the controller's decision."""
    with lock:
        return controller.step(time.time(), supply, fault)


@app.get("/api/history/{place}")
def history(place: int):
    """Last 2 hours of readings (every 5 min) and the model's forecast path for the next 30 min."""
    if not 0 <= place < len(LOADS):
        raise HTTPException(404, "No such place")
    load, now = LOADS[place], time.time()
    past = [[now - s, round(reading(load, now - s), 2)] for s in range(7200, -1, -300)]
    ahead = [[now + s, round(predict_demand(load, now + s - HORIZON, MODEL), 2)] for s in range(0, HORIZON + 1, 300)]
    return {"past": past, "ahead": ahead}


app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")
