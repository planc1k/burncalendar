"""Download the current year from the FIRMS area API (the yearly archive stops at last year).

Usage: python -I pipeline/download_api.py ENV_FILE RAW_API_DIR [NAME WEST,SOUTH,EAST,NORTH]
                                          [--since YYYY] [--sources SRC1,SRC2]

--since pulls from 1 January of that year instead of the current year (NOAA-21 has no yearly
archive files, so its 2023-2025 record comes from here). --sources limits which sources are pulled.

Reads FIRMS_MAP_KEY (and optional FIRMS_MAP_KEY_BACKUP) from ENV_FILE.
Without NAME the South Asia box is used and files are RAW_API_DIR/<SOURCE>/<window-start>.csv.
With NAME and a box they are <window-start>_<NAME>.csv.

Windows are 5 days on a fixed grid counted from 1 January, so reruns always line up with the
files already saved. A window that a source only partly covers (the newest days, or the month
where standard processing hands over to near-real-time) is saved as *.part.csv and fetched
again on the next run. A window a source no longer covers at all is deleted, so the same day
is never read from two files.
"""
import sys
import io
import csv
import time
import datetime as dt
import pathlib
from concurrent.futures import ThreadPoolExecutor
import requests

API = "https://firms.modaps.eosdis.nasa.gov/api"
BBOX = "68,6,102,37.5"  # west,south,east,north: India, Nepal, Bangladesh, Myanmar
SOURCES = ["MODIS_SP", "MODIS_NRT", "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT",
           "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"]
DAYS = 5
WORKERS = 6


def load_keys(env_file):
    keys = {}
    for line in pathlib.Path(env_file).read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            keys[k.strip()] = v.strip()
    return [keys[k] for k in ("FIRMS_MAP_KEY", "FIRMS_MAP_KEY_BACKUP") if keys.get(k)]


def windows(year_start, lo, hi):
    """Yield (grid_start, first_day, n_days, complete) for every grid window that touches lo..hi."""
    start = year_start
    while start <= hi:
        end = start + dt.timedelta(days=DAYS - 1)
        first, last = max(start, lo), min(end, hi)
        if first <= last:
            yield start, first, (last - first).days + 1, (first == start and last == end)
        start += dt.timedelta(days=DAYS)


def fetch(job, keys, bbox):
    i, src, full, part, first, n, complete = job
    for attempt in range(6):
        key = keys[(i + attempt) % len(keys)]          # spread load over the keys, switch on failure
        try:
            r = requests.get(f"{API}/area/csv/{key}/{src}/{bbox}/{n}/{first}", timeout=300)
            if r.ok and r.text.startswith("latitude,"):
                break
            why = f"{r.status_code} {r.text[:60]!r}"
        except requests.RequestException as e:
            why = type(e).__name__
        print(f"  retry {src} {first}: {why}", flush=True)
        time.sleep(15 * (attempt + 1))
    else:
        raise SystemExit(f"giving up on {src} {first}")
    dest = full if complete else part
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    tmp.write_text(r.text)
    tmp.rename(dest)
    if complete:
        part.unlink(missing_ok=True)
    return r.text.count("\n") - 1


def main():
    keys = load_keys(sys.argv[1])
    out = pathlib.Path(sys.argv[2])
    args = sys.argv[3:]
    opt = lambda flag: args[args.index(flag) + 1] if flag in args else None
    since, only = opt("--since"), opt("--sources")
    pos = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or not args[i - 1].startswith("--"))]
    name, bbox = (pos[0], pos[1]) if len(pos) >= 2 else ("", BBOX)
    suffix = f"_{name}" if name else ""
    this_year = dt.date.today().year
    years = range(int(since) if since else this_year, this_year + 1)
    sources = only.split(",") if only else SOURCES
    avail = requests.get(f"{API}/data_availability/csv/{keys[0]}/all", timeout=60).text
    ranges = {r["data_id"]: (dt.date.fromisoformat(r["min_date"]), dt.date.fromisoformat(r["max_date"]))
              for r in csv.DictReader(io.StringIO(avail))}
    jobs = []
    for src in sources:
        lo, hi = ranges[src]
        wanted = set()
        for y in years:                                   # the 5-day grid restarts every 1 January
            y0, y1 = dt.date(y, 1, 1), dt.date(y, 12, 31)
            if max(lo, y0) > min(hi, y1):
                continue
            for start, first, n, complete in windows(y0, max(lo, y0), min(hi, y1)):
                complete = complete or (first == start and first + dt.timedelta(days=n - 1) == y1)   # short last window of a year
                full, part = out / src / f"{start}{suffix}.csv", out / src / f"{start}{suffix}.part.csv"
                wanted |= {full.name, part.name}
                if not full.exists():
                    jobs.append((len(jobs), src, full, part, first, n, complete))
        for old in (out / src).glob(f"*{suffix}*.csv"):   # windows this source no longer covers
            mine = old.name.split(".")[0][10:] == suffix and int(old.name[:4]) in years
            if mine and old.name not in wanted:
                old.unlink()
                print(f"removed stale {src}/{old.name}")
    print(f"{len(jobs)} requests for box {bbox}", flush=True)
    with ThreadPoolExecutor(WORKERS) as pool:
        rows = sum(pool.map(lambda j: fetch(j, keys, bbox), jobs))
    print(f"done: {rows:,} rows fetched")


if __name__ == "__main__":
    main()
