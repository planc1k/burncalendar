"""Step 1 of harmonization: every MODIS and VIIRS detection -> one cell-day table.

Usage: python -I pipeline/harmonize.py RAW_DIR RAW_API_DIR GEO_DIR OUT_DIR

- Reads the yearly archive CSVs (RAW_DIR) and the current-year API CSVs (RAW_API_DIR).
- One schema for all sensors: terra, aqua (MODIS), snpp, n20, n21 (VIIRS).
- Keeps presumed vegetation fires (type 0, or no type for near-real-time rows) and drops
  low-confidence detections (MODIS < 30, VIIRS "low") so both products share one confidence floor.
- Snaps to a fixed 0.05 degree grid and aggregates to cell-day per sensor.
- Assigns each grid cell to a state/division (Natural Earth admin-1) once, by cell centre.

Outputs OUT_DIR/det.parquet (ix, iy, date, sensor, n, frp_sum, frp_max, night)
        OUT_DIR/cells.parquet (ix, iy, rid) and OUT_DIR/regions.parquet / regions.gpkg.
"""
import sys
import pathlib
import polars as pl
import geopandas as gpd

CELL = 0.05
COUNTRIES = {"India": "IN", "Bangladesh": "BD", "Myanmar": "MM", "Nepal": "NP"}
ARCHIVE = {"modis": "modis", "viirs-snpp": "snpp", "viirs-jpss1": "n20"}
API = {"MODIS_SP": "modis", "MODIS_NRT": "modis", "VIIRS_SNPP_SP": "snpp", "VIIRS_SNPP_NRT": "snpp",
       "VIIRS_NOAA20_SP": "n20", "VIIRS_NOAA20_NRT": "n20",
       "VIIRS_NOAA21_SP": "n21", "VIIRS_NOAA21_NRT": "n21"}
COLS = ["latitude", "longitude", "acq_date", "satellite", "confidence", "frp", "daynight", "type"]


def scan(path: pathlib.Path, src: str):
    if path.stat().st_size < 100:
        return None
    lf = pl.scan_csv(path, infer_schema=False)
    names = lf.collect_schema().names()
    if "latitude" not in names:
        return None
    if "type" not in names:
        lf = lf.with_columns(pl.lit(None, dtype=pl.String).alias("type"))
    return lf.select(COLS).with_columns(pl.lit(src).alias("src"))


def main():
    raw, raw_api, geo, out = (pathlib.Path(a) for a in sys.argv[1:5])
    out.mkdir(parents=True, exist_ok=True)
    frames = []
    for folder, src in ARCHIVE.items():
        frames += [scan(p, src) for p in sorted((raw / folder).glob("*.csv"))]
    for folder, src in API.items():
        frames += [scan(p, src) for p in sorted((raw_api / folder).glob("*.csv"))]
    frames = [f for f in frames if f is not None]
    print(f"files: {len(frames)}")

    det = pl.concat(frames)
    is_modis = pl.col("src") == "modis"
    conf_num = pl.col("confidence").cast(pl.Int32, strict=False)
    keep_conf = pl.when(is_modis).then(conf_num.fill_null(100) >= 30).otherwise(
        ~pl.col("confidence").str.to_lowercase().is_in(["l", "low"]))
    sensor = pl.when(is_modis).then(
        pl.when(pl.col("satellite").str.to_lowercase().str.starts_with("t")).then(pl.lit("terra"))
        .otherwise(pl.lit("aqua"))).otherwise(pl.col("src"))
    typ = pl.col("type").cast(pl.Int8, strict=False)
    det = det.select(
        (pl.col("longitude").cast(pl.Float64) / CELL).floor().cast(pl.Int32).alias("ix"),
        (pl.col("latitude").cast(pl.Float64) / CELL).floor().cast(pl.Int32).alias("iy"),
        pl.col("acq_date").str.to_date().alias("date"),
        sensor.alias("sensor"),
        pl.col("frp").cast(pl.Float64, strict=False).alias("frp"),
        (pl.col("daynight") == "N").alias("night"),
        (typ.is_null() | (typ == 0)).alias("veg"),
        typ.is_not_null().alias("typed"),
        keep_conf.alias("conf_ok"),
    )
    ok = pl.col("veg") & pl.col("conf_ok")
    agg = det.group_by("ix", "iy", "date", "sensor").agg(
        pl.len().alias("n_all"),
        ok.sum().alias("n"),
        (~pl.col("veg")).sum().alias("nonveg"),
        pl.col("typed").any().alias("typed"),
        pl.col("frp").filter(ok).sum().alias("frp_sum"),
        pl.col("frp").filter(ok).max().alias("frp_max"),
        (pl.col("night") & ok).any().alias("night"),
    ).collect(engine="streaming")
    n_all = int(agg["n_all"].sum())

    # Static-source mask. Near-real-time rows carry no `type`, so gas flares, kilns and
    # plants would leak into the newest months. A cell is static if the archive saw at least
    # 5 non-vegetation detections there and they are at least a quarter of its typed detections.
    per_cell = agg.filter(pl.col("typed")).group_by("ix", "iy").agg(
        pl.col("nonveg").sum(), pl.col("n_all").sum().alias("typed_n"))
    static = per_cell.filter((pl.col("nonveg") >= 5) & (pl.col("nonveg") >= 0.25 * pl.col("typed_n"))
                             ).select("ix", "iy")
    static.write_parquet(out / "static_cells.parquet")
    before = int(agg["n"].sum())
    agg = agg.join(static.with_columns(pl.lit(True).alias("static")), on=["ix", "iy"], how="left")
    agg = agg.filter(~(pl.col("static").fill_null(False) & ~pl.col("typed")))
    agg = agg.filter(pl.col("n") > 0).drop("n_all", "nonveg", "typed", "static")
    print(f"detections read {n_all:,}; kept {before:,}; static cells {static.height:,} "
          f"(removed {before - int(agg['n'].sum()):,} untyped detections there)")

    # cell -> region, by cell centre (nearest region within one cell for coastal/border cells)
    ne = gpd.read_file(geo / "ne_10m_admin_1_states_provinces.shp")
    ne = ne[ne["admin"].isin(COUNTRIES)][["admin", "name", "iso_3166_2", "geometry"]].reset_index(drop=True)
    ne["country"] = ne["admin"].map(COUNTRIES)
    ne["rid"] = ne["iso_3166_2"].str.replace("-", "_")
    cells = agg.select("ix", "iy").unique().to_pandas()
    pts = gpd.GeoDataFrame(cells, geometry=gpd.points_from_xy((cells.ix + 0.5) * CELL, (cells.iy + 0.5) * CELL),
                           crs=ne.crs)
    j = gpd.sjoin_nearest(pts, ne[["rid", "geometry"]], how="inner", max_distance=CELL)
    j = j.drop_duplicates(["ix", "iy"])[["ix", "iy", "rid"]]
    pl.from_pandas(j).write_parquet(out / "cells.parquet")
    print(f"cells with detections in box {len(cells):,}; inside the four countries {len(j):,}")

    keep = pl.from_pandas(j)
    agg = agg.join(keep, on=["ix", "iy"], how="inner")
    agg.write_parquet(out / "det.parquet", compression="zstd")
    ne[["rid", "name", "country", "admin", "geometry"]].to_file(out / "regions.gpkg", driver="GPKG")
    import json
    json.dump({"detections_read": n_all, "detections_kept": int(agg["n"].sum()), "files": len(frames),
               "static_cells": static.height, "cell_day_sensor_rows": agg.height},
              open(out / "stats.json", "w"))
    print(f"in-country detections {agg['n'].sum():,}; rows {agg.height:,}; "
          f"dates {agg['date'].min()}..{agg['date'].max()}")
    print(agg.group_by("sensor").agg(pl.col("n").sum(), pl.col("date").min().alias("first"),
                                     pl.col("date").max().alias("last")).sort("sensor"))


if __name__ == "__main__":
    main()
