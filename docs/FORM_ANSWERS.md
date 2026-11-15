# Project form answers

Copy each block into the matching field on Team page → Project tab. Fields are in the form's order.
Click "Save Progress" often. Turn the Lock ON while you edit.

---

## Project Name

The field currently says "Project One Scale". Change it to:

```
BurnCalendar
```

---

## Summary (limit 1,500 characters; this is 1,012, 180 words)

```
Join NASA's two fire records end to end and burning appears to rise in 74 of 99 states across six countries. It doesn't. In 57 of them the "rise" is only the change of satellite: the newer VIIRS sensors see about three times as much fire as the older MODIS sensors.

BurnCalendar is a web app that puts both records on one scale for India, Bangladesh, Myanmar, Nepal, Australia and Indonesia, from 2000 to today. It merges 68 million NASA FIRMS detections from five satellites into one burning activity calendar for any state or drawn area, with a map, an early warning for places running above normal, and open downloads.

It matters because MODIS is retiring. Without a harmonized record, fire managers either lose 12 years of history or misread a sensor change as a trend. Tested on years it never saw, our record is within 11% of VIIRS; uncorrected MODIS is off by 78%. On its own, it picks out Australia's 2019–20 Black Summer as the biggest month on record for New South Wales, 24 times the usual December.
```

---

## Project Demonstration (link)

```
[paste the YouTube or Drive link to burncalendar-demo.mp4]
```

Must be the full URL starting with https://. Test it in a private window, signed out.

---

## Project (link)

```
https://burn-calendar-beta.vercel.app
```

---

## Project Details

The editor has headings and bold. Use "Heading" for the lines marked ## below and paste the rest as normal text.

```
## What it does

BurnCalendar turns two NASA fire records that do not agree into one continuous record, and makes it usable.

- Burning activity calendar. Pick a state or country, draw an area, or type coordinates. The calendar shows activity by month and year since 2000, and by day for states and countries.
- Map. Monthly activity that plays through the whole record, an early-warning layer, and the last week's hotspots shaded by fire radiative power.
- Early warning. States ranked by how unusual the last 30 days are against the same dates since 2003.
- Downloads. The monthly series, the hotspots in the selected area, the calendar image, and the full harmonized record as open data with a data card.

## How it works

1. All MODIS (Terra, Aqua) and VIIRS (S-NPP, NOAA-20, NOAA-21) detections from NASA FIRMS go into one table. Presumed vegetation fires are kept; low-confidence detections and static heat sources such as gas flares are dropped.
2. Detections are snapped to a 0.05° grid and counted as active cell-days: a cell with at least one detection on a day counts once. This removes duplicates across satellites and reduces the effect of pixel size.
3. S-NPP is the reference scale. For each state and calendar month, the years where sensors overlap give a factor that converts the other sensors to that scale. Small samples are pulled toward the country value.
4. Each period uses the best sensor flying at the time: Terra alone to 2002, Terra and Aqua to 2012, S-NPP to 2025, and from 2026 the average of NOAA-20 and NOAA-21, so the record no longer depends on one satellite.

## How we know it works

- Held-out years. Factors fitted on even years were tested on odd years, and the reverse. Across 1,560 state-years the median error is 11.0%, against 77.8% for raw MODIS and 37.0% for a single factor everywhere.
- Known events, found blind. The biggest month on record for New South Wales comes out as December 2019, 24 times the usual December: the 2019–20 bushfire season. Punjab's autumn stubble burning has moved about 16 days later since the mid-2000s. Neither was given to the pipeline, and both also appear on a single sensor.
- Sensor health. Each month the pipeline checks that calibrated sensors still agree. It flags two past MODIS months and the month the S-NPP feed stops, and it fills the one month S-NPP was down (July 2024) from NOAA-20.
- Consistency against burned area. Against GFED5 burned area, which has no sensor change in 2012, burned area per active cell-day shows no step at 2012 (median 1.00 across 98 states). This confirms the factors were applied correctly. It cannot prove them for the years before VIIRS existed.

## How good is the early warning

We replayed the rule on every week of 2003–2025 in all 112 states. A flag was followed by a severe 30 days 33% of the time, against 9% for an ordinary week (3.7 times better than chance), and it caught 33% of severe periods. For New South Wales it first fired on 29 October 2019, 64 days before the peak. It is a persistence signal, not a forecast, and it misses about two severe periods in three.

## Benefits and intended impact

MODIS is retiring. Fire managers need to know whether this season is unusual against the past 20 years, and scientists need trends that are not broken by a change of satellite. Joined raw, the records show fire rising in 74 of 99 states; on one scale it is rising in 18, falling in 25 and flat in 56. BurnCalendar gives both groups one record, shows a likely range on every estimated value, and publishes the result as an open CSV so others can build on it. The method is not specific to these six countries.

## How it is creative

- It treats the sensor change as the finding, not only as a problem to hide: the site shows which "trends" disappear once the records share a scale.
- The unit, the active cell-day, makes five satellites comparable without modelling each sensor's physics.
- The record checks itself: a monthly sensor-agreement index catches a failing satellite and switches source.
- Every claim on the site is tested and its weakness is stated next to it.

## What we considered

- Relation to existing work. Scaling one sensor to another by region is an established idea: GFED5NRT (Chen et al. 2026) does it by biome and region, and Fu et al. (2020) showed the sensors disagree most over cropland. Our contribution is the state-level calendar across the sensor change and the checking around it.
- What we tested and left out. Adding MODIS viewing angle, the share of night detections, and fire type to the factors each improved held-out error by about a point or less, so we kept the simpler method.
- Limits. The method assumes the MODIS-to-VIIRS relationship of 2012–2025 held before 2012, which cannot be tested directly. The 2000–2002 values (Terra alone) are loose. The newest months use near-real-time data that NASA later reprocesses. State boundaries are from Natural Earth and are not authoritative.

## Tools

Python (Polars, DuckDB, pandas, NumPy, GeoPandas, Shapely, Matplotlib, netCDF4, Requests) for the data pipeline. Next.js, React, TypeScript and MapLibre GL JS for the web app, hosted on Vercel. The demo video is rendered from HTML with headless Chrome and FFmpeg.

The code is open source (MIT) at https://github.com/planc1k/burncalendar.

Code written with the help of Claude (Anthropic), an AI model; this is also stated in the README, the site footer and the page metadata. The demo's sound effects are from SFX Kit (CC0), which its makers state was created with AI.
```

---

## Use of Super Intelligence (SI)

The dropdown already shows "Coding, Debugging, or Troubleshooting" and "Data Analysis and Inter…". Tick every option that matches these, using the form's own wording:

- Coding, debugging or troubleshooting: yes. Claude wrote most of the pipeline and web app code.
- Data analysis and interpretation: yes.
- Writing or text (README, first drafts of this page): yes, if listed.
- Research or literature search: yes, if listed.
- Video or presentation: yes, if listed. The demo animation is code written by Claude.
- Audio: yes, if listed. The sound effects come from SFX Kit, which was made with AI.
- Image generation: no. No AI-generated images are used.
- "I did not use SI": do not tick.

---

## NASA Data (one row per line: Link Text | Link Url)

```
NASA FIRMS (Fire Information for Resource Management System) | https://firms.modaps.eosdis.nasa.gov/
FIRMS country archive: MODIS Collection 6.1 and VIIRS 375 m active fire, yearly files | https://firms.modaps.eosdis.nasa.gov/country/
FIRMS area API: MODIS and VIIRS (S-NPP, NOAA-20, NOAA-21), standard and near-real-time | https://firms.modaps.eosdis.nasa.gov/api/area/
```

---

## Space Agency Partner & Other Data (one row per line: Link Text | Link Url)

Data:
```
GFED5 burned area (Chen et al. 2023), CC BY 4.0, used for validation | https://doi.org/10.5281/zenodo.7668423
Natural Earth admin-1 boundaries, public domain | https://www.naturalearthdata.com/
CARTO basemaps | https://carto.com/basemaps
OpenStreetMap data (in the basemap) | https://www.openstreetmap.org/copyright
```

Literature:
```
Chen et al. 2026, GFED5NRT, Earth System Science Data | https://doi.org/10.5194/essd-18-7535-2026
Chen et al. 2023, GFED5 burned area, Earth System Science Data | https://doi.org/10.5194/essd-15-5227-2023
Fu et al. 2020, MODIS versus VIIRS fire products, Remote Sensing | https://doi.org/10.3390/rs12182870
Zheng et al. 2026, FRP correction and fusion, Remote Sensing | https://doi.org/10.3390/rs18101650
```

Software and assets:
```
BurnCalendar source code (GitHub, MIT licence) | https://github.com/planc1k/burncalendar
Next.js | https://nextjs.org/
React | https://react.dev/
MapLibre GL JS | https://maplibre.org/
Polars | https://pola.rs/
DuckDB | https://duckdb.org/
pandas | https://pandas.pydata.org/
NumPy | https://numpy.org/
GeoPandas | https://geopandas.org/
Matplotlib | https://matplotlib.org/
Fraunces typeface (SIL Open Font License) | https://fonts.google.com/specimen/Fraunces
Geist typeface (SIL Open Font License) | https://vercel.com/font
SFX Kit by Wyzowl, sound effects in the demo video, CC0 | https://github.com/wyzowl/sfx-kit
FFmpeg, used to render the demo video | https://ffmpeg.org/
Claude (Anthropic), AI coding assistant | https://claude.com/
```

Two papers are cited in the README without a link (Giglio et al. 2016; Schroeder et al. 2014). The form needs a URL per row, so leave them out here unless you look up and check their DOIs yourself.

No Space Agency Partner data was used.

---

## Checkboxes

Both are already ticked in your form: "Agree to Terms and Conditions" and "Confirm All Work is Original".

## Before you click "Submit for Judging"

- Open every link above once. A broken link in a required field is the easiest way to lose points.
- Open the demo link and the project link in a private window, signed out.
- Check the project name reads "BurnCalendar", not "Project One Scale".
