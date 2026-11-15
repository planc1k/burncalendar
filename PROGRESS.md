# Progress

NASA Space Apps 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots".
Deadline: Sun Nov 15, 11:59 PM Dhaka. Internal target: 9:00 PM. Team name: One Scale.

## State (Sat Nov 14, evening)
Six countries, five satellites, live at https://burn-calendar-beta.vercel.app (Vercel project preset
must be Next.js; `web/vercel.json` sets it). Not pushed to GitHub. Check `git status` for uncommitted work.

- Countries: India, Bangladesh, Myanmar, Nepal, Australia, Indonesia.
- Pipeline: `download.py`, `download_api.py`, `harmonize.py`, `build.py`, `skill.py` (backtest and
  uncertainty), `test_pipeline.py`.
- Data on disk (git-ignored): `data/raw` 4.7 GB archive, `data/raw_api` 1.4 GB (2026 for all sensors, 2023–2025 for NOAA-21), `data/geo`.
- App: `web/` (Next.js 16, MapLibre GL JS 4.7). Static data in `web/public/data` (17 MB).
- Docs: `README.md`, `docs/validation.png`, `docs/burned_area.png`, `docs/screenshot.jpg`,
  `docs/SUBMISSION.md`, `docs/DATA_CARD.md`, `docs/INTERVIEW.md` (questions for one real user).
- New pipeline files: `findings.py` (trends, season timing, sensor alarm), `validate_ba.py` (GFED5 check;
  needs `data/gfed5`, 561 MB unzipped, git-ignored).

## Key results
- 68,321,281 detections in the record, 17,132,649 active cell-days, Nov 2000 to 14 Nov 2026.
- MODIS → S-NPP on held-out years, per state-year: 11.0% median error (raw 77.8%, single factor 37.0%).
- Terra-alone chain: 13.0% (2008–2011). NOAA-20 → S-NPP: 3.5%. NOAA-21 → S-NPP: 4.5%.
- From 2026 the record is the mean of calibrated NOAA-20 and NOAA-21 (3.4% vs 3.7% for NOAA-20 alone on
  the same 335 state-years). Falls back to the higher one if they disagree beyond 0.75–1.33; never triggered.
- New South Wales record month: December 2019, 24× the usual December.
- Early-warning backtest (2003–2025, 133,952 state-weeks): flag right 33% of the time vs 9% base rate
  (3.7× chance), catches 33% of severe periods; "above normal" level catches 51%, right 27%.
- NSW 2019: warning first fired 29 October, 64 days before the peak.
- Uncertainty ranges per state exported and shown (calendar tooltip, band on the sensor chart).
- Burned-area check (GFED5, 98 states, 2003–2020): step at 2012 is 1.00. CAUTION: raw MODIS on both
  sides also gives 1.00, because the factors cancel. It is a consistency check on how factors were
  applied, not proof of the factors. Do not call it the strongest validation. The real cross-sensor
  part is S-NPP vs burned area in 2012–2020: rank correlation 0.92.
- Trends and Punjab timing hold on MODIS alone and on S-NPP alone (see README).
- July 2024 (S-NPP down, index 0.63) is filled from calibrated NOAA-20.
- Trends 2003–2025: raw splice says rising in 74 of 99 states; harmonized says 18 rising, 25 falling,
  56 flat. Punjab October season +7.3 days per decade (about 16 days later than 2003–2007).
- Sensor alarm flags MODIS Aug 2020 and Apr 2022, S-NPP Jul 2024 and Nov 2026 (the stop).

## Literature (checked late, Sat Nov 14)
No literature review was done before building. Abstracts read afterwards: GFED5NRT (Chen et al. 2026)
uses biome- and region-specific scaling of VIIRS counts, so our idea is not new; Fu et al. 2020 show
MODIS/VIIRS disagreement depends on land cover. Do not claim the method is novel. References are in
the README. Only abstracts were read, not full texts.

## Experiment: fire-type-aware factors (not adopted)
Fire type per tile from GFED5 (crop / forest-loss+peat / other). VIIRS per MODIS: crop 3.96, others
about 2.8. Held-out state-year error 11.9% -> 11.0%, tile-year 23.5% -> 23.2%. Not adopted: small
gain, and GFED5 would become part of the model as well as the check. Script was a scratch file, not
in the repo; the numbers are recorded in the README.

## Experiment: viewing angle and day/night (not adopted, Sat Nov 14 evening)
Covariates added to the factors in a held-out test: mean MODIS scan size, share of night detections,
both. State-year error 11.0 -> 10.8 / 10.9 / 10.9; state-month 15.6 -> 15.5 / 15.5 / 15.3. Not adopted.
The day/night test was a covariate, not separate day and night records. `harmonize.py` still writes
`scan_sum` and `night` per cell-day-sensor so the test can be repeated.

## Decisions made (and why)
- Unit is the active cell-day on a 0.05° grid: robust to pixel size and duplicates.
- S-NPP is the reference scale. Handover to NOAA-20 on 2026-01-01, because the S-NPP feed stops on 2026-11-02.
  Correction: with all six countries and calibrated comparison, S-NPP ran only 6–16% low in several
  2026 months, inside the alarm band. The earlier "thinning for months" claim rested on raw South Asia
  counts in the monsoon, when numbers are small. Do not repeat it.
- Terra-alone years are chained through 2003–2007 Terra+Aqua (fitting straight to S-NPP overshot).
- Climatology uses 2003 onward.
- Australia and Indonesia were chosen because a UTC day still groups the afternoon and night passes
  there, so the method needed no change. The Americas would need a local-solar-day rule.
- Natural Earth repeats `AU-NSW` for Lord Howe Island; `harmonize.py` merges duplicate ids.
- API downloads use a fixed 5-day grid from 1 January and run 6 requests at once across both keys.
- The flat map is one small canvas (a pixel column per tile). Rebuilding tile polygons each month took
  about 750 ms per frame with six countries; the canvas takes a few milliseconds. 3D mode still
  builds polygons.
- 3D mode is a dark night scene (dark sheet over the basemap, bright ramp, hotspots on top); the flat
  map stays light.
- Design: light "almanac" look, Fraunces for display, hairlines instead of cards, one motion (the map
  plays the record once on arrival). Follows the impeccable craft-floor audit.
- MapLibre 4.7.1, not 6: version 6 would not start its worker under Next 16 / Turbopack.

## Known rough edges
- 27 of 112 states are above their 90th percentile for the last 30 days. This rests on provisional data.
- `recent.json` is 6.3 MB (173k hotspots, 7 days). It loads only for the hotspots layer or CSV.
- Map tiles are 0.25°, blocky when zoomed into a small state.
- 3D mode with all six countries rebuilds many polygons; playing the timeline in 3D is slow.
- Drag-to-draw and the three download buttons have not been exercised in a browser.

## To do before submitting
1. Commit, deploy `web/` to Vercel (root directory `web`), push to a public GitHub repo.
2. Record the 30-second demo (script in `docs/SUBMISSION.md`) with English subtitles, or make ≤7 slides.
3. Fill team name and members; paste the project-page fields; test every link in a private window.
4. Optional Sunday refresh: rerun both `download_api.py` commands, then `harmonize.py` and `build.py`.

## Local preview
`cd web && npm run dev`, then open http://localhost:3000. The FIRMS keys live in `.env` (git-ignored).
