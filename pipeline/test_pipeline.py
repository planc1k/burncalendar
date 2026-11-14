"""Run: .venv/bin/python -I pipeline/test_pipeline.py"""
import sys
import pathlib
import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import build  # noqa: E402


def test_fit_recovers_known_ratio():
    # S-NPP sees exactly 4x what MODIS sees in region A; region B has almost no data.
    rows = [("IN_A", "IN", mo, y, 1000, 4000) for mo in range(1, 13) for y in (2012, 2013)]
    rows += [("IN_B", "IN", 1, 2012, 1, 9)]
    df = pd.DataFrame(rows, columns=["rid", "country", "mo", "y", "modis", "snpp"])
    grid = pd.DataFrame([(r, "IN", m) for r in ("IN_A", "IN_B") for m in range(1, 13)],
                        columns=["rid", "country", "mo"])
    k = build.fit(df, "modis", grid).set_index(["rid", "mo"]).k
    assert abs(k[("IN_A", 3)] - 4) < 0.01, k[("IN_A", 3)]
    # 1 vs 9 cell-days is noise: the factor must stay near the country's 4, not jump to 9
    assert abs(k[("IN_B", 1)] - 4) < 0.2, k[("IN_B", 1)]
    # a month with no data at all falls back to the country value
    assert abs(k[("IN_B", 7)] - 4) < 0.01, k[("IN_B", 7)]


def test_tile_format():
    # Same example as web/lib/data.test.ts: 2 tiles x 3 months.
    arr = np.array([[0, 7, 0], [5, 0, 9]], np.uint16)
    want = np.array([1, 2, 1, 0, 2, 7, 5, 9], "<u2").tobytes()
    assert build.encode_tiles(arr) == want


def test_warning_skill_and_first_flag():
    import datetime as dt
    import skill
    d0, years = dt.date(2002, 11, 1), list(range(2003, 2013))
    x = np.full((dt.date(2013, 6, 1) - d0).days, 2.0)            # a quiet region: 60 cell-days per 30 days
    start = (dt.date(2008, 3, 1) - d0).days
    x[start:start + 90] = 40.0                                    # one 90-day outbreak in 2008
    r = skill.warning_skill({"A": x}, d0, years)[0]
    assert r["tp"] >= 10 and r["fp"] <= 5, r      # only flags in the outbreak's last weeks are not followed by more of it
    assert r["caught"] > 0.6 and r["lift"] > 5, r
    first = skill.first_flag(x, d0, years, dt.date(2008, 5, 1))
    assert dt.date(2008, 3, 1) <= first <= dt.date(2008, 3, 8), first   # fires within a week of the start
    assert skill.first_flag(x, d0, years, dt.date(2009, 5, 1)) is None  # nothing to flag in a normal year
    assert skill.ratio_band([90, 100, 110] * 5, [100] * 15, 30) == [0.9, 1.1]


if __name__ == "__main__":
    test_warning_skill_and_first_flag()
    test_fit_recovers_known_ratio()
    test_tile_format()
    print("ok")
