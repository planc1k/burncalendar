# Submission drafts (2026 Project Submission Guide)

Field names and rules follow the 2026 guide saved in `docs/guides/`. Fill the items in [brackets].
The guide says most of the judges' evaluation rests on this page, not the demo, so this text comes first.

## Before you paste anything
- Every team member is registered for the same Local Event and not waitlisted.
- All text is in English.
- Links open in a private browser window with no login.
- Nobody under 18 appears or speaks in the demo (no image, video, audio or likeness).

## What is the name of your project?
BurnCalendar

## High-level summary
*What did you develop? How does it address the challenge? Why is it important?*

Join NASA's two fire records end to end and burning appears to rise in 74 of 99 states across six countries. It doesn't. In 57 of them the rise is only the change of satellite: the newer VIIRS sensors see about three times as much fire as the older MODIS sensors.

BurnCalendar is a web app that puts both records on one scale for India, Bangladesh, Myanmar, Nepal, Australia and Indonesia, from 2000 to today. It merges 68 million NASA FIRMS detections from five satellites into one burning activity calendar for any state or drawn area, with an early warning for places running above normal and downloads of the data.

It matters because MODIS is retiring. Without a harmonized record, fire managers lose 12 years of history or misread the sensor change as a trend. Tested on years it never saw, our record is within 11% of VIIRS; uncorrected MODIS is off by 78%.

## Project demo link
[public link to the 30-second video or 7-slide deck]

## Final project link
https://burn-calendar-beta.vercel.app
Code: [public GitHub URL]

## Project details
*What exactly does it do? How does it work? What benefits does it have? What do you hope to achieve? What tools did you use?*

**What it does**
- **Burning activity calendar.** Pick a state or country, draw an area, or type coordinates. The calendar shows activity by month and year since 2000, and by day for states and countries.
- **Map.** Monthly activity that plays through the whole record, an early-warning layer, and the last week's hotspots shaded by fire radiative power.
- **Early warning.** States ranked by how unusual the last 30 days are against the same dates since 2003.
- **Downloads.** The monthly series, the hotspots in the selected area, the calendar image, and the full harmonized record as open data.

**How the harmonization works**
1. All MODIS (Terra, Aqua) and VIIRS (S-NPP, NOAA-20, NOAA-21) detections go into one table. Presumed vegetation fires are kept; low-confidence detections and static heat sources are dropped.
2. Detections are snapped to a 0.05° grid and counted as active cell-days: a cell with at least one detection on a day counts once. This removes duplicates across satellites and reduces the effect of pixel size.
3. S-NPP is the reference scale. For each state and calendar month, the years where sensors overlap give a factor that converts MODIS, NOAA-20 and NOAA-21 to that scale. Small samples are pulled toward the country value.
4. Each period uses the best sensor flying at the time: Terra alone to 2002, Terra and Aqua to 2012, S-NPP to 2025, and from 2026 the average of NOAA-20 and NOAA-21, so the record no longer depends on one satellite.

**How we know it works**
- **Held-out years.** Factors fitted on even years were tested on odd years, and the reverse. Across 1,560 state-years the median error is 11.0%, against 77.8% for raw MODIS and 37.0% for a single factor everywhere.
- **Known events, found blind.** The biggest month on record for New South Wales comes out as December 2019, 24 times the usual December: the 2019–20 bushfire season. Punjab's autumn stubble burning has moved about 16 days later since the mid-2000s. Neither was given to the pipeline, and both also appear on a single sensor.
- **Sensor health.** Each month the pipeline checks that calibrated sensors still agree. It flags two past MODIS months and the month the S-NPP feed stops, and it fills the one month S-NPP was down (July 2024) from NOAA-20.
- **Consistency against burned area.** Against GFED5 burned area, which has no sensor change in 2012, burned area per active cell-day shows no step at 2012 (median 1.00 across 98 states). This confirms the factors were applied correctly. It cannot prove them for the years before VIIRS existed.

**How good is the early warning**
We replayed the rule on every week of 2003–2025 in all 112 states. A flag was followed by a severe 30 days 33% of the time, against 9% for an ordinary week (3.7 times better than chance), and it caught 33% of severe periods. For New South Wales it first fired on 29 October 2019, 64 days before the peak. It is a persistence signal, not a forecast, and it misses about two severe periods in three.

**How this relates to existing work**
Scaling one sensor to another by region is an established idea: GFED5NRT (Chen et al. 2026) converts VIIRS active-fire counts with biome- and region-specific tables to stay consistent with the MODIS era. Fu et al. (2020) showed the two sensors disagree far more over cropland and grassland than over forest, which is why a single factor fails in our tests and factors per state and month work. Our contribution is the application and the checking around it: a state-level burning calendar across the sensor change, held-out validation, a likely range on every estimate, a tested early warning and an open dataset.

**Honest limits**
- We scale by state and month, not by biome. We tested adding MODIS viewing angle, the share of night detections and fire type to the factors. Each improved held-out error by about a point or less (11.0% to 10.8% for viewing angle), so we kept the simpler method and report the tests.
- The method assumes the MODIS-to-VIIRS relationship of 2012–2025 held before 2012. That cannot be tested directly.
- Every estimated value is shown with the range where 8 in 10 held-out cases fell. The 2000–2002 values (Terra alone) are loose.
- The newest months use near-real-time data that NASA later reprocesses.

**Benefits and what we hope to achieve**
Fire managers can see which months and years burned most and whether the present is unusual. Scientists get a consistent series across the sensor change. The harmonized record is published as a CSV with a data card so others can build on it. The method is not specific to these six countries.

[Optional paragraph, if you do the interview: **What a user told us.** One or two sentences and the quote.]

**Tools**
Python (Polars, DuckDB, pandas, NumPy, GeoPandas, Shapely, Matplotlib, netCDF4), Next.js, React, TypeScript, MapLibre GL JS.

## NASA data and resources
- NASA FIRMS (Fire Information for Resource Management System), https://firms.modaps.eosdis.nasa.gov
  - MODIS Collection 6.1 active fire, Terra and Aqua (MCD14ML standard, MCD14DL near-real-time).
  - VIIRS 375 m active fire, S-NPP, NOAA-20 and NOAA-21, standard and near-real-time.
  - Accessed through the FIRMS country archive and the FIRMS area API.

## Space Agency Partner and other data, resources and tools
*List everything, including open-source code and images.*
- GFED5 burned area: Chen et al. 2023, Zenodo 10.5281/zenodo.7668423, CC BY 4.0. Used for validation only.
- Literature that informed the write-up (full references in the README):
  - Chen et al. 2026, GFED5NRT, Earth System Science Data 18, 7535–7555.
  - Chen et al. 2023, GFED5 burned area, Earth System Science Data 15, 5227–5259.
  - Fu et al. 2020, MODIS versus VIIRS fire products, Remote Sensing 12(18), 2870.
  - Zheng et al. 2026, FRP correction and fusion of MYD14 and VNP14IMG, Remote Sensing 18(10), 1650.
  - Giglio et al. 2016, MODIS Collection 6 active fire, Remote Sensing of Environment 178, 31–41.
  - Schroeder et al. 2014, VIIRS 375 m active fire, Remote Sensing of Environment 143, 85–96.
- Natural Earth admin-1 boundaries, naturalearthdata.com, public domain.
- Demo video sound effects: SFX Kit by Wyzowl, github.com/wyzowl/sfx-kit, CC0 1.0.
- CARTO Positron basemap, © CARTO, © OpenStreetMap contributors.
- Fonts: Fraunces, Geist, Geist Mono (SIL Open Font License).
- Open-source software: Python, Polars, DuckDB, pandas, NumPy, GeoPandas, Shapely, Matplotlib, Requests, netCDF4, Node.js, Next.js, React, TypeScript, MapLibre GL JS.
- No Space Agency Partner data was used.
- All charts and figures were produced by our own code from the data above.

## Use of AI
*This answer is for data collection and is not shown to judges.*

Claude (Anthropic), a large language model, was used as a coding assistant. It wrote most of the data pipeline and web app code, the README and first drafts of this text, working from the team's plan. The team chose the challenge, the idea, the scope and the countries, ran the pipeline and reviewed the results.

AI-written code is acknowledged in the README, in the site footer, in the page metadata and in the git commit history. No AI-generated images, video or audio are used. Nothing uses NASA logos or branding.

## Images to upload to the project page (JPG, PNG or GIF, up to 10 MB each)
1. `docs/screenshot.jpg`: New South Wales, December 2019.
2. `docs/validation.png`: held-out test and the yearly record.
3. A screenshot of the Findings section (trend table and season timing).
4. A screenshot of the early-warning table with the skill panel.
5. `docs/burned_area.png`: only with its caption saying what it does and does not show.

## 30-second demo
A finished motion video is in `demo/burncalendar-demo.mp4` (29.5 s, built by `demo/render.mjs`). See `docs/DEMO_HANDOFF.md`
for adding names and uploading. The table below is the fallback if you record the live site instead.

The guide's suggested order is: who you are, the challenge, the project name, how it works, what it could do.
Screen recording with subtitles is enough. Keep it at or under 30 seconds; over the limit is ineligible.

| Time | On screen | Subtitle |
|---|---|---|
| 0:00–0:02 | Title card: team name, member names, challenge | Team One Scale: Mostafa Tahmeed Foysal, Nahin Eftekhar, Prantik Biswas. |
| 0:02–0:05 | The challenge title | The challenge: harmonize MODIS and VIIRS fire records. |
| 0:05–0:10 | Site opening, map playing | BurnCalendar: 26 years of fire in one continuous record. |
| 0:10–0:15 | Findings table | Join the raw records and fire rises in 74 of 99 states. On one scale: 18. |
| 0:15–0:20 | New South Wales, December 2019, calendar | Every state gets a calendar. It finds Black Summer on its own. |
| 0:20–0:25 | Early-warning table and skill panel | An early warning, tested on 23 years: 3.7 times better than chance. |
| 0:25–0:30 | Download link, then URL | Open data and code, ready as MODIS retires. |

If you use slides instead: at most 7, in English, and they must show the team name, member names and the challenge.

## Submitting
1. Team page → Project tab → Edit. Save often; turn the edit lock on while you work.
2. Tick the Terms and Conditions box and the "all work is original" box.
3. Select "Submit for Judging" before Sunday 15 November, 11:59 PM local time. You can edit and resubmit until then; only the last saved version is judged.
4. After deploying, consider the FortiGuard web-filter classification form the guide recommends for new websites: https://www.fortiguard.com/faq/wfratingsubmit

## One-line activity description (≤150 characters)
Built BurnCalendar at NASA Space Apps 2026: merged 68M MODIS/VIIRS fire detections into one 26-year record for 6 countries (11% error).
