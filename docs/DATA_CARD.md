# Data card: BurnCalendar harmonized monthly fire record

**File:** `web/public/data/burncalendar_monthly.csv` (served at `/data/burncalendar_monthly.csv`), about 2.7 MB.
**Coverage:** November 2000 to November 2026 (the last month is partial). India, Bangladesh, Myanmar, Nepal,
Australia, Indonesia: 112 states and provinces, the six countries, and one all-area row set.
**Licence:** CC BY 4.0. Source detections are from NASA FIRMS, which asks for acknowledgement.

## Columns
| Column | Meaning |
|---|---|
| `region_id` | Natural Earth ISO 3166-2 code with `_` (for example `IN_PB`), a country code, or `ALL` |
| `region`, `country`, `level` | Name, country code, and `state`, `country` or `all` |
| `year`, `month` | Calendar month (UTC days) |
| `harmonized_cell_days` | Active cell-days on the S-NPP scale. A cell is 0.05°; it counts once per day with at least one detection |
| `likely_low`, `likely_high` | The range where 8 in 10 held-out cases fell. Equal to the value where S-NPP measured it directly |
| `source` | Sensor behind the value: `terra`, `terra+aqua`, `snpp`, `noaa20 (S-NPP gap)`, `noaa20+noaa21` (or `noaa20` / `noaa21` alone if the two disagree) |
| `raw_modis_cell_days`, `raw_snpp_cell_days`, `raw_noaa20_cell_days`, `raw_noaa21_cell_days` | Uncalibrated active cell-days per sensor family |
| `frp_sum_mw` | Sum of fire radiative power of the kept detections, MW (not harmonized across sensors) |

## How it was made
MODIS Collection 6.1 and VIIRS 375 m active-fire detections from NASA FIRMS; presumed vegetation fires only;
low-confidence detections and static heat sources removed; snapped to a 0.05° grid; counted as active
cell-days; MODIS, NOAA-20 and NOAA-21 converted to the S-NPP scale with factors fitted per state and calendar month on
overlap years. From 2026 the value is the mean of calibrated NOAA-20 and NOAA-21. Full method and validation: `README.md`.

## Use it for
- Comparing a state with its own past across the MODIS-to-VIIRS change.
- Seasonal calendars, trends and anomalies at state level and above.

## Do not use it for
- Burned area, emissions or counts of individual fires. A cell-day is a measure of activity, not area.
- Comparing absolute values between far-apart latitudes: grid cells cover less ground away from the equator.
- Exact values before 2003 (Terra alone): the likely range is wide.
- Operational decisions on the newest months without checking NASA FIRMS directly. They use near-real-time data.

## Known limits
- State boundaries are Natural Earth admin-1 (v5) and are dated in places.
- NOAA-21 factors rest on three overlap years (2023–2025).
- November 2026 is a partial month.

## Citation
One Scale (2026). Harmonized MODIS and VIIRS monthly fire activity for six Asia-Pacific countries,
2000–2026. NASA Space Apps Challenge 2026. Built on NASA FIRMS active fire data.
