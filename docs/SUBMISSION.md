# Submission drafts

Check every field against the 2026 Project tab before pasting. Fill the items in [brackets].

## Project Name
BurnCalendar

## High-Level Summary
Satellites have tracked fires for 26 years, but the record is split between MODIS and VIIRS, which cannot be compared directly: across our six countries VIIRS sees about three times as much burning as MODIS. BurnCalendar merges both into one record for India, Bangladesh, Myanmar, Nepal, Australia and Indonesia. It snaps 62 million NASA FIRMS detections to a common grid, counts active cell-days, and converts every sensor to one scale with factors fitted per state and month. On held-out years the median error is 11%, against 78% for raw MODIS. The web app shows a burning activity calendar for any state or drawn area and flags places running above their 90th percentile for the last 30 days. We replayed that warning on 23 past years: a flag is followed by a severe month 3.7 times more often than chance. Fire managers get one consistent picture of when and where burning happens.

## Demo link
[30-second video or slides link]

## Final Project link
[public Vercel URL] · code: [public GitHub URL]

## Detailed Description
**What it does.** BurnCalendar is a web app with three views of one harmonized fire record. The map shows monthly activity from November 2000 to today, an early-warning layer, and the latest hotspots shaded by fire radiative power. The calendar shows activity by month and year for a country, a state, or any area the user draws or types as coordinates. The early-warning list ranks states by how unusual the last 30 days are against the same dates since 2003. Users can download the monthly series, the hotspots in their area, and the calendar image.

**How the harmonization works.** (1) All MODIS and VIIRS detections go into one table; presumed vegetation fires are kept, low-confidence detections and static heat sources are dropped. (2) Detections are snapped to a 0.05° grid and counted as active cell-days, which removes duplicates across satellites and reduces the effect of pixel size. (3) S-NPP is the reference scale. For each state and calendar month, the overlap years give a factor that converts MODIS and NOAA-20 to that scale; small samples are pulled toward the country value. (4) Terra alone covers 2000–2002, Terra and Aqua 2002–2012, S-NPP 2012–2025, and NOAA-20 from 2026, all on one scale.

**Validation.** Factors fitted on even years were tested on odd years and the reverse. For 1,560 state-years the median error of the MODIS estimate is 11.0%, against 77.8% for raw MODIS and 37.0% for a single factor. NOAA-20 matches S-NPP within 3.5%. The record also recovers known events and seasons without being told about them: the biggest month on record for New South Wales is December 2019, at 24 times the usual December, and Punjab shows its wheat (May) and rice (October–November) residue burning.

**Independent check.** Against GFED5 burned area, which has no sensor change in 2012, the harmonized record shows no step at 2012 (median 1.00 across 98 states, 93% of states within 25%). A raw splice of MODIS and VIIRS shows a step of 4.1. High and low fire years match burned area with a rank correlation of 0.92, against 0.51 for the raw splice.

**What the record shows.** Spliced raw records make fire appear to rise in 74 of 99 states; on one scale it rises in 18, falls in 25 and is flat in 56. Punjab's autumn stubble burning has moved about 16 days later since the mid-2000s. The pipeline also flags months when sensors stop agreeing, including the month the S-NPP feed ends.

**Early-warning skill.** The warning rule was replayed on every week of 2003–2025 in all 112 states, with thresholds that never include the year being tested. A flag was followed by a severe 30 days 34% of the time, against 9% for an ordinary week, and it caught 33% of severe periods. For New South Wales it first fired on 29 October 2019, 64 days before the peak of that season. It is a persistence signal, not a forecast, and we say so on the page.

**Uncertainty.** Every estimated value (before 2012, and from 2026) is shown with the range where 8 in 10 held-out cases fell.

**Benefits.** Emergency managers can see at a glance which months and years burned most, and how the current period compares with history. Scientists get a consistent series across the sensor change as MODIS retires.

**Limits.** Pre-2012 values are estimates, since MODIS misses small fires. The newest data is near-real-time and provisional. NOAA-21 is shown in the latest hotspots but is not yet in the index.

**Tools.** Python (Polars, DuckDB, GeoPandas), Next.js, React, TypeScript, MapLibre GL JS.

## NASA Data
NASA FIRMS active fire products: MODIS Collection 6.1 (MCD14ML, MCD14DL) from Terra and Aqua; VIIRS 375 m active fire, standard and near-real-time, from S-NPP, NOAA-20 and NOAA-21. Sources: FIRMS country archive and FIRMS area API. https://firms.modaps.eosdis.nasa.gov

## Space Agency Partner & Other Data
GFED5 burned area (Chen et al. 2023, Zenodo 10.5281/zenodo.7668423, CC BY 4.0), for validation only. Natural Earth admin-1 boundaries (naturalearthdata.com). CARTO Dark Matter basemap, © OpenStreetMap contributors. Open-source libraries: Polars, DuckDB, pandas, NumPy, GeoPandas, Shapely, Matplotlib, Requests, netCDF4, Next.js, React, MapLibre GL JS.

## Use of Artificial Intelligence
Claude (Anthropic) was used as an AI coding assistant to write the data pipeline, the web app, the README and drafts of this project text. The team chose the scope and method, ran the pipeline and reviewed the results. No AI-generated images, video or audio are used. No NASA logos or branding appear in the project.

## 30-second demo script (subtitle lines)
| Time | On screen | Subtitle |
|---|---|---|
| 0–4 s | Title card: BurnCalendar, team name, challenge | Two fire sensors. One record. |
| 4–9 s | Sensor chart for a state | MODIS and VIIRS disagree by a factor of three. |
| 9–14 s | Method strip, validation table | We put both on one scale. Error on held-out years: 11%. |
| 14–20 s | Play the month slider on the map | 26 years of burning, from Punjab to New South Wales. |
| 20–25 s | Click Punjab, calendar appears | Every state gets a burning calendar. |
| 25–30 s | Early-warning table and skill panel, then URL | And an early warning, tested on 23 years: 3.7× better than chance. |

## One-line activity description (≤150 characters)
Built BurnCalendar at NASA Space Apps 2026: merged 62M MODIS/VIIRS fire detections into one 26-year record for 6 countries (11% error).
