"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FIRE_STOPS, Recent, Region, Selection, Tiles, diverge, fmt, monthLabel } from "@/lib/data";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
export type Mode = "activity" | "anomaly" | "hotspots";

type Props = {
  tiles: Tiles; bin: Uint16Array; nMonths: number; geo: any; regions: Region[];
  month: number; mode: Mode; selection: Selection; recent: Recent | null;
  drawing: boolean; onDrawn: (b: [number, number, number, number]) => void; onRegion: (id: string) => void;
};

const empty = { type: "FeatureCollection", features: [] } as any;
const rect = (w: number, s: number, e: number, n: number) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const live = useRef(p);
  live.current = p;
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!, style: STYLE, bounds: [[66, 5], [103, 38]],
      fitBoundsOptions: { padding: 20 }, attributionControl: { compact: true }, dragRotate: false,
    });
    mapRef.current = map;
    map.on("error", (e: any) => console.error("map error", e?.error?.message || e));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("style.load", () => {
      const before = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      for (const id of ["tiles", "recent", "box"]) map.addSource(id, { type: "geojson", data: empty });
      map.addSource("regions", { type: "geojson", data: live.current.geo });
      map.addLayer({
        id: "tiles", type: "fill", source: "tiles",
        paint: { "fill-color": ["get", "c"], "fill-opacity": 0.82, "fill-antialias": false },
      }, before);
      map.addLayer({ id: "regions-fill", type: "fill", source: "regions", paint: { "fill-opacity": 0 } }, before);
      map.addLayer({
        id: "regions-line", type: "line", source: "regions",
        paint: { "line-color": "#c5cad6", "line-opacity": 0.45, "line-width": 0.7 },
      }, before);
      map.addLayer({
        id: "recent", type: "circle", source: "recent",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 1.3, 7, 3.2, 10, 6],
          "circle-color": ["interpolate", ["linear"], ["get", "frp"],
            0, FIRE_STOPS[2], 5, FIRE_STOPS[3], 15, FIRE_STOPS[4], 50, FIRE_STOPS[5], 150, FIRE_STOPS[6]],
          "circle-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "regions-sel", type: "line", source: "regions", filter: ["==", ["get", "rid"], ""],
        paint: { "line-color": "#ffffff", "line-width": 1.8 },
      });
      map.addLayer({ id: "box-fill", type: "fill", source: "box", paint: { "fill-color": "#fff", "fill-opacity": 0.06 } });
      map.addLayer({
        id: "box-line", type: "line", source: "box",
        paint: { "line-color": "#ffffff", "line-width": 1.8, "line-dasharray": [2, 1.5] },
      });
      setReady(true);
    });

    // hover + click
    map.on("mousemove", (e) => {
      const c = live.current;
      if (c.drawing || !map.getLayer("regions-fill")) return;
      const layers = c.mode === "hotspots" ? ["recent", "regions-fill"] : ["tiles", "regions-fill"];
      const f = map.queryRenderedFeatures(e.point, { layers });
      const reg = f.find((x) => x.layer.id === "regions-fill");
      const hit = f.find((x) => x.layer.id !== "regions-fill");
      map.getCanvas().style.cursor = reg ? "pointer" : "";
      if (!reg && !hit) return setTip(null);
      const title = reg ? `${reg.properties.name}` : "";
      setTip({ x: e.point.x, y: e.point.y, title, body: hit ? hit.properties.t : "Click to open this state" });
    });
    map.on("mouseout", () => setTip(null));
    map.on("click", (e) => {
      if (live.current.drawing || !map.getLayer("regions-fill")) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ["regions-fill"] });
      if (f[0]) live.current.onRegion(f[0].properties.rid);
    });

    // draw a box
    let start: maplibregl.LngLat | null = null;
    const box = (a: maplibregl.LngLat, b: maplibregl.LngLat) =>
      [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)] as
      [number, number, number, number];
    const show = (b: number[]) => (map.getSource("box") as maplibregl.GeoJSONSource)?.setData({
      type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rect(b[0], b[1], b[2], b[3]) },
    } as any);
    map.on("mousedown", (e) => { if (live.current.drawing) { start = e.lngLat; e.preventDefault(); } });
    map.on("mousemove", (e) => { if (start) show(box(start, e.lngLat)); });
    map.on("mouseup", (e) => {
      if (!start) return;
      const b = box(start, e.lngLat);
      start = null;
      if (b[2] - b[0] > 0.1 && b[3] - b[1] > 0.1) live.current.onDrawn(b.map((v) => Math.round(v * 100) / 100) as any);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // drawing mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (p.drawing) { map.dragPan.disable(); map.getCanvas().style.cursor = "crosshair"; }
    else { map.dragPan.enable(); map.getCanvas().style.cursor = ""; }
  }, [p.drawing]);

  // tiles for the month / anomaly
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const { tiles, bin, nMonths, month, mode } = p;
    const s = tiles.size, n = tiles.xy.length / 2, feats: any[] = [];
    if (mode !== "hotspots") for (let i = 0; i < n; i++) {
      let c: string, t: string;
      if (mode === "activity") {
        const v = bin[i * nMonths + month] / 10;
        if (v <= 0) continue;
        const k = Math.min(1, Math.log1p(v) / Math.log1p(400));
        c = FIRE_STOPS[Math.min(6, 1 + Math.floor(k * 5.999))];
        t = `${fmt(v)} active cell-days in ${monthLabel(month)}`;
      } else {
        const cur = tiles.cur[i], med = tiles.med[i];
        if (cur < 1 && med < 1) continue;
        c = diverge(Math.log2((cur + 3) / (med + 3)));
        t = `Last 30 days: ${fmt(cur)} cell-days · median for this window: ${fmt(med)}`;
      }
      const x = tiles.xy[2 * i] * s, y = tiles.xy[2 * i + 1] * s;
      feats.push({ type: "Feature", properties: { c, t }, geometry: { type: "Polygon", coordinates: rect(x, y, x + s, y + s) } });
    }
    (map.getSource("tiles") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: feats } as any);
  }, [ready, p.month, p.mode, p.tiles, p.bin, p.nMonths]);

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
          properties: { frp: r.frp[i], t: `${d} ${r.time[i].padStart(4, "0")} UTC · ${r.sensor[i]} · ${r.frp[i]} MW` },
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
      map.setFilter("regions-sel", ["==", ["get", "rid"], ""]);
      bbox = b;
    } else {
      src.setData(empty);
      const r = p.regions.find((x) => x.id === sel.id);
      map.setFilter("regions-sel", r?.level === "country" ? ["==", ["get", "country"], sel.id]
        : ["==", ["get", "rid"], r?.level === "rid" ? sel.id : ""]);
      bbox = r?.bbox;
    }
    if (bbox) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 60, maxZoom: 7.5, duration: 900 });
  }, [ready, p.selection, p.regions]);

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
