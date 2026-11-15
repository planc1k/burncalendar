// Capture real screens of the live site for the demo video.
// Usage: node demo/capture.mjs [URL]   (default: the deployed site). Writes demo/shots/*.png and shots.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { findChrome } from "./chrome.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
fs.mkdirSync(dir, { recursive: true });
const url = process.argv[2] || "https://burn-calendar-beta.vercel.app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--hide-scrollbars", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
await page.waitForSelector("#stories button", { timeout: 60000 });
await sleep(3000);
const rect = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, sel);
const out = { url, viewport: [1600, 1000] };

// 1. open New South Wales from its story card: the site selects the state and its record month
await page.evaluate(() => [...document.querySelectorAll("#stories button")].find((b) => b.textContent.includes("New South Wales")).click());
await page.waitForSelector("#selection rect.cell.picked", { timeout: 30000 });
await sleep(4000);                                   // map flies to the state, tiles load
await page.evaluate(() => { const c = document.querySelector("#selection rect.cell.picked").closest(".chart"); window.scrollBy(0, c.getBoundingClientRect().top - 150); });
await sleep(2500);
await page.mouse.move(700, 300);
await page.screenshot({ path: path.join(dir, "nsw.png") });
out.cal = await page.evaluate(() => { const r = document.querySelector("#selection rect.cell.picked").closest("svg").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
out.cell = await rect("#selection rect.cell.picked");
// 2. hover the picked month: the site's own tooltip
const hx = out.cell[0] + out.cell[2] / 2, hy = out.cell[1] + out.cell[3] / 2;
await page.mouse.move(hx - 30, hy);
await page.mouse.move(hx, hy, { steps: 5 });
await page.waitForSelector(".tip", { timeout: 5000 });
out.tip = await rect(".tip");
out.tipText = await page.evaluate(() => document.querySelector(".tip").innerText);
await page.screenshot({ path: path.join(dir, "nsw-hover.png") });
// 3. the early-warning table
await page.mouse.move(5, 5);
await page.evaluate(() => window.scrollBy(0, document.querySelector("#warning").getBoundingClientRect().top - 40));
await sleep(1500);
await page.screenshot({ path: path.join(dir, "warning.png") });
out.warning = await rect("#warning");
fs.writeFileSync(path.join(dir, "shots.json"), JSON.stringify(out, null, 1));
console.log(out);
await browser.close();
