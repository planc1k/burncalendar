"""What the harmonized record says, and whether its sensors still agree.

trend        Theil-Sen slope with a Mann-Kendall test: robust to single extreme years.
season_shift Has the main burning season moved earlier or later?
health       Monthly agreement between sensor pairs after calibration (1.0 = agree as in the fit years).
"""
import math
import numpy as np


def mann_kendall_p(y):
    """Two-sided p-value of the Mann-Kendall trend test (normal approximation, no tie correction)."""
    y = np.asarray(y, float)
    n = len(y)
    if n < 8:
        return 1.0
    s = sum(np.sign(y[j] - y[i]) for i in range(n - 1) for j in range(i + 1, n))
    var = n * (n - 1) * (2 * n + 5) / 18
    z = (s - np.sign(s)) / math.sqrt(var) if s != 0 else 0.0
    return float(math.erfc(abs(z) / math.sqrt(2)))


def theil_sen(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    slopes = [(y[j] - y[i]) / (x[j] - x[i]) for i in range(len(x) - 1) for j in range(i + 1, len(x))]
    return float(np.median(slopes)) if slopes else 0.0


def trend(years, values):
    """Percent change per decade relative to the series mean, and the test's p-value. None if too little fire."""
    values = np.asarray(values, float)
    mean = values.mean()
    if mean < 100 or len(values) < 10:
        return None
    return {"pct": round(theil_sen(years, values) * 10 / mean * 100, 1), "p": round(mann_kendall_p(values), 4)}


def verdict(t, alpha=0.05):
    if t is None:
        return "none"
    return "flat" if t["p"] >= alpha else "rising" if t["pct"] > 0 else "falling"


def season_shift(monthly, first_year, last_year, epoch_year=2000, epoch_month=11):
    """monthly: values from (epoch_year, epoch_month). The main season is the 5 months centred on the
    month with the highest median. Returns the peak month and the trend of its activity-weighted centre, in
    days per decade (positive = later)."""
    idx = lambda y, m: (y - epoch_year) * 12 + (m - epoch_month)        # m is 1-12
    by_month = [[monthly[idx(y, m)] for y in range(first_year, last_year + 1)] for m in range(1, 13)]
    peak = int(np.argmax([np.median(v) for v in by_month])) + 1
    years, centres = [], []
    for y in range(first_year, last_year + 1):
        pos, w = [], []
        for off in range(-2, 3):
            m, yy = peak + off, y
            if m < 1: m, yy = m + 12, y - 1
            if m > 12: m, yy = m - 12, y + 1
            i = idx(yy, m)
            if 0 <= i < len(monthly):
                pos.append(off * 30.4); w.append(monthly[i])
        if sum(w) >= 100:
            years.append(y); centres.append(float(np.average(pos, weights=w)))
    if len(years) < 12:
        return None
    return {"peak": peak, "days": round(theil_sen(years, centres) * 10, 1), "p": round(mann_kendall_p(centres), 4),
            "first": round(float(np.mean(centres[:5])), 1), "last": round(float(np.mean(centres[-5:])), 1)}


def alarms(months, index, expected, lo=0.8, hi=1.25, min_expected=500, run=2):
    """Runs of at least `run` consecutive months where the agreement index leaves [lo, hi]."""
    out, start = [], None
    for i, (v, e) in enumerate(zip(index, expected)):
        bad = v is not None and e >= min_expected and not (lo <= v <= hi)
        if bad and start is None:
            start = i
        if not bad and start is not None:
            if i - start >= run:
                out.append({"from": months[start], "to": months[i - 1], "low": round(min(index[start:i]), 2),
                            "high": round(max(index[start:i]), 2)})
            start = None
    if start is not None and len(index) - start >= run:
        out.append({"from": months[start], "to": months[-1], "low": round(min(index[start:]), 2),
                    "high": round(max(index[start:]), 2), "open": True})
    return out
