# Progress

NASA Space Apps 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots".
Deadline: Sun Nov 15, 11:59 PM Dhaka. Internal target: 9:00 PM.

## State (Sat Nov 14, afternoon)
The product is built and runs locally end to end. Not deployed, not pushed to GitHub.

- Pipeline: `download.py`, `download_api.py`, `harmonize.py`, `build.py` (see README "Reproduce").
- Data on disk (git-ignored): `data/raw` 1.8 GB archive, `data/raw_api` 349 MB for 2026, `data/geo` Natural Earth.
- App: `web/` (Next.js 16, MapLibre GL JS 4.7). Static data in `web/public/data` (10 MB, committed).
- Docs: `README.md`, `docs/validation.png`, `docs/screenshot.jpg`, `docs/SUBMISSION.md` (project-page text, demo script, CV line).

## Key results
- 29,108,109 detections read, 22,318,303 kept, 9,226,754 active cell-days, Nov 2000 to 14 Nov 2026.
- MODIS → S-NPP on held-out years, per state-year: 10.1% median error (raw 78.6%, single factor 26.9%).
- Terra-alone chain: 11.6% (2008–2011). NOAA-20 → S-NPP: 2.9%.

## Decisions made (and why)
- Unit is the active cell-day on a 0.05° grid, not raw counts: robust to pixel size and duplicates.
- S-NPP is the reference scale. Handover to NOAA-20 on 2026-01-01, because S-NPP near-real-time thins
  through 2026 (S-NPP/NOAA-20 ratio falls from ~0.95 to 0.65–0.87) and stops on 2026-11-02.
- Terra-alone years are chained through 2003–2007 Terra+Aqua. Fitting Terra straight to S-NPP
  overshot (Punjab 2001 came out at 45k cell-days vs ~30k in neighbouring years).
- Climatology uses 2003 onward (both MODIS sensors flying).
- Static-source mask for near-real-time rows, which have no `type` field.
- Web app uses MapLibre 4.7.1: version 6 would not start its worker under Next 16 / Turbopack.
- NOAA-21 is downloaded and shown in the hotspot layer but is not in the index (API only gives 2026).

## Known rough edges
- MODIS near-real-time looks high relative to VIIRS in Nov 2026. It does not affect the index (VIIRS era).
- 14 of 71 states are above their 90th percentile for the last 30 days. This rests on provisional data.
- Map tiles are 0.25°, blocky when zoomed into a small state.
- One Natural Earth region has no fire data and is absent from the region list.

## To do before submitting
1. Deploy `web/` to Vercel (root directory `web`) and push the repo to a public GitHub repo.
2. Record the 30-second demo (script in `docs/SUBMISSION.md`) with English subtitles, or make ≤7 slides.
3. Fill team name and members; paste the project-page fields; test every link in a private window.
4. Optional: rerun `download_api.py` + `harmonize.py` + `build.py` on Sunday to refresh the early warning.

## Local preview
`cd web && npm run dev`, then open http://localhost:3000. The FIRMS keys live in `.env` (git-ignored).
