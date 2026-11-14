"""Download FIRMS yearly per-country archive CSVs (no key needed).

Usage: python -I pipeline/download.py RAW_DIR Bangladesh [India Myanmar Nepal]
Files land in RAW_DIR/<sensor>/<sensor>_<year>_<Country>.csv; existing files are skipped.
"""
import sys
import datetime
import pathlib
import requests
from concurrent.futures import ThreadPoolExecutor

BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"
# sensor folder -> first year with data
SENSORS = {"modis": 2000, "viirs-snpp": 2012, "viirs-jpss1": 2018}
UA = {"User-Agent": "Mozilla/5.0 (fire-calendar research script)"}


def fetch(raw, sensor, year, country):
    name = f"{sensor}_{year}_{country}.csv"
    dest = raw / sensor / name
    if dest.exists() and dest.stat().st_size > 0:
        return 0
    r = requests.get(f"{BASE}/{sensor}/{year}/{name}", headers=UA, timeout=600)
    if r.status_code == 404:
        print(f"missing  {name}", flush=True)
        return 0
    r.raise_for_status()
    if not r.text.startswith("latitude,"):
        print(f"not-csv  {name}", flush=True)
        return 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    tmp.write_bytes(r.content)
    tmp.rename(dest)  # atomic: a killed run never leaves a half file behind
    return len(r.content)


def main():
    raw = pathlib.Path(sys.argv[1])
    this_year = datetime.date.today().year
    jobs = [(raw, sensor, year, country) for country in sys.argv[2:]
            for sensor, first in SENSORS.items() for year in range(first, this_year)]
    with ThreadPoolExecutor(8) as pool:
        total = sum(pool.map(lambda j: fetch(*j), jobs))
    print(f"downloaded {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
