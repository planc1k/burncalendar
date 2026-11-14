"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MONTHS, MONTHS_LONG, RegionData, SERIES, diverge, fire, fmt, fmtFull, miMonth, miYear, monthStats, toMi } from "@/lib/data";

type Tip = { x: number; y: number; lines: (string | [string, string])[] } | null;
function TipBox({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  return (
    <div className="tip" style={{ left: Math.max(0, Math.min(tip.x + 12, width - 230)), top: tip.y + 14 }}>
      {tip.lines.map((l, i) => typeof l === "string" ? (i === 0 ? <b key={i}>{l}</b> : <span key={i}>{l}</span>)
        : <span key={i} className="tip-row"><i style={{ background: l[0] }} />{l[1]}</span>)}
    </div>
  );
}
const at = (e: React.MouseEvent, host: HTMLElement | null) => {
  const r = host!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

/* ---------- burning activity calendar: month x year ---------- */
export function Calendar({ series, lastMi, yearFrom, yearTo, picked, onPick, relative, svgRef, eras }: {
  series: number[]; lastMi: number; yearFrom: number; yearTo: number; picked: number;
  onPick: (mi: number) => void; relative: boolean; svgRef: React.RefObject<SVGSVGElement | null>;
  eras: { aqua: number; snpp: number; snppEnd: number };
}) {
  const host = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const stats = useMemo(() => monthStats(series, lastMi), [series, lastMi]);
  const years = useMemo(() => Array.from({ length: yearTo - yearFrom + 1 }, (_, i) => yearFrom + i), [yearFrom, yearTo]);
  const max = useMemo(() => Math.max(1, ...series), [series]);
  const totals = years.map((y) => { let s = 0; for (let m = 0; m < 12; m++) s += series[toMi(y, m)] ?? 0; return s; });
  const maxTotal = Math.max(1, ...totals);
  const L = 44, CW = 27, CH = 17, G = 2, TOP = 18, BAR = 62;
  const W = L + 12 * CW + 10 + BAR, H = TOP + years.length * CH + 4;
  const eraColor = (y: number) => y < eras.snpp ? SERIES.modis : y <= eras.snppEnd ? SERIES.snpp : SERIES.n20;
  return (
    <div className="chart" ref={host} onMouseLeave={() => setTip(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" xmlns="http://www.w3.org/2000/svg"
        aria-label="Burning activity calendar: harmonized active cell-days by month and year">
        {MONTHS.map((m, i) => <text key={m} x={L + i * CW + CW / 2} y={11} className="ax" textAnchor="middle">{m[0]}</text>)}
        <text x={L + 12 * CW + 10} y={11} className="ax">year total</text>
        {years.map((y, r) => (
          <g key={y} transform={`translate(0,${TOP + r * CH})`}>
            <rect x={0} y={1} width={3} height={CH - G - 1} rx={1.5} fill={eraColor(y)} />
            <text x={L - 8} y={CH - 6} className="ax" textAnchor="end">{y}</text>
            {MONTHS.map((_, m) => {
              const mi = toMi(y, m);
              if (mi < 0 || mi > lastMi) return <rect key={m} x={L + m * CW} y={0} width={CW - G} height={CH - G} rx={2} className="cell-na" />;
              const v = series[mi] ?? 0, med = stats[m].med;
              const fill = relative ? diverge(Math.log2((v + 3) / (med + 3))) : fire(Math.sqrt(v / max));
              return <rect key={m} x={L + m * CW} y={0} width={CW - G} height={CH - G} rx={2} fill={fill}
                className={mi === picked ? "cell picked" : "cell"} onClick={() => onPick(mi)}
                onMouseMove={(e) => setTip({
                  ...at(e, host.current), lines: [`${MONTHS_LONG[m]} ${y}${mi === lastMi ? " (month in progress)" : ""}`,
                  `${fmtFull(v)} active cell-days`,
                  med > 0 ? `${(v / med).toFixed(1)}× the ${MONTHS_LONG[m]} median (${fmtFull(med)})` : "No burning in a typical year",
                    "Click to show this month on the map"],
                })} />;
            })}
            <rect x={L + 12 * CW + 10} y={3} width={Math.max(1, (totals[r] / maxTotal) * (BAR - 30))} height={CH - G - 6} rx={2} className="bar-muted" />
            <text x={L + 12 * CW + 14 + (totals[r] / maxTotal) * (BAR - 30)} y={CH - 6} className="ax">{fmt(totals[r])}</text>
          </g>
        ))}
      </svg>
      <TipBox tip={tip} width={host.current?.clientWidth ?? 400} />
    </div>
  );
}

/* ---------- seasonal profile ---------- */
export function Seasonal({ series, lastMi }: { series: number[]; lastMi: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const [hover, setHover] = useState<number | null>(null);
  const stats = useMemo(() => monthStats(series, lastMi), [series, lastMi]);
  const year = miYear(lastMi), lastMonth = miMonth(lastMi);
  const cur = MONTHS.map((_, m) => (m <= lastMonth ? series[toMi(year, m)] ?? 0 : null));
  const W = 440, H = 170, L = 40, R = 46, T = 10, B = 22;
  const max = Math.max(1, ...stats.map((s) => s.q75), ...cur.map((c) => c ?? 0)) * 1.08;
  const x = (m: number) => L + (m / 11) * (W - L - R), y = (v: number) => H - B - (v / max) * (H - T - B);
  const path = (v: (number | null)[]) => v.map((p, i) => (p == null ? "" : `${i && v[i - 1] != null ? "L" : "M"}${x(i)},${y(p)}`)).join("");
  const band = stats.map((s, i) => `${i ? "L" : "M"}${x(i)},${y(s.q75)}`).join("") +
    stats.map((_, i) => `L${x(11 - i)},${y(stats[11 - i].q25)}`).join("") + "Z";
  const ticks = [0, 0.5, 1].map((f) => f * max / 1.08);
  return (
    <div className="chart" ref={host} onMouseLeave={() => { setTip(null); setHover(null); }}
      onMouseMove={(e) => {
        const p = at(e, host.current), w = host.current!.clientWidth;
        const m = Math.max(0, Math.min(11, Math.round(((p.x / w) * W - L) / ((W - L - R) / 11))));
        setHover(m);
        setTip({ ...p, lines: [MONTHS_LONG[m], ["#8b90a0", `Median 2003–${year - 1}: ${fmtFull(stats[m].med)}`],
          `Middle half of years: ${fmtFull(stats[m].q25)}–${fmtFull(stats[m].q75)}`,
          ...(cur[m] != null ? [[SERIES.h, `${year}: ${fmtFull(cur[m]!)}${m === lastMonth ? " so far" : ""}`] as [string, string]] : [])] });
      }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Seasonal profile">
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
          <text x={L - 6} y={y(t) + 3} className="ax" textAnchor="end">{fmt(t)}</text></g>)}
        {MONTHS.map((m, i) => <text key={m} x={x(i)} y={H - 6} className="ax" textAnchor="middle">{m[0]}</text>)}
        <path d={band} className="band" />
        <path d={path(stats.map((s) => s.med))} className="line-muted" />
        <path d={path(cur)} fill="none" stroke={SERIES.h} strokeWidth={2} strokeLinejoin="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="cross" />}
        {hover != null && cur[hover] != null && <circle cx={x(hover)} cy={y(cur[hover]!)} r={4} fill={SERIES.h} className="ring" />}
        <text x={W - R + 6} y={y(stats[11].med) + 3} className="ax">median</text>
        <text x={x(lastMonth) + 6} y={Math.max(T + 8, y(cur[lastMonth] ?? 0) - 6)} className="lbl">{year}</text>
      </svg>
      <TipBox tip={tip} width={host.current?.clientWidth ?? 400} />
    </div>
  );
}

/* ---------- sensors vs harmonized, per year ---------- */
export function SensorChart({ data, lastMi }: { data: RegionData; lastMi: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const [hover, setHover] = useState<number | null>(null);
  const lastYear = miYear(lastMi) - 1;
  const years = Array.from({ length: lastYear - 2001 + 1 }, (_, i) => 2001 + i);
  const sum = (a: number[], yr: number) => { let s = 0; for (let m = 0; m < 12; m++) s += a[toMi(yr, m)] ?? 0; return s; };
  const rows = [
    { key: "modis", label: "MODIS, raw", color: SERIES.modis, from: 2001 },
    { key: "snpp", label: "S-NPP, raw", color: SERIES.snpp, from: 2012 },
    { key: "n20", label: "NOAA-20, raw", color: SERIES.n20, from: 2018 },
    { key: "h", label: "Harmonized", color: SERIES.h, from: 2001 },
  ].map((s) => ({ ...s, v: years.map((yr) => (yr >= s.from ? sum((data as any)[s.key], yr) : null)) }));
  const W = 440, H = 190, L = 40, R = 12, T = 10, B = 22;
  const max = Math.max(1, ...rows.flatMap((r) => r.v.map((v) => v ?? 0))) * 1.08;
  const x = (i: number) => L + (i / (years.length - 1)) * (W - L - R), y = (v: number) => H - B - (v / max) * (H - T - B);
  return (
    <div className="chart" ref={host} onMouseLeave={() => { setTip(null); setHover(null); }}
      onMouseMove={(e) => {
        const p = at(e, host.current), w = host.current!.clientWidth;
        const i = Math.max(0, Math.min(years.length - 1, Math.round(((p.x / w) * W - L) / ((W - L - R) / (years.length - 1)))));
        setHover(i);
        setTip({ ...p, lines: [String(years[i]), ...rows.filter((r) => r.v[i] != null).map((r) => [r.color, `${r.label}: ${fmtFull(r.v[i]!)}`] as [string, string])] });
      }}>
      <div className="legend">{rows.map((r) => <span key={r.key}><i style={{ background: r.color }} />{r.label}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Active cell-days per year by sensor and harmonized">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(f * max / 1.08)} y2={y(f * max / 1.08)} className="grid" />
          <text x={L - 6} y={y(f * max / 1.08) + 3} className="ax" textAnchor="end">{fmt(f * max / 1.08)}</text></g>)}
        {years.map((yr, i) => (yr % 5 === 0 ? <text key={yr} x={x(i)} y={H - 6} className="ax" textAnchor="middle">{yr}</text> : null))}
        {rows.map((r) => <path key={r.key} fill="none" stroke={r.color} strokeWidth={r.key === "h" ? 2.4 : 1.6} strokeLinejoin="round"
          d={r.v.map((v, i) => (v == null ? "" : `${i && r.v[i - 1] != null ? "L" : "M"}${x(i)},${y(v)}`)).join("")} />)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="cross" />}
        {hover != null && rows.map((r) => r.v[hover] != null && <circle key={r.key} cx={x(hover)} cy={y(r.v[hover]!)} r={3.5} fill={r.color} className="ring" />)}
      </svg>
      <TipBox tip={tip} width={host.current?.clientWidth ?? 400} />
    </div>
  );
}

/* ---------- daily calendar: day of year x year ---------- */
export function DailyStrip({ data, epoch, lastMi }: { data: RegionData; epoch: string; lastMi: number }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const y0 = 2001, y1 = miYear(lastMi), rows = y1 - y0 + 1, RH = 9, L = 34, T = 14;
  const grid = useMemo(() => {
    const g = new Float32Array(rows * 366), e = Date.parse(epoch + "T00:00:00Z");
    let max = 0;
    for (let i = 0; i < data.d.length; i++) {
      const dt = new Date(e + data.d[i] * 864e5), yr = dt.getUTCFullYear();
      if (yr < y0) continue;
      const doy = Math.floor((dt.getTime() - Date.UTC(yr, 0, 1)) / 864e5);
      g[(yr - y0) * 366 + doy] = data.v[i];
      max = Math.max(max, data.v[i]);
    }
    return { g, max: Math.max(1, max) };
  }, [data, epoch, rows]);
  useEffect(() => {
    const c = canvas.current!, dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = T + rows * RH;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const cw = (w - L) / 366;
    ctx.font = "10px var(--font-geist-mono), monospace";
    ctx.fillStyle = "#8b90a0";
    MONTHS.forEach((m, i) => ctx.fillText(m[0], L + ((Date.UTC(2001, i, 15) - Date.UTC(2001, 0, 1)) / 864e5) * cw - 3, 9));
    for (let r = 0; r < rows; r++) {
      if ((y0 + r) % 5 === 0) { ctx.fillStyle = "#8b90a0"; ctx.fillText(String(y0 + r), 0, T + r * RH + 8); }
      ctx.fillStyle = "#171a22";
      ctx.fillRect(L, T + r * RH, w - L, RH - 1);
      for (let d = 0; d < 366; d++) {
        const v = grid.g[r * 366 + d];
        if (v <= 0) continue;
        ctx.fillStyle = fire(Math.sqrt(v / grid.max));
        ctx.fillRect(L + d * cw, T + r * RH, Math.ceil(cw), RH - 1);
      }
    }
  }, [grid, rows]);
  return (
    <div className="chart" ref={host} onMouseLeave={() => setTip(null)}
      onMouseMove={(e) => {
        const p = at(e, host.current), w = host.current!.clientWidth;
        const r = Math.floor((p.y - T) / RH), d = Math.floor(((p.x - L) / (w - L)) * 366);
        if (r < 0 || r >= rows || d < 0 || d > 365) return setTip(null);
        const dt = new Date(Date.UTC(y0 + r, 0, 1) + d * 864e5);
        setTip({ ...p, lines: [dt.toISOString().slice(0, 10), `${fmtFull(grid.g[r * 366 + d])} active cell-days`] });
      }}>
      <canvas ref={canvas} style={{ width: "100%", height: T + rows * RH }} aria-label="Daily burning calendar" />
      <TipBox tip={tip} width={host.current?.clientWidth ?? 400} />
    </div>
  );
}

/* ---------- early-warning window in every year ---------- */
export function WindowBars({ win, label }: { win: { years: number[]; values: number[] }; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const prior = win.values.slice(0, -1), n = win.values.length;
  const sorted = [...prior].sort((a, b) => a - b);
  const med = sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[(sorted.length >> 1) - 1] + sorted[sorted.length >> 1]) / 2;
  const p90 = sorted[Math.floor((sorted.length - 1) * 0.9)];
  const W = 440, H = 120, L = 40, R = 52, T = 8, B = 20;
  const max = Math.max(1, ...win.values, p90) * 1.1, bw = (W - L - R) / n;
  const y = (v: number) => H - B - (v / max) * (H - T - B);
  return (
    <div className="chart" ref={host} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="grid" />
        <text x={L - 6} y={y(0) + 3} className="ax" textAnchor="end">0</text>
        <text x={L - 6} y={y(max / 1.1) + 3} className="ax" textAnchor="end">{fmt(max / 1.1)}</text>
        {win.values.map((v, i) => (
          <g key={i} onMouseMove={(e) => setTip({ ...at(e, host.current), lines: [`${label}, ${win.years[i]}`, `${fmtFull(v)} active cell-days`,
            i === n - 1 ? `${med > 0 ? (v / med).toFixed(1) + "× the median" : "no burning in a typical year"}` : ""].filter(Boolean) })}>
            <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
            <rect x={L + i * bw + 1} y={y(v)} width={Math.max(2, bw - 2)} height={Math.max(0, y(0) - y(v))} rx={Math.min(3, (y(0) - y(v)) / 2)}
              fill={i === n - 1 ? SERIES.h : "#4a4f5c"} />
            {win.years[i] % 5 === 0 && <text x={L + i * bw + bw / 2} y={H - 6} className="ax" textAnchor="middle">{win.years[i]}</text>}
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(med)} y2={y(med)} className="ref" />
        <text x={W - R + 4} y={y(med) + 3} className="ax">median</text>
        <line x1={L} x2={W - R} y1={y(p90)} y2={y(p90)} className="ref dash" />
        <text x={W - R + 4} y={y(p90) + (Math.abs(y(p90) - y(med)) < 10 ? -6 : 3)} className="ax">90th pct</text>
        <text x={L + (n - 0.5) * bw} y={Math.max(T + 8, y(win.values[n - 1]) - 4)} className="lbl" textAnchor="middle">{win.years[n - 1]}</text>
      </svg>
      <TipBox tip={tip} width={host.current?.clientWidth ?? 400} />
    </div>
  );
}
