# Pune Power Brain: technical specification

## 1. Goal

A real-time dashboard for Pune's grid. Every second it predicts each asset's demand 30 minutes
ahead and uses a digital-logic controller to shed load before an overload. Essential services
are never shed. The grid is shown as a 3D brain whose nodes are the assets and whose links are
the power hierarchy.

## 2. Architecture

```
 browser (frontend/)                         server (backend/, FastAPI + uvicorn)
 ┌──────────────────────────┐   every 1 s   ┌─────────────────────────────────────────────┐
 │ app.js  clock (IST), UI  │──GET /api/state──▶ logic.Controller.step(time.time())       │
 │ brain3d.js  three.js 3D  │◀── JSON ──────│   meter.readings(ts)      now, per place    │
 │ styles.css light / dark  │               │   ml.forecast.predict     t+30 min          │
 └──────────────────────────┘   on select   │   logic.control           comparator,       │
            │───GET /api/history/{id}──────▶│                            counter, decoder  │
            │───GET /api/config (once)─────▶│ data.py  assets + hierarchy                 │
                                            │ ml/model.json  trained weights              │
                                            │ data/msedcl_pune.json (optional)            │
                                            └─────────────────────────────────────────────┘
 offline jobs:  python -m backend.ml.train              ->  backend/ml/model.json
                python -m backend.pipeline.fetch_msedcl ->  data/msedcl_pdfs/, data/msedcl_pune.json
```

The online demo is the same page with the engine ported to JavaScript (`window.LOCAL_ENGINE`).
It gives identical numbers to the Python engine at the same timestamp.

## 3. Asset model (`backend/data.py`)

| Level | Count | Example |
|---|---|---|
| Grid in-feed | 1 | Pune grid in-feed (Lonikand 400 kV) |
| Substations (one per region) | 4 | Rastapeth 132 kV, Hinjawadi 220 kV, Magarpatta 132 kV, Chakan 400 kV |
| Areas | 29 | Kothrud, Hinjawadi, Viman Nagar, Bhosari |
| Places | 82 (25 essential, 57 sheddable) | Sassoon Hospital, Hinjawadi IT Park Phase 1, Chakan MIDC plant |

Each place has: kind, peak MW, daily profile, region, area, tier and shed rank (0 to 56).
Ranks go tier by tier (shops and lighting, homes, IT, factories), round-robin across regions.
Substation names and MW values are illustrative.

## 4. Data pipeline

| Source | What it contains | How it is used |
|---|---|---|
| System clock | Real time (UTC, shown as IST) | Drives every reading, prediction and control step. No mocked timestamps. |
| `meter.py` | Simulated reading per place: peak × hourly profile (interpolated per second) × weekday factor × day-to-day swing × small periodic wiggle | Stand-in for live meters. Deterministic in time. |
| MSEDCL Go-Live Town Reports | Monthly PDFs per town, reports D1 to D7 (AT&C loss, connections, complaints, high-loss feeders, reliability, feeder communication, online collection) | `fetch_msedcl.py` scrapes the page for PDF links, downloads them, extracts table rows mentioning Pune divisions with pdfplumber, and saves `data/msedcl_pune.json`. Shown in the UI as town-level context. |

Why MSEDCL data does not train the forecast: the reports hold no time series of load, and nothing
per asset. A 30-minute forecast needs sub-hourly per-asset readings. If a real meter feed (for
example SCADA or AMI data) becomes available, it replaces `meter.reading` and the training script
runs unchanged.

## 5. Model (`backend/ml/`)

- **Task:** predict demand at t + 30 min for every place, every second.
- **Model:** ridge regression, one per profile (6 models, 7 weights each), λ = 1e-3.
- **Features** (normalised by the place's peak): bias, reading(t), reading(t − 30 min),
  reading(t + 30 min − 1 day), sin and cos of time of day at t + 30 min, weekend flag.
- **Training data:** 60 days of simulated history at 15-minute steps, all 82 places.
  Chronological split: 50 days train, last 10 days test.
- **Test error** (mean absolute percentage): shops 2.25%, landmark 3.17%, homes 2.34%,
  IT 3.25%, factory 2.19%, essential 1.71%.
- **Inference:** 82 dot products per second, well under a millisecond.
- Weights are saved in `model.json` with the feature list and error, and shown in the UI.

## 6. Controller (`backend/logic.py`)

Runs on the predicted demand vector each second.

- Comparator: OVER = (A > B), SPARE = (L > 0 and A + d(next) ≤ B), where A is the predicted load of
  places that are ON and B is supply (minus 400 MW if the grid-fault switch is on).
- Up/down counter L, 6 bits, 0 to 57, kept between seconds. OVER counts up, SPARE counts down.
  It ticks until neither applies.
- Decoder: sheddable place with rank k is ON when k ≥ L.
- Essential lock: relay = 1 OR x = 1.

## 7. API

| Endpoint | Returns |
|---|---|
| `GET /api/config` | grid, regions, areas, loads, limits, model info (no weights), MSEDCL summary or null |
| `GET /api/state?supply=&fault=` | ts, supply, now[], pred[], total_now, total_pred, level, level_bits, relays[], load, over, ticks[] |
| `GET /api/history/{place}` | past: readings every 5 min for the last 2 h; ahead: predictions for the next 30 min |

## 8. UI

- **Layout:** header with live IST clock and a light/dark toggle, 5 KPI cards, the brain (centre), controls,
  a selected-node panel and surge alerts (side), the circuit, place search and data sources.
- **Brain (three.js r128):** a deterministic wireframe mesh (cerebrum ellipsoid, cerebellum, stem) with
  nearest-neighbour links, faint. Asset nodes are spheres sized by level. Each region's
  substation sits in a lobe with its areas and places around it. Links go in-feed → substation →
  area → place.
- **Transparent canvas:** colours come from CSS variables, so it follows light and dark mode.
- **Overlays:** node and link colour is a heat map of predicted change (steady → rising → surge ≥ 8%).
  Surge nodes get a pulsing additive glow. Shed places get a red ring, and essential places are green.
- **Interaction:** hover tooltip, tap to select (details with a 2 h + 30 min chart), drag to rotate,
  idle auto-rotate.
- **Palette:** whitish peach with accent #DE7356 (light); slate and indigo (dark).

## 9. Limits and honesty

- Readings are simulated, so predictions are about simulated demand, not the real Pune grid.
- The model is about 2 to 3% off on average on test data. It is not exact.
- MSEDCL data is monthly and town-level; it is context only.
- Place names are real; substation names and MW values are examples.

## 10. Tests (`tests/test_deam.py`)

IST clock, repeatable readings, model error below 5%, shed order, decoder and essential lock,
controller behaviour, counter memory between seconds, MSEDCL link scraper, API round trip.
