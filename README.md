# BurnCalendar

One fire record from MODIS and VIIRS, for India, Bangladesh, Myanmar and Nepal, from November 2000 to today.

Built for the NASA Space Apps Challenge 2026, challenge **"Harmonization of MODIS and VIIRS Hot Spots"**.

![BurnCalendar showing Punjab: map of monthly activity and the burning activity calendar](docs/screenshot.jpg)

## What it does

- **Harmonized record.** MODIS (Terra, Aqua) and VIIRS (S-NPP, NOAA-20) active-fire detections on one grid, one daily time step and one scale.
- **Burning activity calendar.** A month × year heatmap for any country, state or drawn area, plus a day × year calendar for countries and states.
- **Early warning.** The last 30 days against the same 30 days in every year since 2003, as a map and a ranked list of states.
- **Area of interest.** Click a state, draw a box, or type `lat, lon` or `W, S, E, N`.
- **Downloads.** Monthly series as CSV, the latest hotspots in the area as CSV, and the calendar as an SVG image.

## How the harmonization works

1. **One schema.** Every detection is read into one table with a sensor label. Presumed vegetation fires are kept (`type = 0`). Low-confidence detections are dropped (MODIS confidence < 30, VIIRS `low`).
2. **Static-source mask.** Near-real-time rows carry no `type`, so industrial heat sources would leak into the newest months. A grid cell is masked for those rows if the archive saw at least 5 non-vegetation detections there and they make up at least a quarter of its typed detections (793 cells).
3. **Active cell-days.** Detections are snapped to a fixed 0.05° grid. The unit of activity is the active cell-day: a cell with at least one detection on a UTC day. It removes duplicates across satellites by construction and is much less sensitive to pixel size than raw counts. For South Asia a UTC day groups the afternoon overpass with the following night overpass.
4. **One scale.** S-NPP active cell-days are the reference. For each state and calendar month, a factor `k = Σ S-NPP / Σ other sensor` is fitted on the overlap years and shrunk toward the country-month and all-area-month values when counts are small (prior weight 100 cell-days).
5. **One record.**

   | Period | Source | Factor |
   |---|---|---|
   | Nov 2000 – 3 Jul 2002 | Terra alone | Terra → Terra+Aqua (fitted 2003–2007) × MODIS → S-NPP |
   | 4 Jul 2002 – 19 Jan 2012 | Terra + Aqua | MODIS → S-NPP (fitted 2012–2025) |
   | 20 Jan 2012 – 2025 | S-NPP | 1 (reference) |
   | 2026 onward | NOAA-20 | NOAA-20 → S-NPP (fitted Apr 2018 – 2025) |

   S-NPP's near-real-time feed thins during 2026 and stops on 2 November 2026, so the record hands over to NOAA-20 at the start of 2026.

The grid is 0.05° for counting. The web app sums cells into 0.25° tiles for the map and for drawn areas.

## Validation

Factors were fitted on even years and tested on odd years, and the reverse, for 2012–2025. Each point is one state in one year (980 state-years).

| MODIS estimate of S-NPP | Median absolute error | Total ratio |
|---|---|---|
| Raw MODIS | 78.6% | 0.246 |
| One factor for everywhere | 26.9% | 1.000 |
| **State and month factors (this project)** | **10.1%** | **1.000** |

- At state-month level the calibrated median error is 15.4% (9,929 state-months).
- The Terra-alone chain, tested on 2008–2011 (not used for its fit), has a median error of 11.6%.
- NOAA-20 calibrated to S-NPP has a median error of 2.9% on held-out years.
- Monthly MODIS and S-NPP activity over the whole area correlate at r = 0.989; S-NPP sees 4.06 times as many active cell-days.

![Validation figure](docs/validation.png)

## Limits

- MODIS misses small fires that VIIRS sees. A factor restores the average for a state and month, not individual fires, so pre-2012 values are estimates.
- 2000–2002 (Terra alone) is the least certain part. Medians and percentiles use 2003 onward.
- The newest months use near-real-time data, which NASA later reprocesses. Early-warning results are provisional.
- NOAA-21 is downloaded and shown in the latest hotspots, but is not yet part of the index.
- Drawn areas use 0.25° tiles and include a tile when its centre is inside the box.
- State boundaries come from Natural Earth (admin-1, v5). They are dated in places (Bangladesh has 7 divisions, Nepal uses the old zones) and are not authoritative.

## Numbers

- 29,108,109 detections read; 22,318,303 kept inside the four countries.
- 9,226,754 active cell-days, 1 November 2000 to 14 November 2026.
- 71 states and divisions, 6,075 map tiles, 313 months.

## Reproduce

```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -I pipeline/download.py data/raw Bangladesh Nepal Myanmar India   # ~1.8 GB, no key needed
echo "FIRMS_MAP_KEY=your_key" > .env
.venv/bin/python -I pipeline/download_api.py .env data/raw_api                     # current year, ~350 MB
# Natural Earth admin-1 shapefile unzipped into data/geo/
.venv/bin/python -I pipeline/harmonize.py data/raw data/raw_api data/geo data/out
.venv/bin/python -I pipeline/build.py data/out data/raw_api web/public/data docs
cd web && npm install && npm run dev
```

The web app is static: everything it needs is precomputed into `web/public/data` (about 10 MB).

## Data and tools

- **NASA data:** FIRMS active fire products — MODIS Collection 6.1 (MCD14ML standard, MCD14DL near-real-time) and VIIRS 375 m for S-NPP, NOAA-20 and NOAA-21 (standard and near-real-time), from the FIRMS country archive and the FIRMS area API.
- **Other data:** Natural Earth admin-1 boundaries; CARTO Dark Matter basemap with OpenStreetMap data.
- **Pipeline:** Python, Polars, DuckDB, pandas, NumPy, GeoPandas, Shapely, Matplotlib, Requests.
- **Web:** Next.js, React, TypeScript, MapLibre GL JS.

## Use of AI

Code, documentation and the project text were written with Claude (Anthropic), used as an AI coding assistant, and reviewed by the team. No AI-generated images or video are used. This is not a NASA product and uses no NASA branding.
