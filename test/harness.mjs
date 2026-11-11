// Drives a real page in headless Chrome with no dependencies: Chrome's DevTools protocol over
// Node's built-in WebSocket. Tests skip when no Chrome or Edge is found; set CHROME_PATH to one.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);
export const CHROME = CANDIDATES.find((p) => existsSync(p)) ?? null;
export const SKIP = CHROME ? false : "no Chrome or Edge found (set CHROME_PATH)";

// A wider fallback font than any system font, so layout checks also hold on Linux CI.
const WIDE_FONT = 'body, input, select, button, textarea { font-family: Verdana, "DejaVu Sans", sans-serif !important; letter-spacing: 0.02em !important; }';

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "quality-guide-chrome-"));
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"];
  if (process.platform === "linux") args.push("--no-sandbox");
  const proc = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((ok, fail) => {
    let err = "";
    const timer = setTimeout(() => fail(new Error(`Chrome didn't start: ${err}`)), 15000);
    proc.stderr.on("data", (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); ok(m[1]); }
    });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let seq = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, fail } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
      return;
    }
    // Anything the page reports as an error fails the test that collects it.
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(msg.params.type)) errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") errors.push(msg.params.entry.text);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = ++seq;
    waiting.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Page.enable");

  const js = async (expr) => {
    const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr}\n${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  const until = async (expr, what, ms = 5000) => {
    for (const end = Date.now() + ms; Date.now() < end;) {
      if (await js(expr).catch(() => false)) return;
      await new Promise((ok) => setTimeout(ok, 50));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const open = async (url) => {
    wideSheet = null;
    await cdp("Page.navigate", { url });
    await until(`document.readyState === "complete"`, `${url} to load`);
  };
  const viewport = async (width, height = 900) => {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await new Promise((ok) => setTimeout(ok, 100));
  };
  const scheme = (value) => cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }] });
  // Added through DevTools rather than a <style> tag, which the page's own CSP rightly blocks.
  let wideSheet = null;
  const wideFont = async (on) => {
    if (!wideSheet) {
      await cdp("DOM.enable");
      await cdp("CSS.enable");
      const { frameTree } = await cdp("Page.getFrameTree");
      ({ styleSheetId: wideSheet } = await cdp("CSS.createStyleSheet", { frameId: frameTree.frame.id }));
    }
    await cdp("CSS.setStyleSheetText", { styleSheetId: wideSheet, text: on ? WIDE_FONT : "" });
    await new Promise((ok) => setTimeout(ok, 50));
  };
  // Elements that stick out of their container (or the page that scrolls sideways), by selector.
  const overflow = () => js(`(() => {
    const out = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth) out.push("page scrolls sideways by " + (doc.scrollWidth - doc.clientWidth) + "px");
    for (const el of document.querySelectorAll("body *")) {
      const parent = el.parentElement;
      if (!parent || getComputedStyle(el).position === "fixed") continue;
      const a = el.getBoundingClientRect(), b = parent.getBoundingClientRect();
      if (a.width === 0 || getComputedStyle(parent).overflowX !== "visible") continue;
      if (a.right > b.right + 1 || a.left < b.left - 1) out.push(el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : "") + " sticks out of its container (" + (parent.tagName.toLowerCase() + (parent.className && typeof parent.className === "string" ? "." + parent.className.split(" ").join(".") : "")) + ", '" + (el.textContent || "").trim().slice(0, 30) + "', by " + Math.round(Math.max(a.right - b.right, b.left - a.left)) + "px)");
    }
    return out;
  })()`);
  const screenshot = async (name) => {
    const dir = process.env.SCREENSHOT_DIR;
    if (!dir) return null;
    mkdirSync(dir, { recursive: true });
    const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const file = join(dir, `${name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  };
  const close = async () => {
    try { await send("Browser.close"); } catch { /* already gone */ }
    ws.close();
    proc.kill();
    await new Promise((ok) => setTimeout(ok, 300));
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch { /* Windows may still hold a lock */ }
  };

  return { cdp, js, until, open, viewport, scheme, wideFont, overflow, screenshot, errors, close };
}
