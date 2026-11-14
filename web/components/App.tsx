"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Calendar, DailyStrip, HealthChart, Seasonal, SensorChart, WindowBars } from "./Charts";
import { Arrow, Down, Download, Draw, Level, Pause, Play, Up } from "./Icons";
import { NIGHT, type Mode } from "./MapView";
import {
  FIRE_STOPS, MONTHS_LONG, Recent, Region, RegionData, SERIES, Selection, Tiles, boxSeries, decodeTiles, diverge, download, fmt,
  fmtFull, miMonth, miYear, monthLabel, monthStats, toMi,
} from "@/lib/data";

const MapView = dynamic(() => import("./MapView"), { ssr: false });
const get = (p: string) => fetch(`/data/${p}`).then((r) => { if (!r.ok) throw new Error(p); return r; });

// Regions whose record month opens the stories list; only those present in the data are shown.
const STORIES: Record<string, string> = {
  AU_NSW: "Eucalypt forest on Australia's east coast, where a dry spring can end in a fire season far outside the usual range.",
  ID_KT: "Borneo peatland. In dry years, fires set to clear land spread underground and burn for weeks.",
  IN_PB: "Two burning seasons a year: wheat stubble in May, rice stubble in October and November.",
  MM_17: "Shifting cultivation in the Shan hills, packed into a few weeks of March.",
};

function status(pct: number, cur: number) {
  if (cur < 30) return { key: "quiet", label: "Quiet", Icon: Level };
  if (pct >= 0.9) return { key: "high", label: "Well above normal", Icon: Up };
  if (pct >= 0.75) return { key: "elev", label: "Above normal", Icon: Up };
  if (pct <= 0.15) return { key: "low", label: "Below normal", Icon: Down };
  return { key: "norm", label: "Within normal range", Icon: Level };
}
const times = (cur: number, med: number) => (med > 0 ? `${(cur / med).toFixed(1)}×` : "new");

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
  const [three, setThree] = useState(false);
  const [stories, setStories] = useState<{ id: string; mi: number; v: number; ratio: number; first?: string | null; lead?: number | null }[]>([]);
  const [ba, setBa] = useState<any>(null);
  const cache = useRef(new Map<string, RegionData>());
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    Promise.all([get("meta.json").then((r) => r.json()), get("tiles.json").then((r) => r.json()),
      get("tiles.bin").then((r) => r.arrayBuffer()), get("regions.geojson").then((r) => r.json())])
      .then(([m, t, b, g]) => {
        setMeta(m); setTiles(t); setBin(decodeTiles(b, t.xy.length / 2, m.nMonths)); setGeo(g);
        setRange([2000, miYear(m.nMonths - 1)]);
        // The one piece of motion on the page: the map plays the whole record once on arrival.
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setMonth(m.nMonths - 1);
        else { setMonth(toMi(2001, 0)); setPlaying(true); }
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

  // optional: the burned-area comparison, present only if pipeline/validate_ba.py has been run
  useEffect(() => { fetch("/data/ba.json").then((r) => (r.ok ? r.json() : null)).then(setBa).catch(() => setBa(null)); }, []);

  // record month for each story region
  useEffect(() => {
    if (!meta) return;
    const ids = Object.keys(STORIES).filter((id) => meta.regions.some((r: Region) => r.id === id));
    Promise.all(ids.map((id) => get(`regions/${id}.json`).then((r) => r.json()))).then((ds: RegionData[]) => {
      setStories(ds.map((d) => {
        cache.current.set(d.id, d);
        const last = meta.nMonths - 1, st = monthStats(d.h, last);
        let mi = toMi(2003, 0);
        for (let i = mi; i < last; i++) if (d.h[i] > d.h[mi]) mi = i;
        return { id: d.id, mi, v: d.h[mi], ratio: d.h[mi] / Math.max(1, st[miMonth(mi)].med),
          first: d.record?.mi === mi ? d.record.first : null, lead: d.record?.mi === mi ? d.record.lead : null };
      }));
    }).catch((e) => setError(String(e)));
  }, [meta]);

  useEffect(() => {
    if (!playing || !meta) return;
    const last = meta.nMonths - 1;
    const t = setInterval(() => setMonth((m) => { if (m >= last) { setPlaying(false); return last; } return m + 1; }), 110);
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
    return { stats, peak, share, best, bestV, prev, prevV: series[prev], prevMed: stats[pm].med };
  }, [series, meta, lastMi]);

  if (error) return <div className="splash">Could not load the data ({error}). Reload the page to try again.</div>;
  if (!meta || !tiles || !bin || !geo) return <div className="splash">Loading the record…</div>;

  const COUNTRY: Record<string, string> = Object.fromEntries(meta.countries.map((c: { id: string; name: string }) => [c.id, c.name]));
  const names = Object.values(COUNTRY);
  const countryList = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const years = meta.stats.years - 1;
  const title = selection.type === "box" ? "Custom area" : region?.name ?? "";
  const sub = selection.type === "box"
    ? `${selection.bbox[1]}° to ${selection.bbox[3]}° N, ${selection.bbox[0]}° to ${selection.bbox[2]}° E · ${box!.count} grid tiles`
    : region?.level === "rid" ? COUNTRY[region.country!] : region?.level === "country" ? "Whole country" : countryList;
  const st = region ? status(region.pct, region.cur) : null;
  const win = meta.window, baseTo = +win.end.slice(0, 4) - 1;
  const winLabel = `${win.start.slice(5)} to ${win.end.slice(5)}`;
  const ranked = [...regions].filter((r) => r.level === "rid" && r.cur >= 30)
    .sort((a, b) => b.pct - a.pct || b.cur / Math.max(1, b.med) - a.cur / Math.max(1, a.med)).slice(0, 12);
  const val = meta.validation.modis_region_year;
  const bt = meta.backtest, fd = meta.findings, health = meta.health;
  const clear = (t: { p: number } | null | undefined) => !!t && t.p < 0.05;
  const signed = (v: number, unit: string) => `${v > 0 ? "+" : "−"}${Math.abs(v)}${unit}`;
  const stateRows = regions.filter((r) => r.level === "rid");
  const movers = [...stateRows].filter((r) => clear(r.trend)).sort((a, b) => a.trend!.pct - b.trend!.pct);
  const trendRows = [...movers.slice(0, 4), ...movers.slice(-4).reverse()];
  const shiftRows = [...stateRows].filter((r) => clear(r.shift)).sort((a, b) => Math.abs(b.shift!.days) - Math.abs(a.shift!.days)).slice(0, 6);
  const alarmText = (a: { from: string; to: string; low: number; high: number }) =>
    `${a.from === a.to ? a.from : `${a.from} to ${a.to}`} (index ${a.low < 1 ? a.low : a.high})`;
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  const fmtDate = (d: string) => `${+d.slice(8)} ${MONTHS_LONG[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
  const stop = () => setPlaying(false);
  const open = (id: string, m: Mode, mi?: number) => {
    stop(); setSelection({ type: "region", id }); setMode(m);
    if (mi != null) setMonth(mi);
    document.getElementById("selection")?.scrollIntoView({ block: "start" });
  };
  const slug = title.replace(/\W+/g, "_");

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
    download(`burncalendar_${slug}_${range[0]}-${range[1]}.csv`, rows.join("\n"));
  };
  const csvHotspots = async () => {
    const r = await loadRecent();
    const since = Date.parse(r.since + "T00:00:00Z");
    const rows = ["latitude,longitude,acq_date,acq_time_utc,sensor,confidence,frp_mw,daynight,region"];
    for (let i = 0; i < r.lat.length; i++) {
      const ok = selection.type === "box"
        ? r.lon[i] >= selection.bbox[0] && r.lon[i] <= selection.bbox[2] && r.lat[i] >= selection.bbox[1] && r.lat[i] <= selection.bbox[3]
        : region?.level === "all" || (region?.level === "country" ? r.rids[r.rid[i]].startsWith(region.id) : r.rids[r.rid[i]] === region?.id);
      if (ok) rows.push([r.lat[i], r.lon[i], new Date(since + r.day[i] * 864e5).toISOString().slice(0, 10), String(r.time[i]).padStart(4, "0"),
        r.sensors[r.sensor[i]], r.high[i] ? "high" : "nominal", r.frp[i], r.night[i] ? "N" : "D", r.rids[r.rid[i]]].join(","));
    }
    download(`burncalendar_hotspots_${slug}_since_${r.since}.csv`, rows.join("\n"));
  };
  const svgDownload = () => {
    if (!svgRef.current) return;
    const s = svgRef.current.cloneNode(true) as SVGSVGElement;
    s.setAttribute("style", "background:#fbf8f1;font-family:monospace;font-size:10px");
    s.querySelectorAll("text").forEach((t) => t.setAttribute("fill", "#5e574c"));
    s.querySelectorAll(".cell-na").forEach((t) => t.setAttribute("fill", "#f1ebdd"));
    s.querySelectorAll(".bar-muted").forEach((t) => t.setAttribute("fill", "#b9b0a0"));
    download(`burncalendar_${slug}.svg`, new XMLSerializer().serializeToString(s), "image/svg+xml");
  };
  const applyCoords = () => {
    const v = coords.split(/[,\s]+/).map(Number).filter((x) => !Number.isNaN(x));
    stop();
    if (v.length === 2) setSelection({ type: "box", bbox: [v[1] - 0.5, v[0] - 0.5, v[1] + 0.5, v[0] + 0.5].map((x) => Math.round(x * 100) / 100) as any });
    else if (v.length === 4) setSelection({ type: "box", bbox: [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])] });
  };
  const yearList = Array.from({ length: miYear(lastMi) - 2000 + 1 }, (_, i) => 2000 + i);
  const eras = [
    { name: "Terra", from: meta.epoch, to: meta.aquaStart, color: SERIES.modis, note: "MODIS, one satellite. Scaled in two steps." },
    { name: "Terra + Aqua", from: meta.aquaStart, to: meta.snppStart, color: SERIES.modis, note: "MODIS, both satellites. Scaled to S-NPP per state and month." },
    { name: "S-NPP", from: meta.snppStart, to: meta.handover, color: SERIES.snpp, note: "VIIRS. The reference scale, used as it is." },
    { name: "NOAA-20", from: meta.handover, to: meta.maxDate, color: SERIES.n20, note: "VIIRS. Scaled to S-NPP per state and month." },
  ].map((e) => ({ ...e, days: (Date.parse(e.to) - Date.parse(e.from)) / 864e5 }));

  return (
    <>
      <main className="atlas">
        <div className="map-col">
          <div className="toolbar">
            <div className="seg" role="tablist" aria-label="Map layer">
              {([["activity", "Monthly activity"], ["anomaly", "Early warning"], ["hotspots", "Latest hotspots"]] as [Mode, string][]).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => { stop(); setMode(k); }}>{l}</button>))}
            </div>
            <button className={drawing ? "btn on" : "btn"} onClick={() => { stop(); setDrawing((d) => !d); }}><Draw />{drawing ? "Drag on the map" : "Draw an area"}</button>
            <button className={three ? "btn on" : "btn"} aria-pressed={three} onClick={() => setThree((v) => !v)}>3D</button>
            <form className="coords" onSubmit={(e) => { e.preventDefault(); applyCoords(); }}>
              <input value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="lat, lon  or  W, S, E, N" aria-label="Coordinates" />
              <button className="btn" type="submit">Go</button>
            </form>
          </div>
          <MapView three={three} bounds={regions.find((r) => r.id === "ALL")?.bbox} tiles={tiles} bin={bin} nMonths={meta.nMonths} geo={geo}
            regions={regions} month={month} mode={mode} selection={selection} recent={recent} drawing={drawing}
            onDrawn={(b) => { setDrawing(false); setSelection({ type: "box", bbox: b }); }}
            onRegion={(id) => { if (regions.some((r) => r.id === id)) { stop(); setSelection({ type: "region", id }); } }} />
          <div className="map-foot">
            {mode === "activity" && <>
              <button className="btn icon" onClick={() => { if (!playing && month >= lastMi) setMonth(toMi(2001, 0)); setPlaying((p) => !p); }}
                aria-label={playing ? "Pause" : "Play through the record"}>{playing ? <Pause /> : <Play />}</button>
              <div className="slider">
                <label htmlFor="month" className="readout">{monthLabel(month)}{month === lastMi ? <small> in progress</small> : null}</label>
                <input id="month" type="range" min={0} max={lastMi} value={month} onChange={(e) => { stop(); setMonth(+e.target.value); }} />
              </div>
              <div className="key"><span>Active cell-days per tile</span>
                <div className="swatches">{(three ? NIGHT : FIRE_STOPS.slice(1)).map((c) => <i key={c} style={{ background: c }} />)}</div>
                <div className="key-ax"><span>1</span><span>20</span><span>400+</span></div></div>
            </>}
            {mode === "anomaly" && <>
              <p className="foot-note">The last {win.days} days ({win.start} to {win.end}) against the median of the same dates in {meta.baseYear}–{baseTo}.</p>
              <div className="key"><span>Compared with the median</span>
                <div className="swatches">{[-3, -1.5, 0, 1.5, 3].map((r) => <i key={r} style={{ background: diverge(r) }} />)}</div>
                <div className="key-ax"><span>⅛×</span><span>normal</span><span>8×</span></div></div>
            </>}
            {mode === "hotspots" && <>
              <p className="foot-note">{recent ? `${fmtFull(recent.lat.length)} near-real-time detections since ${recent.since}.` : "Loading hotspots…"} Static heat sources and low-confidence detections are removed.</p>
              <div className="key"><span>Fire radiative power (MW)</span>
                <div className="swatches">{(three ? NIGHT.slice(1) : FIRE_STOPS.slice(2)).map((c) => <i key={c} style={{ background: c }} />)}</div>
                <div className="key-ax"><span>0</span><span>15</span><span>150+</span></div></div>
            </>}
          </div>
        </div>

        <div className="text-col">
          <header className="nav">
            <a className="brand" href="#top">BurnCalendar</a>
            <nav><a href="#findings">Findings</a><a href="#warning">Early warning</a><a href="#method">Method</a></nav>
          </header>

          <section id="top" className="intro">
            <h1>{years} years of fire in one continuous record</h1>
            <p>
              Satellites have mapped fires since 2000, but the older MODIS sensors and the newer VIIRS sensors do not agree: VIIRS
              sees about {Math.round(meta.validation.viirs_per_modis_all_area)} times as much burning. BurnCalendar puts both on one scale for {countryList}.
            </p>
            <p>
              Tested on years it was not fitted to, the corrected MODIS record lands within {val.calibrated.median_abs_pct_err}% of VIIRS.
              Uncorrected, it is off by {val.raw_modis.median_abs_pct_err}%.
            </p>
          </section>

          <section id="selection" className="selection">
            <div className="panel-head">
              <div>
                <h2 className="place">{title}</h2>
                <p className="sub">{sub}</p>
              </div>
              <select aria-label="Choose a region" value={selection.type === "region" ? selection.id : ""}
                onChange={(e) => { if (e.target.value) { stop(); setSelection({ type: "region", id: e.target.value }); } }}>
                {selection.type === "box" && <option value="">Custom area</option>}
                <option value="ALL">All countries</option>
                {Object.entries(COUNTRY).map(([c, n]) => (
                  <optgroup key={c} label={n}>
                    <option value={c}>{n} (whole country)</option>
                    {regions.filter((r) => r.level === "rid" && r.country === c).sort((a, b) => a.name.localeCompare(b.name))
                      .map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </optgroup>))}
              </select>
            </div>

            {!series || !summary ? <p className="note">Loading this area…</p> : <>
              {region && st ? (
                <div className="now">
                  <p className="now-n">{fmtFull(region.cur)}</p>
                  <p className="now-t">
                    active cell-days in the last {win.days} days ({winLabel}).{" "}
                    {region.med > 0 ? <>That is <b>{times(region.cur, region.med)} the median</b> for these dates ({fmtFull(region.med)}), higher than {Math.round(region.pct * 100)}% of years since {meta.baseYear}.</>
                      : "There is normally no burning on these dates."}
                  </p>
                  <span className={`badge ${st.key}`}><st.Icon />{st.label}</span>
                </div>
              ) : (
                <div className="now">
                  <p className="now-n">{fmtFull(summary.prevV)}</p>
                  <p className="now-t">
                    active cell-days in {monthLabel(summary.prev)}, the last full month.{" "}
                    {summary.prevMed > 0 ? <>That is <b>{times(summary.prevV, summary.prevMed)} the {MONTHS_LONG[miMonth(summary.prev)]} median</b> ({fmtFull(summary.prevMed)}).</> : "There is normally no burning in this month."}
                  </p>
                </div>
              )}
              <dl className="facts">
                <div><dt>Peak month</dt><dd>{MONTHS_LONG[summary.peak]}, {Math.round(summary.share * 100)}% of a typical year</dd></div>
                <div><dt>Biggest year</dt><dd>{summary.best}, {fmt(summary.bestV)} cell-days</dd></div>
                {region?.trend && <div><dt>Trend {fd.years[0]}–{fd.years[1]}</dt><dd>{signed(region.trend.pct, "% per decade")}{clear(region.trend) ? "" : ", not a clear trend"}</dd></div>}
                {region?.shift && <div><dt>{MONTHS_LONG[region.shift.peak - 1]} season timing</dt><dd>{clear(region.shift) ? `${Math.abs(region.shift.days)} days ${region.shift.days > 0 ? "later" : "earlier"} per decade` : "no clear shift"}</dd></div>}
              </dl>

              <div className="block">
                <div className="block-head">
                  <h3>Burning activity calendar</h3>
                  <div className="seg small">
                    <button className={!relative ? "on" : ""} onClick={() => setRelative(false)}>Activity</button>
                    <button className={relative ? "on" : ""} onClick={() => setRelative(true)}>Against median</button>
                  </div>
                </div>
                <div className="range">
                  <label>From <select value={range[0]} onChange={(e) => setRange([+e.target.value, Math.max(+e.target.value, range[1])])}>{yearList.map((y) => <option key={y}>{y}</option>)}</select></label>
                  <label>to <select value={range[1]} onChange={(e) => setRange([Math.min(+e.target.value, range[0]), +e.target.value])}>{yearList.map((y) => <option key={y}>{y}</option>)}</select></label>
                  <span className="era"><i style={{ background: SERIES.modis }} />MODIS, scaled<i style={{ background: SERIES.snpp }} />S-NPP<i style={{ background: SERIES.n20 }} />NOAA-20, scaled</span>
                </div>
                <Calendar series={series} lastMi={lastMi} yearFrom={range[0]} yearTo={range[1]} picked={month} relative={relative} svgRef={svgRef}
                  onPick={(mi) => { stop(); setMonth(mi); setMode("activity"); }}
                  eras={{ aqua: 2002, snpp: 2012, snppEnd: +meta.handover.slice(0, 4) - 1 }}
                  band={selection.type === "region" && regionData && !loadingRegion ? regionData.band : null}
                  filled={health.filled.map((m: string) => toMi(+m.slice(0, 4), +m.slice(5) - 1))} />
                <p className="note">Years marked MODIS or NOAA-20 are estimates on the S-NPP scale. Hover a month for its likely range.</p>
                <div className="actions">
                  <button className="btn" onClick={csvMonthly}><Download />Monthly CSV</button>
                  <button className="btn" onClick={csvHotspots}><Download />Hotspots CSV</button>
                  <button className="btn" onClick={svgDownload}><Download />Calendar image</button>
                </div>
              </div>

              <div className="block">
                <h3>Seasonal profile</h3>
                <p className="note">A typical year (median, and the middle half of years) against {miYear(lastMi)} so far.</p>
                <Seasonal series={series} lastMi={lastMi} />
              </div>

              {regionData && !loadingRegion && regionData.window && (
                <div className="block">
                  <h3>These {win.days} days in every year</h3>
                  <p className="note">The same dates ({winLabel}) in each year of the record. The early warning compares against these.</p>
                  <WindowBars win={regionData.window} label={winLabel} />
                </div>)}

              {regionData && !loadingRegion && <>
                <div className="block">
                  <h3>Daily burning calendar</h3>
                  <p className="note">Each row is a year and each column a day. The burning season shows as a vertical band.</p>
                  <DailyStrip data={regionData} epoch={meta.epoch} lastMi={lastMi} />
                </div>
                <div className="block">
                  <h3>What harmonization changes</h3>
                  <p className="note">Raw active cell-days per year from each sensor, and the single harmonized record. Before 2012 the harmonized line is an estimate: the shaded band is where 8 in 10 held-out years fell. From 2012 to {+meta.handover.slice(0, 4) - 1} it is S-NPP itself, so it covers the S-NPP line.</p>
                  <SensorChart data={regionData} lastMi={lastMi} />
                </div>
              </>}
              {selection.type === "box" && <p className="note">A drawn area uses the 0.25° tile grid, so it has the monthly calendar. Pick a state or country for the daily calendar and the sensor comparison.</p>}
            </>}
          </section>

          <section id="findings" className="stories">
            <h2>What the record shows once it is on one scale</h2>
            <p className="lede">
              Join the raw MODIS and VIIRS records end to end and fire appears to rise in <b>{fd.naive.rising} of {fd.states}</b> states over {fd.years[0]}–{fd.years[1]}.
              On one scale it rises in <b>{fd.harmonized.rising}</b>, falls in <b>{fd.harmonized.falling}</b> and shows no clear trend in {fd.harmonized.flat}.
              In {fd.false_rise} states the apparent rise was the change of sensor, not more fire.
            </p>
            <table className="rows">
              <thead><tr><th>Clearest trends</th><th className="num">Harmonized, per decade</th><th className="num">Raw splice, per decade</th></tr></thead>
              <tbody>
                {trendRows.map((r) => (
                  <tr key={r.id} onClick={() => open(r.id, "activity")}>
                    <td><button onClick={(e) => { e.stopPropagation(); open(r.id, "activity"); }}>{r.name}</button><span className="k">{COUNTRY[r.country!]}</span></td>
                    <td className="num">{signed(r.trend!.pct, "%")}</td><td className="num">{r.naive ? signed(r.naive.pct, "%") : ""}</td>
                  </tr>))}
              </tbody>
            </table>
            <p className="lede">
              The main burning season has moved <b>later in {fd.later} states</b> and earlier in {fd.earlier}, out of {fd.shift_states} with enough fire to tell.
            </p>
            <table className="rows">
              <thead><tr><th>Biggest shifts in timing</th><th>Season</th><th className="num">Per decade</th><th className="num">Since {fd.years[0]}–{fd.years[0] + 4}</th></tr></thead>
              <tbody>
                {shiftRows.map((r) => { const d = Math.round(r.shift!.last - r.shift!.first); return (
                  <tr key={r.id} onClick={() => open(r.id, "activity")}>
                    <td><button onClick={(e) => { e.stopPropagation(); open(r.id, "activity"); }}>{r.name}</button><span className="k">{COUNTRY[r.country!]}</span></td>
                    <td>{MONTHS_LONG[r.shift!.peak - 1]}</td><td className="num">{signed(r.shift!.days, " days")}</td>
                    <td className="num">{Math.abs(d)} days {d > 0 ? "later" : "earlier"}</td>
                  </tr>); })}
              </tbody>
            </table>
            <p className="note">Trends are Theil–Sen slopes with a Mann–Kendall test at 5%, relative to each state's average year. Values before 2012 are estimates, so a trend that crosses 2012 carries that uncertainty. With {fd.states} tests at 5%, about five would pass by chance. The raw splice is shown to illustrate the problem, not as a method anyone should use. Timing is the activity-weighted centre of the five months around each state's peak month.</p>
          </section>

          {stories.length > 0 && (
            <section id="stories" className="stories">
              <h2>The biggest month on record, in {stories.length} fire regimes</h2>
              <ul>
                {stories.map((s) => { const r = regions.find((x) => x.id === s.id)!; return (
                  <li key={s.id}>
                    <button onClick={() => open(s.id, "activity", s.mi)}>
                      <span className="story-place">{r.name}, {COUNTRY[r.country!]}</span>
                      <span className="story-fact"><b>{monthLabel(s.mi)}</b> · {s.ratio.toFixed(1)}× the usual {MONTHS_LONG[miMonth(s.mi)]} · {fmtFull(s.v)} cell-days</span>
                      <span className="story-text">{STORIES[s.id]}</span>
                      {s.first && s.lead != null && <span className="story-text">The early-warning rule, replayed on that year, first fired on {fmtDate(s.first)}: {s.lead} days before the peak.</span>}
                      <span className="go">Show on the map <Arrow /></span>
                    </button>
                  </li>); })}
              </ul>
            </section>)}

          <section id="warning" className="warning">
            <h2>Where the last {win.days} days are most unusual</h2>
            <p className="note">States ranked against the same dates ({win.start} to {win.end}) in {meta.baseYear}–{baseTo}. This rests on near-real-time data that NASA later reprocesses.</p>
            <div className="skill">
              <h3>How often is this warning right?</h3>
              <p>
                We replayed the rule on every week of {bt.years[0]}–{bt.years[1]} in all {bt.regions} states, never letting a year set its own threshold.
                When a state was flagged <b>well above normal</b>, the following {win.days} days were severe <b>{pc(bt.all[0].right)} of the time</b>,
                against {pc(bt.all[0].base)} for an ordinary week: {bt.all[0].lift} times better than chance. It caught {pc(bt.all[0].caught)} of severe periods.
                The lower <b>above normal</b> level caught {pc(bt.watch.caught)}, and was right {pc(bt.watch.right)} of the time.
              </p>
              <table>
                <thead><tr><th>Severe period starts</th><th className="num">Flag was right</th><th className="num">Severe periods caught</th><th className="num">Against chance</th></tr></thead>
                <tbody>
                  {[["0", "the next day"], ["14", "2 weeks later"], ["28", "4 weeks later"]].map(([k, l]) => (
                    <tr key={k}><td>{l}</td><td className="num">{pc(bt.all[k].right)}</td><td className="num">{pc(bt.all[k].caught)}</td><td className="num">{bt.all[k].lift}×</td></tr>))}
                </tbody>
              </table>
              <p className="note">Severe means at or above the 90th percentile for those dates. This is a persistence signal, not a weather forecast: it says burning that is already unusual tends to stay unusual, and it misses about two severe periods in three. Thresholds use the other years, including later ones, so this is not a true real-time test, and neighbouring weeks overlap, so there are far fewer independent cases than weeks.</p>
            </div>
            <table>
              <thead><tr><th>State</th><th className="num">Last {win.days} days</th><th className="num">Median</th><th className="num">Ratio</th><th>Status</th></tr></thead>
              <tbody>
                {ranked.map((r) => { const s = status(r.pct, r.cur); return (
                  <tr key={r.id} onClick={() => open(r.id, "anomaly")}>
                    <td><button onClick={(e) => { e.stopPropagation(); open(r.id, "anomaly"); }}>{r.name}</button><span className="k">{COUNTRY[r.country!]}</span></td>
                    <td className="num">{fmtFull(r.cur)}</td><td className="num">{fmtFull(r.med)}</td><td className="num">{times(r.cur, r.med)}</td>
                    <td><span className={`badge ${s.key}`}><s.Icon />{s.label}</span></td>
                  </tr>); })}
              </tbody>
            </table>
          </section>
        </div>
      </main>

      <section id="method" className="method">
        <h2>How two sensor records become one</h2>
        <div className="method-grid">
          <ol className="steps">
            <li><b>One table.</b> Every MODIS (Terra, Aqua) and VIIRS (S-NPP, NOAA-20) detection from NASA FIRMS is read into one table. Presumed vegetation fires are kept. Low-confidence detections and static heat sources are dropped.</li>
            <li><b>Active cell-days.</b> Detections are snapped to a fixed 0.05° grid. A cell with at least one detection on a day counts once. This removes duplicates across satellites and is far less sensitive to pixel size than raw counts.</li>
            <li><b>One scale.</b> S-NPP is the reference. For each state and calendar month, the years where sensors overlap give a factor that converts the other sensor to the S-NPP scale. Small samples are pulled toward the country value.</li>
            <li><b>One record.</b> Each period uses the best sensor flying at the time, all on the same scale.</li>
          </ol>
          <div>
            <div className="eras" role="img" aria-label="Which sensor supplies each period of the record">
              {eras.map((e) => <i key={e.name} style={{ flexGrow: e.days, background: e.color }} />)}
            </div>
            <ul className="era-list">
              {eras.map((e) => <li key={e.name}><i style={{ background: e.color }} /><b>{e.name}</b><span>{e.from.slice(0, 7)} to {e.to.slice(0, 7)}</span><span>{e.note}</span></li>)}
            </ul>
          </div>
        </div>

        <h3 className="method-h">Do the sensors still agree?</h3>
        <div className="valid">
          <HealthChart health={health} />
          <div>
            <p>Each month we compare what one sensor saw with what the other predicts for it after calibration. A value of 1.0 means they agree as they did in the fit years. The shaded band is {health.band[0]} to {health.band[1]}; a month outside it is flagged.</p>
            <p className="note">
              MODIS against VIIRS: {health.alarms.modis.length ? health.alarms.modis.map(alarmText).join(", ") : "no month flagged"}.<br />
              S-NPP against NOAA-20: {health.alarms.snpp.length ? health.alarms.snpp.map(alarmText).join(", ") : "no month flagged"}.
            </p>
            <p className="note">The record acts on this. {health.filled.length ? `S-NPP was the low one in ${health.filled.join(", ")}, so ${health.filled.length > 1 ? "those months are" : "that month is"} filled from calibrated NOAA-20.` : "No S-NPP month needed filling."} S-NPP stops on {meta.snppEnd}, so the record uses NOAA-20 from {meta.handover.slice(0, 4)}.</p>
          </div>
        </div>

        <h3 className="method-h">Does it work?</h3>
        <div className="valid">
          <img src="/validation.png" alt="Raw and calibrated MODIS against S-NPP for held-out years, and the yearly harmonized index" />
          <div>
            <p>Factors were fitted on even years and tested on odd years, and the reverse, for 2012–2025. Each point is one state in one year.</p>
            <table>
              <thead><tr><th>MODIS estimate of S-NPP</th><th className="num">Median error</th><th className="num">Total ratio</th></tr></thead>
              <tbody>
                <tr><td>Raw MODIS</td><td className="num">{val.raw_modis.median_abs_pct_err}%</td><td className="num">{val.raw_modis.total_ratio}</td></tr>
                <tr><td>One factor for everywhere</td><td className="num">{val.single_global_factor.median_abs_pct_err}%</td><td className="num">{val.single_global_factor.total_ratio}</td></tr>
                <tr className="hl"><td>State and month factors</td><td className="num">{val.calibrated.median_abs_pct_err}%</td><td className="num">{val.calibrated.total_ratio}</td></tr>
              </tbody>
            </table>
            <p className="note">Limits: the method assumes the relationship between MODIS and VIIRS seen in 2012–2025 also held before 2012. Nothing can test that directly, and the likely ranges only reflect 2012–2025, so they are probably too narrow for early years. MODIS misses small fires that VIIRS sees, so a factor restores the average, not individual fires. Years before 2012 are less certain than later ones, and {meta.epoch.slice(0, 4)}–2002 (Terra alone) least of all, so medians use {meta.baseYear} onward. NOAA-21 is shown in the latest hotspots but is not yet part of the record. The newest months use near-real-time data. State boundaries are from Natural Earth and are not authoritative.</p>
          </div>
        </div>
      </section>

      {ba && (
        <section className="method second">
          <h3 className="method-h">A consistency check against burned area</h3>
          <div className="valid">
            <img src="/burned_area.png" alt="Harmonized record, raw splice and GFED5 burned area by year, and the step at 2012 per state" />
            <div>
              <p>
                GFED5 maps burn scars from MODIS for {ba.years[0]}–{ba.years[1]}, with no change of sensor in {ba.split}. Burned area per active cell-day
                should be the same before and after {ba.split}. A step would mean the factors were applied wrongly.
              </p>
              <table>
                <thead><tr><th>Step at {ba.split} across {ba.states} states (1 = none)</th><th className="num">Median</th><th className="num">Middle half</th></tr></thead>
                <tbody>
                  <tr className="hl"><td>Harmonized record</td><td className="num">{ba.step_harmonized[1].toFixed(2)}</td><td className="num">{ba.step_harmonized[0]} to {ba.step_harmonized[2]}</td></tr>
                  <tr><td>Raw MODIS on both sides</td><td className="num">{ba.step_modis_only[1].toFixed(2)}</td><td className="num">{ba.step_modis_only[0]} to {ba.step_modis_only[2]}</td></tr>
                  <tr><td>Raw MODIS, then raw S-NPP</td><td className="num">{ba.step_naive[1].toFixed(2)}</td><td className="num">{ba.step_naive[0]} to {ba.step_naive[2]}</td></tr>
                </tbody>
              </table>
              <p>
                <b>What this does not show.</b> Raw MODIS alone passes the same test, because the factors were fitted on the years after {ba.split} and cancel out.
                So this confirms the factors were applied correctly; it cannot confirm they hold for the years before VIIRS existed. The held-out test above is the evidence for the factors.
              </p>
              <p>One part is a real cross-sensor check: in {ba.split}–{ba.years[1]}, S-NPP&rsquo;s high and low years match burned area with a rank correlation of {ba.rank_corr_snpp_late.toFixed(2)}.</p>
              <p className="note">GFED5 also uses MODIS active fires for its small-fire correction. Source: Chen et al. 2023, Zenodo 10.5281/zenodo.7668423, CC BY 4.0.</p>
            </div>
          </div>
        </section>)}

      <footer id="data" className="foot">
        <p><b>Data.</b> NASA FIRMS active fire products: MODIS Collection 6.1 (MCD14DL, MCD14ML) and VIIRS 375 m (S-NPP, NOAA-20, NOAA-21), standard and near-real-time, {fmt(meta.stats.detections_kept)} detections to {meta.maxDate}. Boundaries: Natural Earth. Basemap: © CARTO, © OpenStreetMap contributors. Burned-area check: GFED5 (Chen et al. 2023), CC BY 4.0.</p>
        <p><b>Open data.</b> <a href="/data/burncalendar_monthly.csv" download>Download the harmonized monthly record</a> for every state and country (CSV, 2.6 MB): the value, its likely range, the sensor behind it and the raw counts.</p>
        <p><b>Built for</b> the NASA Space Apps Challenge 2026, “Harmonization of MODIS and VIIRS Hot Spots”. Code and documentation were written with Claude (Anthropic) as an AI coding assistant. This is not a NASA product.</p>
      </footer>
    </>
  );
}
