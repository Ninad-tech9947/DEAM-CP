import time

from fastapi.testclient import TestClient

from backend.app import app
from backend.data import LOADS, N_SHED
from backend.logic import Controller, control, relay
from backend.meter import ist_parts, reading
from backend.ml.forecast import load_model, predict_demand
from backend.pipeline.fetch_msedcl import pdf_links, report_code

client = TestClient(app)
MODEL = load_model()
ESSENTIAL = [l["id"] for l in LOADS if l["essential"]]
NOON_MONDAY_IST = 1790577000  # 2026-09-28 12:00 IST, a Monday


def test_clock_uses_pune_time():
    day, dow, sec = ist_parts(NOON_MONDAY_IST)
    assert dow == 0 and sec == 12 * 3600


def test_meter_is_repeatable_and_positive():
    assert reading(LOADS[0], NOON_MONDAY_IST) == reading(LOADS[0], NOON_MONDAY_IST) > 0


def test_model_is_accurate_on_unseen_days():
    assert all(err < 5 for err in MODEL["error_percent"].values())
    for load in LOADS[:10]:
        pred = predict_demand(load, NOON_MONDAY_IST, MODEL)
        real = reading(load, NOON_MONDAY_IST + 1800)
        assert abs(pred - real) / real < 0.15


def test_ranks_cover_every_sheddable_place_once():
    assert sorted(l["rank"] for l in LOADS if not l["essential"]) == list(range(N_SHED))


def test_decoder_and_essential_lock():
    first = next(l for l in LOADS if l["rank"] == 0)
    assert relay(first, 1) is False and relay(first, 0) is True
    assert all(relay(LOADS[i], N_SHED) for i in ESSENTIAL)


def test_controller_fits_supply_and_keeps_essentials_on():
    demand = [100.0] * len(LOADS)
    out = control(demand, 10000, 0)
    assert out["level"] == 0
    out = control(demand, 100 * len(ESSENTIAL) + 250, 0)
    assert not out["over"] and all(out["relays"][i] for i in ESSENTIAL)
    out = control(demand, 10, 0)
    assert out["over"] and out["level"] == N_SHED and all(out["relays"][i] for i in ESSENTIAL)


def test_counter_is_remembered_between_seconds():
    c = Controller(MODEL)
    first = c.step(NOON_MONDAY_IST, 1200, False)
    second = c.step(NOON_MONDAY_IST + 1, 1200, False)
    assert first["level"] > 0 and len(second["ticks"]) <= len(first["ticks"])


def test_msedcl_link_scraper():
    html = '<a href="https://x/uploads/2025/02/D1-REPORT-JAN25.pdf">D1</a><a href="/y/D5-REPORT-JAN25.PDF">D5</a><a href="https://x/uploads/2025/02/D1-REPORT-JAN25.pdf">again</a>'
    links = pdf_links(html)
    assert len(links) == 2 and report_code("D5-REPORT-JAN25.PDF") == "D5"


def test_api_round_trip():
    cfg = client.get("/api/config").json()
    assert len(cfg["regions"]) == 4 and cfg["model"]["horizon_minutes"] == 30
    st = client.get("/api/state", params={"supply": 1500, "fault": True}).json()
    assert len(st["pred"]) == len(LOADS) and abs(st["ts"] - time.time()) < 5
    hist = client.get("/api/history/0").json()
    assert len(hist["past"]) == 25 and len(hist["ahead"]) == 7
    assert "Power Brain" in client.get("/").text
