"""Independent check against burned area.

Usage: python -I pipeline/validate_ba.py OUT_DIR GFED5_DIR WEB_DATA_DIR DOCS_DIR

Reference: GFED5 monthly burned area (Chen et al. 2023, Zenodo 10.5281/zenodo.7668423, CC BY 4.0),
0.25 degree, 2001-2020. It is built from MODIS throughout, so it has no sensor change in 2012.
It maps burn scars from surface reflectance; our record counts active-fire detections. The two are
different measurements of the same fires, though GFED5 does use MODIS active fires for its
small-fire correction, so it is not fully independent.

The question: if our harmonization is right, the amount of burned area per active cell-day in a
state should be the same before and after 2012. A naive splice of raw MODIS and raw S-NPP should
show a step instead.
"""
import sys
import json
import pathlib
import numpy as np
import pandas as pd
import netCDF4

Y0, Y1, SPLIT = 2003, 2020, 2012
BOX = (68.0, -45.0, 155.0, 38.0)   # west, south, east, north
TILE = 0.25


def read_gfed(folder):
    rows = []
    for y in range(Y0, Y1 + 1):
        for m in range(1, 13):
            path = next(folder.rglob(f"BA{y}{m:02d}.nc"))
            with netCDF4.Dataset(path) as nc:
                lat, lon = nc["lat"][:], nc["lon"][:]
                la = np.where((lat > BOX[1]) & (lat < BOX[3]))[0]
                lo = np.where((lon > BOX[0]) & (lon < BOX[2]))[0]
                ba = np.ma.filled(nc["Total"][0, la.min():la.max() + 1, lo.min():lo.max() + 1], 0.0)
            ba = np.nan_to_num(ba)
            iy, ix = np.nonzero(ba > 0)
            rows.append(pd.DataFrame({"tx": np.floor(lon[lo.min() + ix] / TILE).astype(int),
                                      "ty": np.floor(lat[la.min() + iy] / TILE).astype(int),
                                      "y": y, "mo": m, "ba": ba[iy, ix]}))
    return pd.concat(rows, ignore_index=True)


def spearman(a, b):
    ra, rb = pd.Series(a).rank().values, pd.Series(b).rank().values
    return float(np.corrcoef(ra, rb)[0, 1]) if np.std(ra) > 0 and np.std(rb) > 0 else np.nan


def main():
    out, gfed, web, docs = (pathlib.Path(a) for a in sys.argv[1:5])
    tm = pd.read_parquet(out / "tile_month.parquet")
    tm = tm[(tm.y >= Y0) & (tm.y <= Y1)]
    tm["naive"] = np.where(tm.y < SPLIT, tm.modis, tm.snpp)        # raw MODIS, then raw S-NPP
    # each tile belongs to the state that holds most of its activity
    owner = tm.groupby(["tx", "ty", "rid"]).h.sum().reset_index().sort_values("h").drop_duplicates(["tx", "ty"], keep="last")
    ba = read_gfed(gfed).merge(owner[["tx", "ty", "rid"]], on=["tx", "ty"])
    print(f"GFED5 tile-months with burned area inside the countries: {len(ba):,}")

    ours = tm.groupby(["rid", "y"])[["h", "naive"]].sum().reset_index()
    sy = ours.merge(ba.groupby(["rid", "y"]).ba.sum().reset_index(), on=["rid", "y"], how="left").fillna({"ba": 0})
    sy["era"] = np.where(sy.y < SPLIT, "a", "b")

    # 1. step at the sensor change: (burned area per cell-day before 2012) / (after 2012), per state
    era = sy.groupby(["rid", "era"])[["h", "naive", "ba"]].sum().unstack("era")
    ok = (era["ba"]["a"] >= 200) & (era["ba"]["b"] >= 200) & (era["h"]["a"] >= 500) & (era["h"]["b"] >= 500)
    era = era[ok]
    step = lambda col: (era["ba"]["a"] / era[col]["a"]) / (era["ba"]["b"] / era[col]["b"])
    st_h, st_n = step("h"), step("naive")
    q = lambda s: [round(float(v), 2) for v in np.percentile(s, [25, 50, 75])]
    # 2. do good and bad years line up? rank correlation across years, per state
    rho = sy[sy.rid.isin(era.index)].groupby("rid").apply(
        lambda d: pd.Series({"h": spearman(d.h, d.ba), "naive": spearman(d.naive, d.ba)}), include_groups=False)
    # 3. seasons: monthly totals over the whole area
    mo = tm.groupby(["y", "mo"]).h.sum().reset_index().merge(ba.groupby(["y", "mo"]).ba.sum().reset_index(), on=["y", "mo"])
    res = {"source": "GFED5 burned area (Chen et al. 2023), Zenodo 10.5281/zenodo.7668423, CC BY 4.0",
           "years": [Y0, Y1], "split": SPLIT, "states": int(len(era)),
           "step_harmonized": q(st_h), "step_naive": q(st_n),
           "within_25pct_harmonized": round(float(((st_h > 0.8) & (st_h < 1.25)).mean()), 3),
           "within_25pct_naive": round(float(((st_n > 0.8) & (st_n < 1.25)).mean()), 3),
           "rank_corr_harmonized": round(float(rho.h.median()), 3), "rank_corr_naive": round(float(rho.naive.median()), 3),
           "monthly_corr": round(float(np.corrcoef(mo.h, mo.ba)[0, 1]), 3),
           "monthly_rank_corr": round(spearman(mo.h, mo.ba), 3)}
    print(json.dumps(res, indent=1))
    json.dump(res, open(web / "ba.json", "w"), separators=(",", ":"))

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    bg, fg, grid_c = "#fbf8f1", "#1d1a16", "#ddd5c5"
    plt.rcParams.update({"figure.facecolor": bg, "axes.facecolor": bg, "savefig.facecolor": bg, "text.color": fg,
                         "axes.labelcolor": fg, "xtick.color": fg, "ytick.color": fg, "axes.edgecolor": grid_c, "font.size": 10})
    fig, ax = plt.subplots(1, 2, figsize=(12, 4.4))
    yr = sy.groupby("y")[["h", "naive", "ba"]].sum()
    late = yr[yr.index >= SPLIT].mean()
    ax[0].plot(yr.index, yr.ba / late.ba, color=fg, lw=2, label="GFED5 burned area")
    ax[0].plot(yr.index, yr.h / late.h, color="#d4541f", lw=2, label="harmonized record")
    ax[0].plot(yr.index, yr.naive / late.naive, color="#2a78d6", lw=1.4, ls="--", label="raw MODIS then raw S-NPP")
    ax[0].axvline(SPLIT - 0.5, color=grid_c, lw=1)
    ax[0].set(title="All six countries, each line relative to its 2012-2020 average", xlabel="year", ylim=(0, None))
    ax[0].set_xticks(range(2004, Y1 + 1, 4))
    ax[0].legend(frameon=False); ax[0].grid(color=grid_c, lw=0.5)
    bins = np.logspace(np.log10(0.1), np.log10(10), 31)
    ax[1].hist(np.clip(st_n, 0.1, 10), bins=bins, color="#2a78d6", alpha=0.55, label=f"raw splice (median {res['step_naive'][1]})")
    ax[1].hist(np.clip(st_h, 0.1, 10), bins=bins, color="#d4541f", alpha=0.75, label=f"harmonized (median {res['step_harmonized'][1]})")
    ax[1].axvline(1, color=fg, lw=0.8, ls="--")
    ax[1].set(xscale="log", title=f"Step at 2012 in burned area per cell-day, {len(era)} states",
              xlabel="before 2012 / after 2012  (1 = no step)", ylabel="states")
    ax[1].legend(frameon=False); ax[1].grid(color=grid_c, lw=0.5)
    fig.tight_layout()
    fig.savefig(docs / "burned_area.png", dpi=140)
    (web.parent / "burned_area.png").write_bytes((docs / "burned_area.png").read_bytes())


if __name__ == "__main__":
    main()
