// Find a Chrome-family browser for headless rendering. Set CHROME=/path/to/browser to override.
import fs from "node:fs";

export function findChrome() {
  const home = process.env.HOME || "", pw = `${home}/Library/Caches/ms-playwright`;
  const found = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome",
    ...(fs.existsSync(pw) ? fs.readdirSync(pw).filter((d) => d.startsWith("chromium_headless_shell")).sort().reverse()
      .map((d) => `${pw}/${d}/chrome-headless-shell-mac-arm64/chrome-headless-shell`) : []),
  ].find((c) => c && fs.existsSync(c));
  if (!found) throw new Error("No Chrome-family browser found. Set CHROME=/path/to/browser");
  return found;
}
