// Shared helpers for filming the calibration page in demo (stored results) mode.
// Drives the page with the test harness, and watches every network request a browser makes.
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { serve } from "../server.mjs";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SITE = fileURLToPath(new URL("../../site", import.meta.url));
export const W = 1280, H = 720, FPS = 30, BAND = 64;
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+\//;
const INLINE = /^(data|blob|about):/;
export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// A harness browser whose DevTools socket is tapped, so Network.* events can be read here too.
// scale 2 gives 2560x1440 stills of the 1280x720 page, so the film can crop in and stay sharp.
export async function watched(scale = 1) {
  const requests = [];
  const Orig = globalThis.WebSocket;
  globalThis.WebSocket = class extends Orig {
    constructor(...a) {
      super(...a);
      this.addEventListener("message", (e) => {
        const m = JSON.parse(e.data);
        if (m.method === "Network.requestWillBeSent") requests.push({ method: m.params.request.method, url: m.params.request.url });
      });
    }
  };
  // The harness picks its browser from CHROME_PATH: a wrapper that keeps Chrome itself off the network too.
  process.env.CHROME_PATH = fileURLToPath(new URL("./chrome.sh", import.meta.url));
  const { launch } = await import("../../test/harness.mjs");
  const b = await launch();
  globalThis.WebSocket = Orig;
  await b.cdp("Network.enable");
  await b.cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: scale, mobile: false });
  await sleep(100);
  await b.scheme("light");
  await b.cdp("Emulation.setScrollbarsHidden", { hidden: true });
  const offsite = () => requests.filter((r) => !LOCAL.test(r.url) && !INLINE.test(r.url));
  const guard = () => { const o = offsite(); if (o.length) throw new Error(`STOP: a request went outside 127.0.0.1: ${o[0].url}`); };
  const jpeg = async () => {
    guard();
    const { data } = await b.cdp("Page.captureScreenshot", { format: "jpeg", quality: 92 });
    return Buffer.from(data, "base64");
  };
  const summary = () => ({
    count: requests.length,
    local: requests.filter((r) => LOCAL.test(r.url)).length,
    inline: requests.filter((r) => INLINE.test(r.url)).length,
    offsite: offsite(),
    paths: [...new Set(requests.filter((r) => LOCAL.test(r.url)).map((r) => r.method + " " + new URL(r.url).pathname))],
  });
  return { b, requests, guard, jpeg, summary };
}

// The calibration page, served locally, with the clicks and key presses the flow test uses.
export async function studio() {
  const server = await serve(SITE);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const w = await watched(2);
  const { b, guard } = w;
  const click = async (k) => {
    await b.until(`!!document.querySelector('[data-k="${k}"]') && !document.querySelector('[data-k="${k}"]').disabled`, `button ${k}`);
    await b.js(`document.querySelector('[data-k="${k}"]').click()`);
    guard();
  };
  const press = async (key) => {
    const codes = { Enter: 13, Backspace: 8 };
    const base = { key, code: key.length === 1 ? (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`) : key, windowsVirtualKeyCode: codes[key] ?? key.toUpperCase().charCodeAt(0) };
    await b.cdp("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(key.length === 1 ? { text: key } : {}) });
    await b.cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(60);
  };
  const heading = (text) => b.until(`document.querySelector(".panel h2")?.textContent === ${JSON.stringify(text)}`, `the "${text}" screen`);
  const fresh = async () => {
    await b.open(url);
    await b.js(`localStorage.clear()`);
    await b.open(url);
    await b.until(`!!document.querySelector('[data-k="start-demo"]')`, "the start screen");
  };
  const close = async () => { await b.close(); server.close(); };
  return { ...w, url, click, press, heading, fresh, close };
}

export const save = (file, buf) => { writeFileSync(file, buf); return file; };
