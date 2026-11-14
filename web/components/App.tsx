"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Calendar, DailyStrip, Seasonal, SensorChart, WindowBars } from "./Charts";
import type { Mode } from "./MapView";
import {
  FIRE_STOPS, MONTHS, MONTHS_LONG, Recent, Region, RegionData, Selection, Tiles, boxSeries, diverge, download, fmt, fmtFull,
  miMonth, miYear, monthLabel, monthStats, toMi,
} from "@/lib/data";

const MapView = dynamic(() => import("./MapView"), { ssr: false });
const get = (p: string) => fetch(`/data/${p}`).then((r) => { if (!r.ok) throw new Error(p); return r; });
const COUNTRY = { IN: "India", BD: "Bangladesh", MM: "Myanmar", NP: "Nepal" } as Record<string, string>;

function status(pct: number, cur: number) {
  if (cur < 30) return { key: "quiet", label: "Quiet", icon: "–" };
  if (pct >= 0.9) return { key: "high", label: "Well above normal", icon: "▲" };
  if (pct >= 0.75) return { key: "elev", label: "Above normal", icon: "△" };
  if (pct <= 0.15) return { key: "low", label: "Below normal", icon: "▽" };
  return { key: "norm", label: "Within normal range", icon: "●" };
}

export default function App() {
  const [meta, setMeta] = useState<any>(null);
  const [tiles, setTiles] = useState<Tiles | null>(null);
  const [bin, setBin] = useState<Uint16Array | null>(null);
  const [geo, setGeo] = useState<any>(null);
  const [recent, setRecent] = useState<Recent | null>(null);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection>({ type: "region", id: "ALL" });
  const [regionData, setRegionData] = useState<RegionData | null>(null);
  const [month, setMonth] = useState(0);
  const [mode, setMode] = useState<Mode>("activity");
  const [drawing, setDrawing] = useState(false);
  const [relative, setRelative] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [range, setRange] = useState<[number, number]>([2000, 2026]);
  const [coords, setCoords] = useState("");
  const cache = useRef(new Map<string, RegionData>());
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    Promise.all([get("meta.json").then((r) => r.json()), get("tiles.json").then((r) => r.json()),
      get("tiles.bin").then((r) => r.arrayBuffer()), get("regions.geojson").then((r) => r.json())])
      .then(([m, t, b, g]) => {
        setMeta(m); setTiles(t); setBin(new Uint16Array(b)); setGeo(g);
        setMonth(m.nMonths - 1);
        setRange([2000, miYear(m.nMonths - 1)]);
      }).catch((e) => setError(String(e)));
  }, []);

  const loadRecent = useCallback(() => recent ? Promise.resolve(recent)
    : get("recent.json").then((r) => r.json()).then((r: Recent) => { setRecent(r); return r; }), [recent]);
  useEffect(() => { if (mode === "hotspots") loadRecent().catch((e) => setError(String(e))); }, [mode, loadRecent]);

  useEffect(() => {
    if (selection.type !== "region") return setRegionData(null);
    const id = selection.id, hit = cache.current.get(id);
    if (hit) return setRegionData(hit);
    let live = true;
    get(`regions/${id}.json`).then((r) => r.json()).then((d: RegionData) => {
      cache.current.set(id, d);
      if (live) setRegionData(d);
    }).catch((e) => setError(String(e)));
    return () => { live = false; };
  }, [selection]);

  useEffect(() => {
    if (!playing || !meta) return;
    const t = setInterval(() => setMonth((m) => (m + 1) % meta.nMonths), 220);
    return () => clearInterval(t);
  }, [playing, meta]);

  const lastMi = meta ? meta.nMonths - 1 : 0;
  const regions: Region[] = meta?.regions ?? [];
  const region = selection.type === "region" ? regions.find((r) => r.id === selection.id) : undefined;
  const box = useMemo(() => (selection.type === "box" && tiles && bin && meta
    ? boxSeries(tiles, bin, meta.nMonths, selection.bbox) : null), [selection, tiles, bin, meta]);
  const loadingRegion = selection.type === "region" && regionData?.id !== selection.id;
  const series: number[] | null = selection.type === "box" ? box!.series : loadingRegion ? null : regionData!.h;

  const summary = useMemo(() => {
    if (!series || !meta) return null;
    const stats = monthStats(series, lastMi);
    const peak = stats.reduce((b, s, i) => (s.med > stats[b].med ? i : b), 0);
    const share = stats[peak].med / Math.max(1, stats.reduce((a, s) => a + s.med, 0));
    let best = 2001, bestV = -1;
    for (let y = 2001; y < miYear(lastMi); y++) {
      let s = 0;
      for (let m = 0; m < 12; m++) s += series[toMi(y, m)] ?? 0;
      if (s > bestV) { bestV = s; best = y; }
    }
    const prev = lastMi - 1, pm = miMonth(prev);
    return { stats, peak, share, best, bestV, total: series.reduce((a, b) => a + b, 0), prev, prevV: series[prev], prevMed: stats[pm].med };
  }, [series, meta, lastMi]);

  if (error) return <div className="splash">Could not load data: {error}</div>;
  if (!meta || !tiles || !bin || !geo) return <div className="splash"><div className="flame" />Loading 26 years of fire…</div>;

  const title = selection.type === "box" ? "Custom area" : region?.name ?? "";
  const sub = selection.type === "box"
    ? `${selection.bbox[1]}°N–${selection.bbox[3]}°N, ${selection.bbox[0]}°E–${selection.bbox[2]}°E · ${box!.count} grid tiles`
    : region?.level === "rid" ? COUNTRY[region.country!] : region?.level === "country" ? "Country" : "India, Bangladesh, Myanmar, Nepal";
  const st = region ? status(region.pct, region.cur) : null;
  const win = meta.window;
  const winLabel = `${win.start.slice(5)} to ${win.end.slice(5)}`;
  const alertList = [...regions].filter((r) => r.level === "rid" && r.cur >= 30)
    .sort((a, b) => b.pct - a.pct || b.cur / Math.max(1, b.med) - a.cur / Math.max(1, a.med)).slice(0, 7);

  const csvMonthly = () => {
    if (!series || !summary) return;
    const rd = selection.type === "region" ? regionData : null;
    const rows = [["year", "month", "harmonized_active_cell_days", "median_for_month", "ratio_to_median",
      ...(rd ? ["raw_modis_cell_days", "raw_snpp_cell_days", "raw_noaa20_cell_days", "frp_sum_mw"] : [])].join(",")];
    for (let mi = 0; mi <= lastMi; mi++) {
      const y = miYear(mi), m = miMonth(mi);
      if (y < range[0] || y > range[1]) continue;
      const med = summary.stats[m].med;
      rows.push([y, m + 1, series[mi].toFixed(1), med.toFixed(1), med > 0 ? (series[mi] / med).toFixed(2) : "",
        ...(rd ? [rd.modis[mi], rd.snpp[mi], rd.n20[mi], rd.frp[mi]] : [])].join(","));
    }
    download(`burncalendar_${title.replace(/\W+/g, "_")}_${range[0]}-${range[1]}.csv`, rows.join("\n"));
  };
  const csvHotspots = async () => {
    const r = await loadRecent();
    const since = Date.parse(r.since + "T00:00:00Z");
    const rows = ["latitude,longitude,acq_date,acq_time_utc,sensor,confidence,frp_mw,daynight,region"];
    for (let i = 0; i < r.lat.length; i++) {
      const ok = selection.type === "box"
        ? r.lon[i] >= selection.bbox[0] && r.lon[i] <= selection.bbox[2] && r.lat[i] >= selection.bbox[1] && r.lat[i] <= selection.bbox[3]
        : region?.level === "all" || (region?.level === "country" ? r.rid[i].startsWith(region.id) : r.rid[i] === region?.id);
      if (ok) rows.push([r.lat[i], r.lon[i], new Date(since + r.day[i] * 864e5).toISOString().slice(0, 10), r.time[i].padStart(4, "0"),
        r.sensor[i], r.conf[i] === "h" ? "high" : "nominal", r.frp[i], r.dn[i], r.rid[i]].join(","));
    }
    download(`burncalendar_hotspots_${title.replace(/\W+/g, "_")}_since_${r.since}.csv`, rows.join("\n"));
  };
  const svgDownload = () => {
    if (!svgRef.current) return;
    const s = svgRef.current.cloneNode(true) as SVGSVGElement;
    s.setAttribute("style", "background:#12151c;font-family:monospace;font-size:10px");
    s.querySelectorAll("text").forEach((t) => t.setAttribute("fill", "#b6bac6"));
    s.querySelectorAll(".cell-na").forEach((t) => t.setAttribute("fill", "#171a22"));
    s.querySelectorAll(".bar-muted").forEach((t) => t.setAttribute("fill", "#4a4f5c"));
    download(`burncalendar_${title.replace(/\W+/g, "_")}.svg`, new XMLSerializer().serializeToString(s), "image/svg+xml");
  };
  const applyCoords = () => {
    const v = coords.split(/[,\s]+/).map(Number).filter((x) => !Number.isNaN(x));
    if (v.length === 2) setSelection({ type: "box", bbox: [v[1] - 0.5, v[0] - 0.5, v[1] + 0.5, v[0] + 0.5].map((x) => Math.round(x * 100) / 100) as any });
    else if (v.length === 4) setSelection({ type: "box", bbox: [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])] });
  };
  const years = Array.from({ length: miYear(lastMi) - 2000 + 1 }, (_, i) => 2000 + i);
  const val = meta.validation.modis_region_year;

  return (
    <>
      <header className="top">
        <div className="brand"><span className="mark" />BurnCalendar</div>
        <p className="tag">One fire record from MODIS and VIIRS. South Asia, {meta.epoch.slice(0, 4)} to today.</p>
        <nav><a href="#explore">Explore</a><a href="#method">How it works</a><a href="#data">Data</a></nav>
      </header>

      <section className="hero">
        {[[fmt(meta.stats.detections_read), "satellite detections read"], [String(meta.stats.years - 1), "years in one record"],
          ["4", "sensors on one scale"], [`${val.calibrated.median_abs_pct_err}%`, "median error on held-out years"]].map(([n, l]) => (
          <div key={l} className="stat"><b>{n}</b><span>{l}</span></div>))}
      </section>

      <main id="explore" className="explore">
        <div className="map-col">
          <div className="toolbar">
            <div className="seg" role="tablist" aria-label="Map layer">
              {([["activity", "Monthly activity"], ["anomaly", "Early warning"], ["hotspots", "Latest hotspots"]] as [Mode, string][]).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>))}
            </div>
            <button className={drawing ? "btn on" : "btn"} onClick={() => setDrawing((d) => !d)}>{drawing ? "Drag on the map…" : "Draw an area"}</button>
            <form className="coords" onSubmit={(e) => { e.preventDefault(); applyCoords(); }}>
              <input value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="lat, lon  or  W, S, E, N" aria-label="Coordinates" />
              <button className="btn" type="submit">Go</button>
            </form>
          </div>
          <MapView tiles={tiles} bin={bin} nMonths={meta.nMonths} geo={geo} regions={regions} month={month} mode={mode}
            selection={selection} recent={recent} drawing={drawing}
            onDrawn={(b) => { setDrawing(false); setSelection({ type: "box", bbox: b }); }}
            onRegion={(id) => { if (regions.some((r) => r.id === id)) setSelection({ type: "region", id }); }} />
          <div className="map-foot">
            {mode === "activity" && <>
              <button className="btn play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play through time"}>{playing ? "❚❚" : "▶"}</button>
              <div className="slider">
                <label htmlFor="month">{monthLabel(month)}{month === lastMi ? " · in progress" : ""}</label>
                <input id="month" type="range" min={0} max={lastMi} value={month} onChange={(e) => { setPlaying(false); setMonth(+e.target.value); }} />
              </div>
              <div className="key"><span>Active cell-days per tile</span>
                <div className="swatches">{FIRE_STOPS.slice(1).map((c) => <i key={c} style={{ background: c }} />)}</div>
                <div className="key-ax"><span>1</span><span>20</span><span>400+</span></div></div>
            </>}
            {mode === "anomaly" && <>
              <p className="foot-note">Harmonized activity in the last {win.days} days ({win.start} to {win.end}) against the median of the same {win.days} days in {meta.baseYear}–{+win.end.slice(0, 4) - 1}.</p>
              <div className="key"><span>Compared with the median</span>
                <div className="swatches">{[-3, -1.5, 0, 1.5, 3].map((r) => <i key={r} style={{ background: diverge(r) }} />)}</div>
                <div className="key-ax"><span>⅛×</span><span>normal</span><span>8×</span></div></div>
            </>}
            {mode === "hotspots" && <>
              <p className="foot-note">{recent ? `${fmtFull(recent.lat.length)} near-real-time detections since ${recent.since}` : "Loading hotspots…"}, static heat sources and low-confidence detections removed.</p>
              <div className="key"><span>Fire radiative power (MW)</span>
                <div className="swatches">{FIRE_STOPS.slice(2).map((c) => <i key={c} style={{ background: c }} />)}</div>
                <div className="key-ax"><span>0</span><span>15</span><span>150+</span></div></div>
            </>}
          </div>
        </div>

        <aside className="panel">
          <div className="panel-head">
            <div>
              <h1>{title}</h1>
              <p className="sub">{sub}</p>
            </div>
            <select aria-label="Choose a region" value={selection.type === "region" ? selection.id : ""}
              onChange={(e) => e.target.value && setSelection({ type: "region", id: e.target.value })}>
              {selection.type === "box" && <option value="">Custom area</option>}
              <option value="ALL">All four countries</option>
              {Object.entries(COUNTRY).map(([c, n]) => (
                <optgroup key={c} label={n}>
                  <option value={c}>{n} (whole country)</option>
                  {regions.filter((r) => r.level === "rid" && r.country === c).sort((a, b) => a.name.localeCompare(b.name))
                    .map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </optgroup>))}
            </select>
          </div>

          {!series || !summary ? <div className="skeleton">Loading…</div> : <>
            <div className="kpis">
              {region && st ? (
                <div className={`kpi wide ${st.key}`}>
                  <span className="k">Last {win.days} days · {winLabel}</span>
                  <b>{fmtFull(region.cur)}<small> cell-days</small></b>
                  <span className={`badge ${st.key}`}>{st.icon} {st.label}</span>
                  <span className="k">{region.med > 0 ? `${(region.cur / region.med).toFixed(1)}× the median for these dates (${fmtFull(region.med)})` : "No burning in a typical year"} · higher than {Math.round(region.pct * 100)}% of years</span>
                </div>
              ) : (
                <div className="kpi wide">
                  <span className="k">{monthLabel(summary.prev)} · last full month</span>
                  <b>{fmtFull(summary.prevV)}<small> cell-days</small></b>
                  <span className="k">{summary.prevMed > 0 ? `${(summary.prevV / summary.prevMed).toFixed(1)}× the ${MONTHS_LONG[miMonth(summary.prev)]} median (${fmtFull(summary.prevMed)})` : "No burning in a typical year"}</span>
                </div>
              )}
              <div className="kpi"><span className="k">Peak month</span><b>{MONTHS_LONG[summary.peak]}</b><span className="k">{Math.round(summary.share * 100)}% of a typical year</span></div>
              <div className="kpi"><span className="k">Biggest year</span><b>{summary.best}</b><span className="k">{fmt(summary.bestV)} cell-days</span></div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Burning activity calendar</h2>
                <div className="seg small">
                  <button className={!relative ? "on" : ""} onClick={() => setRelative(false)}>Activity</button>
                  <button className={relative ? "on" : ""} onClick={() => setRelative(true)}>vs median</button>
                </div>
              </div>
              <div className="range">
                <label>From <select value={range[0]} onChange={(e) => setRange([+e.target.value, Math.max(+e.target.value, range[1])])}>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
                <label>to <select value={range[1]} onChange={(e) => setRange([Math.min(+e.target.value, range[0]), +e.target.value])}>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
                <span className="era"><i style={{ background: "#3987e5" }} />MODIS, calibrated<i style={{ background: "#199e70" }} />S-NPP<i style={{ background: "#9085e9" }} />NOAA-20, calibrated</span>
              </div>
              <Calendar series={series} lastMi={lastMi} yearFrom={range[0]} yearTo={range[1]} picked={month} relative={relative} svgRef={svgRef}
                onPick={(mi) => { setMonth(mi); setMode("activity"); setPlaying(false); }}
                eras={{ aqua: 2002, snpp: 2012, snppEnd: +meta.handover.slice(0, 4) - 1 }} />
              <div className="actions">
                <button className="btn" onClick={csvMonthly}>Download monthly CSV</button>
                <button className="btn" onClick={csvHotspots}>Download hotspots CSV</button>
                <button className="btn" onClick={svgDownload}>Save calendar image</button>
              </div>
            </div>

            <div className="card">
              <h2>Seasonal profile</h2>
              <p className="note">Typical year (median and middle half of years) against {miYear(lastMi)} so far.</p>
              <Seasonal series={series} lastMi={lastMi} />
            </div>

            {regionData && !loadingRegion && regionData.window && (
              <div className="card">
                <h2>These {win.days} days in every year</h2>
                <p className="note">The same dates ({winLabel}) in each year of the record. This is what the early warning compares against.</p>
                <WindowBars win={regionData.window} label={winLabel} />
              </div>)}

            {regionData && !loadingRegion && <>
              <div className="card">
                <h2>Daily burning calendar</h2>
                <p className="note">Each row is a year, each column a day. The burning season shows as a vertical band.</p>
                <DailyStrip data={regionData} epoch={meta.epoch} lastMi={lastMi} />
              </div>
              <div className="card">
                <h2>What harmonization changes</h2>
                <p className="note">Raw active cell-days per year from each sensor, and the single harmonized record. From 2012 to {+meta.handover.slice(0, 4) - 1} the harmonized line is S-NPP itself, so it covers the S-NPP line.</p>
                <SensorChart data={regionData} lastMi={lastMi} />
              </div>
            </>}
            {selection.type === "box" && <p className="note pad">A drawn area uses the 0.25° tile grid, so it has the monthly calendar. Pick a state or country for the daily calendar and the sensor comparison.</p>}
          </>}
        </aside>
      </main>

      <section className="alerts">
        <div className="alerts-head">
          <h2>Early warning · last {win.days} days</h2>
          <p>States ranked by how unusual {win.start} to {win.end} is against the same dates in {meta.baseYear}–{+win.end.slice(0, 4) - 1}.</p>
        </div>
        <div className="alert-row">
          {alertList.map((r) => { const s = status(r.pct, r.cur); return (
            <button key={r.id} className={`alert ${s.key}`} onClick={() => { setSelection({ type: "region", id: r.id }); setMode("anomaly"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              <span className={`badge ${s.key}`}>{s.icon} {s.label}</span>
              <b>{r.name}</b><span className="k">{COUNTRY[r.country!]}</span>
              <span className="big">{r.med > 0 ? `${(r.cur / r.med).toFixed(1)}×` : "new"}</span>
              <span className="k">{fmtFull(r.cur)} cell-days · median {fmtFull(r.med)}</span>
            </button>); })}
        </div>
      </section>

      <section id="method" className="method">
        <h2>How the harmonization works</h2>
        <div className="steps">
          <div><b>1 · One schema</b><p>Every MODIS (Terra, Aqua) and VIIRS (S-NPP, NOAA-20, NOAA-21) detection from NASA FIRMS is read into one table. Presumed vegetation fires are kept; low-confidence detections and static heat sources are dropped.</p></div>
          <div><b>2 · Active cell-days</b><p>Detections are snapped to a fixed 0.05° grid. The unit is the active cell-day: a cell with at least one detection on a day. It removes duplicates across satellites and is far less sensitive to pixel size than raw counts.</p></div>
          <div><b>3 · One scale</b><p>S-NPP is the reference. For each state and calendar month, the overlap years give a factor that converts MODIS and NOAA-20 cell-days to the S-NPP scale. Small samples are pulled toward the country and all-area values.</p></div>
          <div><b>4 · One record</b><p>Terra alone covers {meta.epoch.slice(0, 4)}–2002, Terra and Aqua cover 2002–2012, S-NPP covers 2012–{+meta.handover.slice(0, 4) - 1}, and NOAA-20 carries the record from {meta.handover.slice(0, 4)} because the S-NPP feed stops on {meta.snppEnd}. All are on the same scale.</p></div>
        </div>
        <div className="valid">
          <img src="/validation.png" alt="Validation: raw and calibrated MODIS against S-NPP for held-out years, and the yearly harmonized index" />
          <div className="valid-text">
            <h3>Does it work?</h3>
            <p>Factors were fitted on even years and tested on odd years, and the reverse, for 2012–2025. Each point is one state in one year.</p>
            <table>
              <thead><tr><th>MODIS estimate of S-NPP</th><th>Median error</th><th>Total ratio</th></tr></thead>
              <tbody>
                <tr><td>Raw MODIS</td><td>{val.raw_modis.median_abs_pct_err}%</td><td>{val.raw_modis.total_ratio}</td></tr>
                <tr><td>One factor for everywhere</td><td>{val.single_global_factor.median_abs_pct_err}%</td><td>{val.single_global_factor.total_ratio}</td></tr>
                <tr className="hl"><td>State and month factors</td><td>{val.calibrated.median_abs_pct_err}%</td><td>{val.calibrated.total_ratio}</td></tr>
              </tbody>
            </table>
            <p className="note">Limits: MODIS misses small fires that VIIRS sees, so a factor restores the average, not individual fires. Years before 2012 are less certain than later ones, and {meta.epoch.slice(0, 4)}–2002 (Terra alone) least of all, so medians use {meta.baseYear} onward. NOAA-21 is shown in the latest hotspots but is not yet part of the index. The newest months use near-real-time data that is later reprocessed. State boundaries are from Natural Earth and are not authoritative.</p>
          </div>
        </div>
      </section>

      <footer id="data" className="foot">
        <p><b>Data.</b> NASA FIRMS active fire products: MODIS Collection 6.1 (MCD14DL/MCD14ML) and VIIRS 375 m (S-NPP, NOAA-20, NOAA-21), standard and near-real-time. Data to {meta.maxDate}. Boundaries: Natural Earth. Basemap: © CARTO, © OpenStreetMap contributors.</p>
        <p><b>Built for</b> the NASA Space Apps Challenge 2026, “Harmonization of MODIS and VIIRS Hot Spots”. Code and documentation were written with Claude (Anthropic) as an AI coding assistant. This is not a NASA product.</p>
      </footer>
    </>
  );
}
