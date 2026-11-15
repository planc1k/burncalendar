export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

// month index 0 = November 2000 (first MODIS month in FIRMS)
export const miYear = (mi: number) => 2000 + Math.floor((mi + 10) / 12);
export const miMonth = (mi: number) => (mi + 10) % 12;
export const toMi = (year: number, month: number) => (year - 2000) * 12 + month - 10;
export const monthLabel = (mi: number) => `${MONTHS_LONG[miMonth(mi)]} ${miYear(mi)}`;

export type Region = {
  id: string; name: string; level: "rid" | "country" | "all"; country: string | null;
  total: number; cur: number; med: number; p90: number; pct: number; bbox: number[];
  trend: { pct: number; p: number } | null; naive: { pct: number; p: number } | null;
  shift: { peak: number; days: number; p: number; first: number; last: number } | null;
};
export type RegionData = {
  id: string; name: string; h: number[]; modis: number[]; snpp: number[]; n20: number[]; n21: number[];
  frp: number[]; d: number[]; v: number[]; window: { years: number[]; values: number[] } | null;
  band: Band; record: { mi: number; peak?: string; first?: string | null; lead?: number | null } | null;
};
/** 80% range of truth / estimate on held-out years: m, y = MODIS era by month, by year; tm, ty = Terra alone; n = NOAA-20 */
export type Band = { m: number[]; y: number[]; tm: number[]; ty: number[]; n: number[] };
/** which range applies to a month of the record, or null where S-NPP measured it directly */
export const bandFor = (b: Band, mi: number, yearly = false) =>
  mi < toMi(2002, 6) ? (yearly ? b.ty : b.tm) : mi < toMi(2012, 0) ? (yearly ? b.y : b.m) : mi >= toMi(2026, 0) ? b.n : null;
export type Tiles = { size: number; xy: number[]; cur: number[]; med: number[]; pct: number[] };
export type Recent = {
  lat: number[]; lon: number[]; day: number[]; time: number[]; frp: number[]; sensors: string[]; sensor: number[];
  high: number[]; night: number[]; rids: string[]; rid: number[]; since: string;
};
export type Selection = { type: "region"; id: string } | { type: "box"; bbox: [number, number, number, number] };

// Sequential ramp on paper: one warm family, lightness falls monotonically as activity rises.
const FIRE = ["#ece4d2", "#f2cf7c", "#ee9e3d", "#dd6a22", "#b8371c", "#7d1717", "#3a0b12"].map(hex);
// Diverging: cool pole, neutral grey midpoint, warm pole.
const DIV = ["#2a6fb0", "#8fb0cc", "#d6cfc0", "#e39a63", "#c8381c"].map(hex);

function hex(h: string) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function ramp(stops: number[][], t: number) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export const fire = (t: number) => ramp(FIRE, t);
/** r = log2 ratio, clamped to +-3 (an eighth to eight times the median) */
export const diverge = (r: number) => ramp(DIV, (Math.max(-3, Math.min(3, r)) + 3) / 6);
export const FIRE_STOPS = [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1].map(fire);

export const SERIES = { modis: "#2a78d6", h: "#d4541f", snpp: "#14875f", n20: "#6250d6", n21: "#b0458f" };

export const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M"
  : n >= 10000 ? Math.round(n / 1000) + "k" : n >= 100 ? Math.round(n).toLocaleString("en-US")
  : (Math.round(n * 10) / 10).toLocaleString("en-US");
export const fmtFull = (n: number) => Math.round(n).toLocaleString("en-US");

export function median(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function quantile(a: number[], q: number) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p);
  return s[i] + ((s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i));
}

/** Monthly medians per calendar month over complete months, 2003 up to (not including) `lastMi` */
export function monthStats(series: number[], lastMi: number) {
  const by: number[][] = Array.from({ length: 12 }, () => []);
  for (let mi = toMi(2003, 0); mi < lastMi; mi++) by[miMonth(mi)].push(series[mi] ?? 0); // 2003+: Terra and Aqua
  return by.map((v) => ({ med: median(v), q25: quantile(v, 0.25), q75: quantile(v, 0.75), n: v.length }));
}

/** tiles.bin is sparse: [non-zero months per tile][month index][value x10], all uint16 */
export function decodeTiles(buf: ArrayBuffer, nTiles: number, nMonths: number) {
  const a = new Uint16Array(buf), total = (a.length - nTiles) / 2, out = new Uint16Array(nTiles * nMonths);
  let k = 0;
  for (let t = 0; t < nTiles; t++) for (let j = 0; j < a[t]; j++, k++) out[t * nMonths + a[nTiles + k]] = a[nTiles + total + k];
  return out;
}

export function boxSeries(tiles: Tiles, bin: Uint16Array, nMonths: number, b: number[]) {
  const out = new Array(nMonths).fill(0);
  const s = tiles.size, n = tiles.xy.length / 2;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const cx = (tiles.xy[2 * i] + 0.5) * s, cy = (tiles.xy[2 * i + 1] + 0.5) * s;
    if (cx < b[0] || cx > b[2] || cy < b[1] || cy > b[3]) continue;
    count++;
    const o = i * nMonths;
    for (let m = 0; m < nMonths; m++) out[m] += bin[o + m] / 10;
  }
  return { series: out, count };
}

export function download(name: string, text: string, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
