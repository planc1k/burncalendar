"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FIRE_STOPS, Recent, Region, Selection, Tiles, diverge, fmt, monthLabel } from "@/lib/data";

const STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
export type Mode = "activity" | "anomaly" | "hotspots";

type Props = {
  tiles: Tiles; bin: Uint16Array; nMonths: number; geo: any; regions: Region[];
  month: number; mode: Mode; selection: Selection; recent: Recent | null; three: boolean; bounds?: number[];
  drawing: boolean; onDrawn: (b: [number, number, number, number]) => void; onRegion: (id: string) => void;
};

const empty = { type: "FeatureCollection", features: [] } as any;
const rect = (w: number, s: number, e: number, n: number) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
// 3D is a night scene: a dark sheet over the basemap, and a ramp that gets brighter with activity.
export const NIGHT = ["#5a1d33", "#93292c", "#cf4a1c", "#f2811d", "#fcc24a", "#fff4c7"];
const NIGHT_DIV = ["#3b8fe0", "#5f87ab", "#5a5f6b", "#c9703d", "#f58a1f"];
const ROWS = 4; // canvas pixels per tile row at the equator; rows are placed in Mercator so they line up with the map

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const live = useRef(p);
  live.current = p;
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);

  // Tile grid geometry, computed once. The flat map is one small canvas (one pixel column per tile),
  // so a month redraws in a few milliseconds however many tiles there are.
  const grid = useMemo(() => {
    const { xy, size: s } = p.tiles, n = xy.length / 2;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, xy[2 * i]); x1 = Math.max(x1, xy[2 * i]); y0 = Math.min(y0, xy[2 * i + 1]); y1 = Math.max(y1, xy[2 * i + 1]); }
    const west = x0 * s, east = (x1 + 1) * s, south = y0 * s, north = (y1 + 1) * s;
    const W = x1 - x0 + 1, H = (y1 - y0 + 1) * ROWS, mTop = mercY(north), mBot = mercY(south);
    const py = (lat: number) => ((mTop - mercY(lat)) / (mTop - mBot)) * H;
    const col = new Int32Array(n), top = new Float32Array(n), hgt = new Float32Array(n), index = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const tx = xy[2 * i], ty = xy[2 * i + 1], a = Math.floor(py((ty + 1) * s)), b = Math.ceil(py(ty * s));
      col[i] = tx - x0; top[i] = a; hgt[i] = b - a;
      index.set(tx * 100000 + ty, i);
    }
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    return { n, s, west, east, south, north, col, top, hgt, index, canvas };
  }, [p.tiles]);

  /** value and tooltip text for tile i in the current mode, or null when the tile is empty */
  const tileInfo = (i: number, c: Props) => {
    if (c.mode === "activity") {
      const v = c.bin[i * c.nMonths + c.month] / 10;
      if (v <= 0) return null;
      const k = Math.min(1, Math.log1p(v) / Math.log1p(400));
      return { k, r: 0, color: FIRE_STOPS[Math.min(6, 1 + Math.floor(k * 5.999))], text: `${fmt(v)} active cell-days in ${monthLabel(c.month)}` };
    }
    const cur = c.tiles.cur[i], med = c.tiles.med[i];
    if (cur < 1 && med < 1) return null;
    const r = Math.log2((cur + 3) / (med + 3));
    return { k: Math.min(1, Math.log1p(cur) / Math.log1p(400)), r, color: diverge(r),
      text: `Last 30 days: ${fmt(cur)} cell-days · median for these dates: ${fmt(med)}` };
  };

  useEffect(() => {
    const b = live.current.bounds;
    const map = new maplibregl.Map({
      container: el.current!, style: STYLE, bounds: b ? [[b[0], b[1]], [b[2], b[3]]] : [[66, 5], [103, 38]],
      fitBoundsOptions: { padding: 30 }, attributionControl: { compact: true }, dragRotate: false, maxPitch: 65,
    });
    mapRef.current = map;
    map.on("error", (e: any) => console.error("map error", e?.error?.message || e));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("style.load", () => {
      const before = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      for (const id of ["tiles3d", "recent", "box"]) map.addSource(id, { type: "geojson", data: empty });
      map.addSource("regions", { type: "geojson", data: live.current.geo });
      map.addSource("grid", {
        type: "canvas", canvas: grid.canvas, animate: false,
        coordinates: [[grid.west, grid.north], [grid.east, grid.north], [grid.east, grid.south], [grid.west, grid.south]],
      });
      map.addLayer({ id: "grid", type: "raster", source: "grid",
        paint: { "raster-resampling": "nearest", "raster-opacity": 0.9, "raster-fade-duration": 0 } }, before);
      map.addLayer({ id: "regions-fill", type: "fill", source: "regions", paint: { "fill-opacity": 0 } }, before);
      map.addLayer({
        id: "regions-line", type: "line", source: "regions",
        paint: { "line-color": "#3a342b", "line-opacity": 0.4, "line-width": 0.7 },
      }, before);
      map.addLayer({
        id: "recent", type: "circle", source: "recent",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 1.2, 7, 3.2, 10, 6],
          "circle-color": ["interpolate", ["linear"], ["get", "frp"],
            0, FIRE_STOPS[2], 5, FIRE_STOPS[3], 15, FIRE_STOPS[4], 50, FIRE_STOPS[5], 150, FIRE_STOPS[6]],
          "circle-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "regions-sel", type: "line", source: "regions", filter: ["==", ["get", "rid"], ""],
        paint: { "line-color": "#1d1a16", "line-width": 2 },
      });
      // 3D-only layers sit above everything, including the basemap labels
      map.addLayer({ id: "night", type: "background", layout: { visibility: "none" }, paint: { "background-color": "#0a0b10", "background-opacity": 0.94 } });
      map.addLayer({ id: "regions-night", type: "line", source: "regions", layout: { visibility: "none" },
        paint: { "line-color": "#c9cedb", "line-opacity": 0.3, "line-width": 0.6 } });
      map.addLayer({
        id: "tiles-3d", type: "fill-extrusion", source: "tiles3d", layout: { visibility: "none" },
        paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0.95 },
      });
      map.addLayer({ id: "sel-night", type: "line", source: "regions", layout: { visibility: "none" }, filter: ["==", ["get", "rid"], ""],
        paint: { "line-color": "#ffffff", "line-width": 1.6 } });
      map.moveLayer("recent");   // hotspots stay above the night sheet
      map.addLayer({ id: "box-fill", type: "fill", source: "box", paint: { "fill-color": "#1d1a16", "fill-opacity": 0.05 } });
      map.addLayer({
        id: "box-line", type: "line", source: "box",
        paint: { "line-color": "#1d1a16", "line-width": 1.8, "line-dasharray": [2, 1.5] },
      });
      setReady(true);
    });

    // hover + click
    map.on("mousemove", (e) => {
      const c = live.current;
      if (c.drawing || !map.getLayer("regions-fill")) return;
      const f = map.queryRenderedFeatures(e.point, { layers: c.mode === "hotspots" ? ["recent", "regions-fill"] : ["regions-fill"] });
      const reg = f.find((x) => x.layer.id === "regions-fill"), dot = f.find((x) => x.layer.id === "recent");
      let body = dot?.properties.t as string | undefined;
      if (c.mode !== "hotspots") {
        const i = grid.index.get(Math.floor(e.lngLat.lng / grid.s) * 100000 + Math.floor(e.lngLat.lat / grid.s));
        body = i == null ? undefined : tileInfo(i, c)?.text;
      }
      map.getCanvas().style.cursor = reg ? "pointer" : "";
      if (!reg && !body) return setTip(null);
      setTip({ x: e.point.x, y: e.point.y, title: reg ? `${reg.properties.name}` : "", body: body ?? "Click to open this state" });
    });
    map.on("mouseout", () => setTip(null));
    map.on("click", (e) => {
      if (live.current.drawing || !map.getLayer("regions-fill")) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ["regions-fill"] });
      if (f[0]) live.current.onRegion(f[0].properties.rid);
    });

    // draw a box
    let start: maplibregl.LngLat | null = null;
    const box = (a: maplibregl.LngLat, b2: maplibregl.LngLat) =>
      [Math.min(a.lng, b2.lng), Math.min(a.lat, b2.lat), Math.max(a.lng, b2.lng), Math.max(a.lat, b2.lat)] as
      [number, number, number, number];
    const show = (bb: number[]) => (map.getSource("box") as maplibregl.GeoJSONSource)?.setData({
      type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rect(bb[0], bb[1], bb[2], bb[3]) },
    } as any);
    map.on("mousedown", (e) => { if (live.current.drawing) { start = e.lngLat; e.preventDefault(); } });
    map.on("mousemove", (e) => { if (start) show(box(start, e.lngLat)); });
    map.on("mouseup", (e) => {
      if (!start) return;
      const bb = box(start, e.lngLat);
      start = null;
      if (bb[2] - bb[0] > 0.1 && bb[3] - bb[1] > 0.1) live.current.onDrawn(bb.map((v) => Math.round(v * 100) / 100) as any);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [grid]);

  // drawing mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (p.drawing) { map.dragPan.disable(); map.getCanvas().style.cursor = "crosshair"; }
    else { map.dragPan.enable(); map.getCanvas().style.cursor = ""; }
  }, [p.drawing]);

  // paint the month (or the anomaly) onto the canvas; in 3D, build extruded polygons instead
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const ctx = grid.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, grid.canvas.width, grid.canvas.height);
    const feats: any[] = [];
    if (p.mode !== "hotspots") for (let i = 0; i < grid.n; i++) {
      const t = tileInfo(i, p);
      if (!t) continue;
      if (p.three) {
        const x = p.tiles.xy[2 * i] * grid.s, y = p.tiles.xy[2 * i + 1] * grid.s;
        const c = p.mode === "activity" ? NIGHT[Math.min(5, Math.floor(t.k * 5.999))]
          : NIGHT_DIV[Math.round(((Math.max(-3, Math.min(3, t.r ?? 0)) + 3) / 6) * 4)];
        feats.push({ type: "Feature", properties: { c, h: 3000 + Math.pow(t.k, 1.6) * 420000 },
          geometry: { type: "Polygon", coordinates: rect(x, y, x + grid.s, y + grid.s) } });
      } else { ctx.fillStyle = t.color; ctx.fillRect(grid.col[i], grid.top[i], 1, grid.hgt[i]); }
    }
    const src = map.getSource("grid") as maplibregl.CanvasSource;
    src.play();
    requestAnimationFrame(() => src.pause());
    (map.getSource("tiles3d") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: feats } as any);
  }, [ready, grid, p.month, p.mode, p.three, p.tiles, p.bin, p.nMonths]);

  // 3D layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty("grid", "visibility", p.three ? "none" : "visible");
    for (const id of ["tiles-3d", "night", "regions-night", "sel-night"]) map.setLayoutProperty(id, "visibility", p.three ? "visible" : "none");
    const ramp = p.three ? NIGHT.slice(1) : FIRE_STOPS.slice(2);   // bright on dark, dark on light
    map.setPaintProperty("recent", "circle-color", ["interpolate", ["linear"], ["get", "frp"],
      0, ramp[0], 5, ramp[1], 15, ramp[2], 50, ramp[3], 150, ramp[4]]);
    map.setPaintProperty("recent", "circle-radius", ["interpolate", ["linear"], ["zoom"], 3, p.three ? 1.6 : 1.2, 7, p.three ? 3.8 : 3.2, 10, 6.5]);
    if (p.three) map.dragRotate.enable(); else map.dragRotate.disable();
  }, [ready, p.three]);

  // recent hotspots
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const r = p.recent;
    const feats: any[] = [];
    if (r && p.mode === "hotspots") {
      const since = new Date(r.since + "T00:00:00Z").getTime();
      for (let i = 0; i < r.lat.length; i++) {
        const d = new Date(since + r.day[i] * 864e5).toISOString().slice(0, 10);
        feats.push({
          type: "Feature", geometry: { type: "Point", coordinates: [r.lon[i], r.lat[i]] },
          properties: { frp: r.frp[i], t: `${d} ${String(r.time[i]).padStart(4, "0")} UTC · ${r.sensors[r.sensor[i]]} · ${r.frp[i]} MW` },
        });
      }
    }
    (map.getSource("recent") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: feats } as any);
  }, [ready, p.recent, p.mode]);

  // selection highlight + camera
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const sel = p.selection;
    const src = map.getSource("box") as maplibregl.GeoJSONSource;
    let bbox: number[] | undefined;
    if (sel.type === "box") {
      const b = sel.bbox;
      src.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rect(b[0], b[1], b[2], b[3]) } } as any);
      for (const id of ["regions-sel", "sel-night"]) map.setFilter(id, ["==", ["get", "rid"], ""]);
      bbox = b;
    } else {
      src.setData(empty);
      const r = p.regions.find((x) => x.id === sel.id);
      for (const id of ["regions-sel", "sel-night"]) map.setFilter(id, r?.level === "country" ? ["==", ["get", "country"], sel.id]
        : ["==", ["get", "rid"], r?.level === "rid" ? sel.id : ""]);
      bbox = r?.bbox;
    }
    if (bbox) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
      { padding: 50, maxZoom: 7.5, duration: 1100, pitch: p.three ? 58 : 0, bearing: p.three ? -18 : 0 });
  }, [ready, p.selection, p.regions, p.three]);

  return (
    <div className="map-wrap">
      <div ref={el} className="map" />
      {tip && (
        <div className="tip" style={{ left: Math.min(tip.x + 14, (el.current?.clientWidth ?? 600) - 260), top: tip.y + 14 }}>
          {tip.title && <b>{tip.title}</b>}
          <span>{tip.body}</span>
        </div>
      )}
    </div>
  );
}
