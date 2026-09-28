# Pune Power Brain (Digital Electronics project)

A live dashboard for Pune's electricity grid, drawn as a 3D brain. Every bright node is a part of
the grid: the city in-feed, 4 substations, 29 areas and 82 named places (hospitals, homes, IT parks,
factories and more). The lines between them follow how power flows: in-feed, then substation, then
area, then place.

Every second, using your computer's real clock (Pune time):

1. each place gets a meter reading,
2. a small machine-learning model predicts each place's demand **30 minutes from now**,
3. a digital circuit (comparator, up/down counter, decoder, essential lock) switches off places
   **before** the overload arrives. Hospitals, water, fire, police, telecom and transport always stay on.

Nodes that are about to surge glow and pulse red. Places that are switched off get a red ring.

**Honest note:** there is no public live, per-place power feed for Pune. The meter readings are
simulated from realistic daily patterns, and the model is trained on that simulated history.
The MSEDCL Go-Live Town Reports are monthly PDFs for whole towns, so they are shown as context,
not used for training. Place names are real, MW numbers are examples for learning.

Read **HOW_IT_WORKS.md** for a plain explanation (for your report and viva) and **SPEC.md** for the
technical specification.

## Run it

You need Python 3.10 or newer. Unzip, open a terminal, and go into the inner folder
(the one that contains `run.py`):

```bash
cd pune-deam-simulator
python -m pip install -r requirements.txt
python run.py
```

Then open http://127.0.0.1:8000 in your browser. To stop the server, press Ctrl + C.

On Windows, if `python` is not found, use `py` instead: `py -m pip install -r requirements.txt` and `py run.py`.

### Optional extras

```bash
python -m pytest                         # run the tests
python -m backend.ml.train               # retrain the 30-minute model (writes backend/ml/model.json)
python -m pip install pdfplumber         # needed only for the next line
python -m backend.pipeline.fetch_msedcl  # download the MSEDCL town reports and pull out Pune rows
```

After downloading the MSEDCL reports, restart `python run.py`. Their Pune rows then show in
"Where the data comes from".

## What you can do

- **Electricity available** slider and **Grid fault** switch (lose 400 MW)
- Drag the brain to turn it, tap any node to see its demand now and in 30 minutes
- **Surge alerts**: places whose demand will rise 8% or more in the next 30 minutes
- **Find a place**: search by name, or list what is switched off, surging or essential
- **Dark mode / Light mode** button

## Files

```
README.md, HOW_IT_WORKS.md, SPEC.md
run.py                       start the server
requirements.txt
backend/
  data.py                    4 regions, 29 areas, 82 places, switch-off order, daily patterns
  meter.py                   simulated meter reading for every place, from the real clock
  logic.py                   the circuit: comparator, up/down counter, decoder, essential lock
  app.py                     FastAPI server: /api/config, /api/state, /api/history/{place}
  ml/forecast.py             the 30-minute prediction
  ml/train.py                trains the model, saves ml/model.json
  pipeline/fetch_msedcl.py   downloads and reads the MSEDCL Go-Live Town Reports
frontend/
  index.html, styles.css, app.js   the dashboard
  brain3d.js                 the 3D brain (three.js, in vendor/)
tests/test_deam.py
```
