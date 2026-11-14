"""Two honesty checks on the record.

1. warning_skill: replay the early-warning rule over every past year and score it.
   Rule (same as the live one): the last 30 days are at or above the 90th percentile of the same
   dates in the other years, and at least MIN_ACT cell-days.
   Event it should warn of: the *following* 30 days are severe by the same definition.
   Percentiles are leave-one-year-out, so a year never sets its own bar.

2. ratio_band: how far the calibrated estimate was from the truth on held-out years,
   as an 80% range of truth / estimate. Shown in the app next to every estimated value.
"""
import datetime as dt
import numpy as np

WINDOW = 30
MIN_ACT = 30
STEP = 7  # evaluate once a week


def loo_pct(m):
    """m: years x points. For each cell, the share of the other years below it (ties count half)."""
    below = (m[:, None, :] > m[None, :, :]).sum(1)
    ties = (m[:, None, :] == m[None, :, :]).sum(1) - 1
    return (below + 0.5 * ties) / (m.shape[0] - 1)


def windows(x, d0, years, offset):
    """30-day sums ending `offset` days after each weekly evaluation day, as years x weeks.
    x: daily values starting at date d0."""
    c = np.concatenate([[0.0], np.cumsum(x)])
    out = np.zeros((len(years), 364 // STEP))
    for i, y in enumerate(years):
        base = (dt.date(y, 1, 1) - d0).days
        for k in range(out.shape[1]):
            end = base + k * STEP + offset
            out[i, k] = c[end + 1] - c[end + 1 - WINDOW]
    return out


def warning_skill(series, d0, years, leads=(0, 14, 28), flag_pct=0.9):
    """series: {region id: daily array from d0}. Returns {lead: counts and scores} summed over regions."""
    res = {lead: dict(tp=0, fp=0, fn=0, n=0) for lead in leads}
    for x in series.values():
        a = windows(x, d0, years, 0)
        flag = (loo_pct(a) >= flag_pct) & (a >= MIN_ACT)
        for lead in leads:
            f = windows(x, d0, years, lead + WINDOW)
            event = (loo_pct(f) >= 0.9) & (f >= MIN_ACT)
            r = res[lead]
            r["tp"] += int((flag & event).sum()); r["fp"] += int((flag & ~event).sum())
            r["fn"] += int((~flag & event).sum()); r["n"] += flag.size
    for r in res.values():
        events, flags = r["tp"] + r["fn"], r["tp"] + r["fp"]
        r["caught"] = round(r["tp"] / events, 3) if events else None        # share of severe periods flagged beforehand
        r["right"] = round(r["tp"] / flags, 3) if flags else None           # share of flags followed by a severe period
        r["base"] = round(events / r["n"], 4) if r["n"] else None           # how often a severe period follows any week
        r["lift"] = round(r["right"] / r["base"], 1) if flags and events else None
    return res


def first_flag(x, d0, years, peak_day, max_gap=7, look_back=240):
    """Walk back from the 30-day window ending on peak_day while the warning flag stays on
    (gaps up to max_gap days allowed). Returns the first flagged day, or None if the peak itself was not flagged."""
    c = np.concatenate([[0.0], np.cumsum(x)])
    win = lambda end: c[end + 1] - c[end + 1 - WINDOW]
    y = peak_day.year
    others = [yy for yy in years if yy != y]

    def flagged(day):
        cur = win((day - d0).days)
        offset = (day - dt.date(day.year, 1, 1)).days
        ref = np.array([win((dt.date(yy, 1, 1) - d0).days + offset) for yy in others])
        return cur >= MIN_ACT and ((ref < cur).sum() + 0.5 * (ref == cur).sum()) / len(ref) >= 0.9

    if not flagged(peak_day):
        return None
    first, gap = peak_day, 0
    for back in range(1, look_back):
        day = peak_day - dt.timedelta(days=back)
        if flagged(day):
            first, gap = day, 0
        else:
            gap += 1
            if gap > max_gap:
                break
    return first


def ratio_band(obs, pred, floor, min_n=10):
    """80% range of truth / estimate where the truth is at least `floor`. None when too few cases."""
    obs, pred = np.asarray(obs, float), np.asarray(pred, float)
    ok = (obs >= floor) & (pred > 0)
    if ok.sum() < min_n:
        return None
    lo, hi = np.percentile(obs[ok] / pred[ok], [10, 90])
    return [round(float(lo), 3), round(float(hi), 3)]


def widen(a, b):
    """Combine two independent multiplicative ranges (errors add in quadrature on the log scale)."""
    lo = np.exp(-np.hypot(np.log(a[0]), np.log(b[0])))
    hi = np.exp(np.hypot(np.log(a[1]), np.log(b[1])))
    return [round(float(lo), 3), round(float(hi), 3)]
