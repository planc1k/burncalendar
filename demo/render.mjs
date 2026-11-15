// Render demo/index.html to an MP4, frame by frame.
// Usage: node demo/render.mjs [--team "One Scale"] [--members "Name One, Name Two"] [--out demo/burncalendar-demo.mp4] [--still 12.5] [--silent]
// Needs Google Chrome and ffmpeg. --still writes one PNG at that second instead of the video.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { findChrome } from "./chrome.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const FPS = 30, DUR = 29.5, out = path.resolve(opt("--out", path.join(root, "demo/burncalendar-demo.mp4")));
const CHROME = findChrome();
const TYPES = { ".html": "text/html", ".json": "application/json", ".geojson": "application/json", ".bin": "application/octet-stream", ".js": "text/javascript", ".png": "image/png" };

const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const qs = new URLSearchParams({ render: "1", team: opt("--team", "One Scale"), members: opt("--members", "") });
await page.goto(`http://localhost:${port}/demo/index.html?${qs}`, { waitUntil: "networkidle0" });
await page.evaluate(() => window.ready);

if (args.includes("--still")) {
  for (const s of opt("--still").split(",")) {
    await page.evaluate((t) => window.seek(t), +s);
    await page.screenshot({ path: path.join(path.dirname(out), `still-${s}.png`) });
  }
} else {
  const wav = path.join(root, "demo/sfx.wav"), sound = !args.includes("--silent") && fs.existsSync(wav);   // made by sfx.py
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    ...(sound ? ["-i", wav, "-c:a", "aac", "-b:a", "256k", "-shortest"] : []), "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const n = Math.round(DUR * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const jpg = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 90 === 0) console.log(`${Math.round((i / n) * 100)}%`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("wrote", out);
}
await browser.close();
server.close();
