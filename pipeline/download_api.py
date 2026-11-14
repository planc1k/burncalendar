"""Download the current year from the FIRMS area API (the yearly archive stops at last year).

Usage: python -I pipeline/download_api.py ENV_FILE RAW_API_DIR
Reads FIRMS_MAP_KEY (and optional FIRMS_MAP_KEY_BACKUP) from ENV_FILE.
Saves RAW_API_DIR/<SOURCE>/<start-date>.csv, one file per 5-day request over the South Asia box.
Complete past windows are skipped on rerun; the newest window of each NRT source is refetched.
"""
import sys
import io
import csv
import time
import datetime as dt
import pathlib
import requests

API = "https://firms.modaps.eosdis.nasa.gov/api"
BBOX = "68,6,102,37.5"  # west,south,east,north: India, Nepal, Bangladesh, Myanmar
SOURCES = ["MODIS_SP", "MODIS_NRT", "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT",
           "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"]


def load_keys(env_file):
    keys = {}
    for line in pathlib.Path(env_file).read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            keys[k.strip()] = v.strip()
    return [keys[k] for k in ("FIRMS_MAP_KEY", "FIRMS_MAP_KEY_BACKUP") if keys.get(k)]


def main():
    keys = load_keys(sys.argv[1])
    out = pathlib.Path(sys.argv[2])
    year_start = dt.date(dt.date.today().year, 1, 1)
    avail = requests.get(f"{API}/data_availability/csv/{keys[0]}/all", timeout=60).text
    ranges = {r["data_id"]: (dt.date.fromisoformat(r["min_date"]), dt.date.fromisoformat(r["max_date"]))
              for r in csv.DictReader(io.StringIO(avail))}
    ki = 0
    for src in SOURCES:
        lo, hi = ranges[src]
        day = max(lo, year_start)
        rows = 0
        while day <= hi:
            n = min(5, (hi - day).days + 1)
            dest = out / src / f"{day}.csv"
            last_window = day + dt.timedelta(days=n) > hi
            if dest.exists() and not (last_window and src.endswith("NRT")):
                day += dt.timedelta(days=n)
                continue
            for attempt in range(6):
                r = requests.get(f"{API}/area/csv/{keys[ki]}/{src}/{BBOX}/{n}/{day}", timeout=180)
                if r.ok and r.text.startswith("latitude,"):
                    break
                print(f"  retry {src} {day}: {r.status_code} {r.text[:80]!r}", flush=True)
                ki = (ki + 1) % len(keys)  # switch key, then back off
                time.sleep(20 * (attempt + 1))
            else:
                raise SystemExit(f"giving up on {src} {day}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(r.text)
            rows += r.text.count("\n") - 1
            day += dt.timedelta(days=n)
        print(f"{src}: {max(lo, year_start)}..{hi}  new rows {rows:,}", flush=True)


if __name__ == "__main__":
    main()
