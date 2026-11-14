"""Steps 2-4: calibrate sensors to one scale, validate, and export static data for the web app.

Usage: python -I pipeline/build.py OUT_DIR RAW_API_DIR WEB_DATA_DIR DOCS_DIR

Unit of activity: the active cell-day (a 0.05 degree cell with >=1 detection on a UTC day).
Reference scale: S-NPP VIIRS active cell-days (the longest single VIIRS record).

  before 2002-07-04   Terra only          x k_terra = (Terra -> Terra+Aqua, fitted 2003-2007) x k_modis
  before 2012-01-20   Terra + Aqua        x k_modis[region, month]
  2012-01-20..2025    S-NPP               (reference, factor 1)
  from 2026-01-01     NOAA-20             x k_n20[region, month]

S-NPP's near-real-time feed thins out during 2026 and stops on 2026-11-02, so the record hands
over to NOAA-20 at the start of 2026, the first year without a complete S-NPP archive file.
Climatology (medians, percentiles) uses 2003 onward, the years with both Terra and Aqua.

Each factor k = sum(S-NPP) / sum(other sensor) over the overlap period, per state and calendar
month, shrunk toward the country-month and then the all-area month ratio when counts are small.
"""
import sys
import json
import pathlib
import datetime as dt
import duckdb
import numpy as np
import pandas as pd
import polars as pl
import geopandas as gpd
import shapely

TAU = 100.0                      # shrinkage weight, in cell-days
AQUA_START = dt.date(2002, 7, 4)
SNPP_START = dt.date(2012, 1, 20)
HANDOVER = dt.date(2026, 1, 1)    # S-NPP -> NOAA-20
BASE_YEAR = 2003                 # first climatology year (Terra + Aqua both flying)
EPOCH = dt.date(2000, 11, 1)     # first MODIS day in FIRMS
OVERLAP = {"terra": (201202, 202512), "modis": (201202, 202512),
           "n20": (201804, 202512), "n21": (202303, 202607)}
COUNTRY_NAMES = {"IN": "India", "BD": "Bangladesh", "MM": "Myanmar", "NP": "Nepal"}
TERRA_CHAIN = (200301, 200712)
WINDOW = 30                      # days in the early-warning window


def fit(df, src, grid, tgt="snpp"):
    """Shrunk ratio factors S-NPP / src per (rid, mo). df: region-month rows inside the overlap."""
    g = df.groupby("mo")[[src, tgt]].sum()
    kg = ((g[tgt] + 1) / (g[src] + 1)).reindex(range(1, 13)).fillna(1.0)
    c = df.groupby(["country", "mo"])[[src, tgt]].sum().reset_index()
    c["kc"] = (c[tgt] + TAU * c.mo.map(kg)) / (c[src] + TAU)
    r = df.groupby(["rid", "mo"])[[src, tgt]].sum().reset_index()
    out = grid.merge(c[["country", "mo", "kc"]], on=["country", "mo"], how="left")
    out["kc"] = out.kc.fillna(out.mo.map(kg))
    out = out.merge(r, on=["rid", "mo"], how="left").fillna({src: 0, tgt: 0})
    out["k"] = (out[tgt] + TAU * out.kc) / (out[src] + TAU)
    return out[["rid", "mo", "k"]]


def metrics(obs, pred, floor=100):
    obs, pred = np.asarray(obs, float), np.asarray(pred, float)
    lo, lp = np.log10(obs + 1), np.log10(pred + 1)
    big = obs >= floor
    return {"n": int(len(obs)),
            "r2_log": round(float(np.corrcoef(lo, lp)[0, 1] ** 2), 3),
            "rmse_log": round(float(np.sqrt(np.mean((lo - lp) ** 2))), 3),
            "median_abs_pct_err": round(float(np.median(np.abs(pred[big] - obs[big]) / obs[big]) * 100), 1),
            "total_ratio": round(float(pred.sum() / obs.sum()), 3)}


def cross_validate(rm, src, grid):
    """Two-fold by year parity: factors fitted on even years predict odd years and vice versa."""
    lo, hi = OVERLAP[src]
    ov = rm[(rm.ym >= lo) & (rm.ym <= hi)]
    parts = []
    for parity in (0, 1):
        k = fit(ov[ov.y % 2 == parity], src, grid)
        test = ov[ov.y % 2 != parity].merge(k, on=["rid", "mo"])
        test["pred"] = test[src] * test.k
        parts.append(test)
    cv = pd.concat(parts)
    cv["glob"] = cv[src] * ov.snpp.sum() / ov[src].sum()
    return cv


def main():
    out, raw_api, web, docs = (pathlib.Path(a) for a in sys.argv[1:5])
    web.mkdir(parents=True, exist_ok=True)
    (web / "regions").mkdir(exist_ok=True)
    docs.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"""create table cd as select ix, iy, rid, date,
        bool_or(sensor='terra') f_terra, bool_or(sensor in ('terra','aqua')) f_modis,
        bool_or(sensor='snpp') f_snpp, bool_or(sensor='n20') f_n20, bool_or(sensor='n21') f_n21,
        sum(n) n, sum(frp_sum) frp
        from '{out}/det.parquet' group by all""")
    con.execute("""create table trd as select ix//5 tx, iy//5 ty, rid, date,
        sum(f_terra::int) terra, sum(f_modis::int) modis, sum(f_snpp::int) snpp,
        sum(f_n20::int) n20, sum(f_n21::int) n21, sum(frp) frp from cd group by all""")
    max_date, snpp_end, n_cd, n_det = con.sql(
        "select max(date), max(date) filter (f_snpp), count(*), sum(n) from cd").fetchall()[0]
    print(f"cell-days {n_cd:,}; detections {n_det:,}; data to {max_date}; S-NPP to {snpp_end}")

    regions = gpd.read_file(out / "regions.gpkg")
    grid = pd.DataFrame([(r, r[:2], m) for r in regions.rid for m in range(1, 13)],
                        columns=["rid", "country", "mo"])
    rm = con.sql("""select rid, year(date) y, month(date) mo, sum(terra) terra, sum(modis) modis,
        sum(snpp) snpp, sum(n20) n20, sum(n21) n21 from trd group by all""").df()
    rm["country"] = rm.rid.str[:2]
    rm["ym"] = rm.y * 100 + rm.mo

    # ---- calibration ----
    factors = grid[["rid", "mo"]].copy()
    for src, (lo, hi) in OVERLAP.items():
        if src == "terra":
            continue
        k = fit(rm[(rm.ym >= lo) & (rm.ym <= hi)], src, grid).rename(columns={"k": f"k_{src}"})
        factors = factors.merge(k, on=["rid", "mo"])
    # Terra alone is chained through the adjacent Terra+Aqua years (2003-2007) rather than fitted
    # straight to S-NPP in 2012-2025: Terra's own behaviour drifts over two decades.
    k_tm = fit(rm[(rm.ym >= TERRA_CHAIN[0]) & (rm.ym <= TERRA_CHAIN[1])], "terra", grid, tgt="modis")
    factors = factors.merge(k_tm.rename(columns={"k": "k_tm"}), on=["rid", "mo"])
    factors["k_terra"] = factors.k_tm * factors.k_modis
    con.register("factors_df", factors)
    con.execute("create table factors as select * from factors_df")
    con.execute(f"""create table h as select t.*, case
            when date < DATE '{AQUA_START}' then terra * k_terra
            when date < DATE '{SNPP_START}' then modis * k_modis
            when date < DATE '{HANDOVER}' then snpp
            else n20 * k_n20 end as h
        from trd t join factors f on t.rid = f.rid and month(t.date) = f.mo""")

    # ---- validation ----
    val = {}
    cv = cross_validate(rm, "modis", grid)
    ry = cv.groupby(["rid", "y"])[["modis", "snpp", "pred", "glob"]].sum().reset_index()
    val["modis_region_year"] = {"calibrated": metrics(ry.snpp, ry.pred), "raw_modis": metrics(ry.snpp, ry.modis),
                                "single_global_factor": metrics(ry.snpp, ry["glob"])}
    val["modis_region_month"] = {"calibrated": metrics(cv.snpp, cv.pred), "raw_modis": metrics(cv.snpp, cv.modis),
                                 "single_global_factor": metrics(cv.snpp, cv["glob"])}
    # Terra chain, tested where Terra+Aqua exists but was not used for the fit (2008-2011)
    tt = rm[(rm.ym >= 200801) & (rm.ym <= 201112)].merge(factors[["rid", "mo", "k_tm"]], on=["rid", "mo"])
    tt["pred"] = tt.terra * tt.k_tm
    ryt = tt.groupby(["rid", "y"])[["modis", "pred"]].sum()
    val["terra_to_modis_region_year_2008_2011"] = {"calibrated": metrics(ryt.modis, ryt.pred)}
    cvj = cross_validate(rm, "n20", grid)
    ryj = cvj.groupby(["rid", "y"])[["n20", "snpp", "pred"]].sum()
    val["n20_region_year"] = {"calibrated": metrics(ryj.snpp, ryj.pred), "raw_n20": metrics(ryj.snpp, ryj.n20)}
    ov = rm[(rm.ym >= 201202) & (rm.ym <= 202512)]
    mo_all = ov.groupby(["y", "mo"])[["modis", "snpp"]].sum()
    val["monthly_corr_all_area"] = round(float(np.corrcoef(mo_all.modis, mo_all.snpp)[0, 1]), 3)
    val["viirs_per_modis_all_area"] = round(float(ov.snpp.sum() / ov.modis.sum()), 2)
    print(json.dumps(val, indent=1))

    yearly = con.sql("""select year(date) y, sum(h) h, sum(modis) modis, sum(snpp) snpp, sum(n20) n20
        from h group by all order by y""").df()
    make_figure(ry, yearly, docs / "validation.png", val)
    (web.parent / "validation.png").write_bytes((docs / "validation.png").read_bytes())

    # ---- export: months, tiles ----
    n_months = (max_date.year - 2000) * 12 + max_date.month - 11 + 1
    tm = con.sql("""select tx, ty, (year(date)-2000)*12 + month(date) - 11 mi, sum(h) h
        from h group by all""").df()
    tiles = tm[["tx", "ty"]].drop_duplicates().sort_values(["ty", "tx"]).reset_index(drop=True)
    tiles["ti"] = np.arange(len(tiles))
    tm = tm.merge(tiles, on=["tx", "ty"])
    arr = np.zeros((len(tiles), n_months), np.uint16)
    arr[tm.ti.values, tm.mi.values] = np.clip(np.round(tm.h.values * 10), 0, 65535).astype(np.uint16)
    arr.tofile(web / "tiles.bin")

    # ---- export: early-warning window, like-for-like in every year ----
    end = max_date - dt.timedelta(days=1)          # the newest day is still filling in
    start = end - dt.timedelta(days=WINDOW - 1)
    assert start.year == end.year
    win = con.sql(f"""select tx, ty, rid, year(date) y, sum(h) h from h
        where date between make_date(year(date), {start.month}, {start.day})
                       and make_date(year(date), {end.month}, {end.day}) group by all""").df()
    years = list(range(BASE_YEAR, end.year))

    def anomaly(piv):
        piv = piv.reindex(columns=years + [end.year], fill_value=0).fillna(0)
        prior, cur = piv[years].values, piv[end.year].values
        pct = ((prior < cur[:, None]).sum(1) + 0.5 * (prior == cur[:, None]).sum(1)) / len(years)
        return pd.DataFrame({"cur": cur, "med": np.median(prior, 1), "p90": np.percentile(prior, 90, 1),
                             "pct": pct}, index=piv.index), piv

    ta, _ = anomaly(win.groupby(["tx", "ty", "y"]).h.sum().unstack("y"))
    ta = tiles.merge(ta.reset_index(), on=["tx", "ty"], how="left").fillna({"cur": 0, "med": 0, "pct": 0})
    json.dump({"size": 0.25, "xy": tiles[["tx", "ty"]].values.ravel().tolist(),
               "cur": np.round(ta.cur, 1).tolist(), "med": np.round(ta.med, 1).tolist(),
               "pct": np.round(ta.pct, 3).tolist()}, open(web / "tiles.json", "w"), separators=(",", ":"))

    win["country"] = win.rid.str[:2]
    win["all"] = "ALL"
    ra = pd.concat([anomaly(win.groupby([key, "y"]).h.sum().unstack("y"))[1] for key in ("rid", "country", "all")])
    ra_stats = pd.concat([anomaly(win.groupby([key, "y"]).h.sum().unstack("y"))[0] for key in ("rid", "country", "all")])

    # ---- export: per-region series ----
    names = {r.rid: r["name"] for _, r in regions.iterrows()} | COUNTRY_NAMES | {"ALL": "All four countries"}
    daily = con.sql("""select rid, date, sum(h) h, sum(modis) modis, sum(snpp) snpp, sum(n20) n20,
        sum(n21) n21, sum(frp) frp from h group by all""").df()
    daily["country"] = daily.rid.str[:2]
    daily["all"] = "ALL"
    daily["date"] = pd.to_datetime(daily.date)
    daily["di"] = (daily.date - pd.Timestamp(EPOCH)).dt.days
    daily["mi"] = (daily.date.dt.year - 2000) * 12 + daily.date.dt.month - 11
    region_meta = []
    for key in ("rid", "country", "all"):
        for rid, d in daily.groupby(key):
            dd = d.groupby("di").h.sum()
            dd = dd[dd > 0]
            mm = d.groupby("mi")[["h", "modis", "snpp", "n20", "n21", "frp"]].sum().reindex(range(n_months), fill_value=0)
            a = ra_stats.loc[rid] if rid in ra_stats.index else None
            rec = {"id": rid, "name": names[rid],
                   "h": np.round(mm.h, 1).tolist(), "modis": mm.modis.astype(int).tolist(),
                   "snpp": mm.snpp.astype(int).tolist(), "n20": mm.n20.astype(int).tolist(),
                   "n21": mm.n21.astype(int).tolist(), "frp": np.round(mm.frp).astype(int).tolist(),
                   "d": dd.index.tolist(), "v": np.round(dd.values, 1).tolist(),
                   "window": ({"years": years + [end.year], "values": np.round(ra.loc[rid].values, 1).tolist()}
                              if rid in ra.index else None)}
            json.dump(rec, open(web / "regions" / f"{rid}.json", "w"), separators=(",", ":"))
            region_meta.append({"id": rid, "name": names[rid], "level": key,
                                "country": rid[:2] if key != "all" else None,
                                "total": round(float(mm.h.sum())),
                                "cur": round(float(a.cur), 1) if a is not None else 0,
                                "med": round(float(a.med), 1) if a is not None else 0,
                                "p90": round(float(a.p90), 1) if a is not None else 0,
                                "pct": round(float(a.pct), 3) if a is not None else 0})

    # ---- export: boundaries ----
    g = regions.copy()
    g["geometry"] = shapely.set_precision(g.geometry.simplify(0.02, preserve_topology=True).values, 0.001)
    g = g[~g.geometry.is_empty]
    b = regions.geometry.bounds.round(2)
    bbox = {r: [b.minx[i], b.miny[i], b.maxx[i], b.maxy[i]] for i, r in enumerate(regions.rid)}
    for c in COUNTRY_NAMES:
        tb = regions[regions.country == c].total_bounds.round(2)
        bbox[c] = tb.tolist()
    bbox["ALL"] = regions.total_bounds.round(2).tolist()
    for m in region_meta:
        m["bbox"] = bbox.get(m["id"])
    g[["rid", "name", "country", "geometry"]].to_file(web / "regions.geojson", driver="GeoJSON")

    # ---- export: recent hotspots (last 10 days, near-real-time) ----
    since = end - dt.timedelta(days=9)
    sens = {"MODIS_NRT": "MODIS", "VIIRS_SNPP_NRT": "S-NPP", "VIIRS_NOAA20_NRT": "NOAA-20", "VIIRS_NOAA21_NRT": "NOAA-21"}
    frames = []
    for folder, label in sens.items():
        for p in sorted((raw_api / folder).glob("*.csv")):
            if dt.date.fromisoformat(p.stem) < since - dt.timedelta(days=5) or p.stat().st_size < 100:
                continue
            frames.append(pl.read_csv(p, infer_schema=False).select(
                "latitude", "longitude", "acq_date", "acq_time", "confidence", "frp", "daynight"
            ).with_columns(pl.lit(label).alias("sensor")))
    rec = pl.concat(frames).with_columns(
        pl.col("latitude").cast(pl.Float64), pl.col("longitude").cast(pl.Float64),
        pl.col("acq_date").str.to_date(), pl.col("frp").cast(pl.Float64, strict=False).fill_null(0),
    ).filter((pl.col("acq_date") >= since) & (pl.col("acq_date") <= max_date))
    cnum = pl.col("confidence").cast(pl.Int32, strict=False)
    rec = rec.with_columns(
        pl.when(cnum.is_not_null()).then(pl.when(cnum < 30).then(pl.lit("l")).when(cnum < 80).then(pl.lit("n"))
                                         .otherwise(pl.lit("h"))).otherwise(pl.col("confidence").str.slice(0, 1)
                                                                            .str.to_lowercase()).alias("conf"),
        (pl.col("longitude") / 0.05).floor().cast(pl.Int32).alias("ix"),
        (pl.col("latitude") / 0.05).floor().cast(pl.Int32).alias("iy"))
    cells = pl.read_parquet(out / "cells.parquet")
    static = pl.read_parquet(out / "static_cells.parquet").with_columns(pl.lit(True).alias("st"))
    rec = rec.filter(pl.col("conf") != "l").join(cells, on=["ix", "iy"], how="inner") \
             .join(static, on=["ix", "iy"], how="left").filter(pl.col("st").is_null()).sort("acq_date", "acq_time")
    json.dump({"lat": rec["latitude"].round(4).to_list(), "lon": rec["longitude"].round(4).to_list(),
               "day": [(d - since).days for d in rec["acq_date"].to_list()],
               "time": rec["acq_time"].to_list(), "frp": rec["frp"].round(1).to_list(),
               "sensor": rec["sensor"].to_list(), "conf": rec["conf"].to_list(),
               "dn": rec["daynight"].to_list(), "rid": rec["rid"].to_list(), "since": str(since)},
              open(web / "recent.json", "w"), separators=(",", ":"))
    print(f"recent hotspots {rec.height:,} since {since}")

    # ---- export: meta ----
    stats = json.load(open(out / "stats.json"))
    kmed = factors.assign(country=factors.rid.str[:2]).groupby("country")[
        ["k_terra", "k_modis", "k_n20", "k_n21"]].median().round(2)
    alerts = sorted([m for m in region_meta if m["level"] == "rid" and m["pct"] >= 0.9 and m["cur"] >= 30],
                    key=lambda m: -(m["cur"] / max(m["med"], 1)))
    meta = {"generated": str(dt.date.today()), "epoch": str(EPOCH), "nMonths": int(n_months),
            "maxDate": str(max_date), "snppEnd": str(snpp_end), "aquaStart": str(AQUA_START),
            "snppStart": str(SNPP_START), "handover": str(HANDOVER), "baseYear": BASE_YEAR, "window": {"start": str(start), "end": str(end), "days": WINDOW},
            "stats": stats | {"cell_days": int(n_cd), "tiles": int(len(tiles)), "recent": rec.height,
                              "years": end.year - 2000 + 1},
            "validation": val, "factorMedians": kmed.reset_index().to_dict("records"),
            "factors": {r: [round(float(x), 3) for x in grp.sort_values("mo").k_modis]
                        for r, grp in factors.groupby("rid")},
            "yearly": yearly.round(0).astype(int).to_dict("list"),
            "regions": region_meta, "alerts": [m["id"] for m in alerts]}
    json.dump(meta, open(web / "meta.json", "w"), separators=(",", ":"))
    print(f"tiles {len(tiles):,}; months {n_months}; regions {len(region_meta)}; alerts {len(alerts)}")
    for p in sorted(web.glob("*")):
        if p.is_file():
            print(f"  {p.name:18s} {p.stat().st_size / 1e6:.2f} MB")


def make_figure(ry, yearly, path, val):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    bg, fg, grid_c = "#0b0d12", "#e8e6e1", "#2a2e38"
    plt.rcParams.update({"figure.facecolor": bg, "axes.facecolor": bg, "savefig.facecolor": bg,
                         "text.color": fg, "axes.labelcolor": fg, "xtick.color": fg, "ytick.color": fg,
                         "axes.edgecolor": grid_c, "font.size": 10})
    fig, ax = plt.subplots(1, 3, figsize=(15, 4.8))
    lim = [1, max(ry.snpp.max(), ry.pred.max()) * 1.5]
    for a, col, title, key in ((ax[0], "modis", "Raw MODIS vs S-NPP", "raw_modis"),
                               (ax[1], "pred", "Calibrated MODIS vs S-NPP (held-out years)", "calibrated")):
        m = val["modis_region_year"][key]
        a.scatter(ry.snpp + 1, ry[col] + 1, s=7, alpha=0.55, color="#f98e09" if col == "pred" else "#7a7f8c", lw=0)
        a.plot(lim, lim, color=fg, lw=0.8, ls="--")
        a.set(xscale="log", yscale="log", xlim=lim, ylim=lim, title=title,
              xlabel="S-NPP active cell-days per state-year", ylabel="MODIS estimate")
        a.text(0.04, 0.9, f"median abs. error {m['median_abs_pct_err']}%\nlog R2 {m['r2_log']}",
               transform=a.transAxes, va="top")
        a.grid(color=grid_c, lw=0.5)
    y = yearly[(yearly.y >= 2001) & (yearly.y < yearly.y.max())]
    ax[2].plot(y.y, y.modis, color="#7a7f8c", lw=1.2, label="raw MODIS")
    ax[2].plot(y.y[y.snpp > 0], y.snpp[y.snpp > 0], color="#57c4ad", lw=1.2, label="raw S-NPP")
    ax[2].plot(y.y[y.n20 > 0], y.n20[y.n20 > 0], color="#b07aa1", lw=1.2, label="raw NOAA-20")
    ax[2].plot(y.y, y.h, color="#f98e09", lw=2.2, label="harmonized index")
    ax[2].set(title="Active cell-days per year, all four countries", xlabel="year (complete years)")
    ax[2].legend(frameon=False, loc="center left", bbox_to_anchor=(0.0, 0.5))
    ax[2].grid(color=grid_c, lw=0.5)
    fig.tight_layout()
    fig.savefig(path, dpi=140)


if __name__ == "__main__":
    main()
