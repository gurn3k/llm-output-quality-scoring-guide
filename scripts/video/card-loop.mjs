// Films a short silent loop of the findings report for a build card: the cover's marks drawing,
// the clear-vs-vague explorer changing measure, and the judge-model picker changing its pick.
//   node scripts/video/card-loop.mjs <work dir>      then encode with the ffmpeg line printed at the end
// Animations run slowed down (CDP Animation.setPlaybackRate) and each still is stamped with its
// animation time, so the clip is resampled to an even 30 fps whatever the capture speed.
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../test/harness.mjs";

const OUT = process.argv[2];
if (!OUT) throw new Error("usage: card-loop.mjs <work dir>");
const REPORT = fileURLToPath(new URL("../../report/", import.meta.url));
const W = 1280, H = 744, FPS = 30, RATE = 0.12;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".woff2": "font/woff2" };

const server = createServer((req, res) => {
  const p = req.url === "/" ? "/index.html" : new URL(req.url, "http://x").pathname;
  let body;
  try { body = readFileSync(join(REPORT, p)); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" }).end(body);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const b = await launch();
await b.cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await b.scheme("dark");
await b.open(`http://127.0.0.1:${server.address().port}/`);
await b.js(`document.fonts.ready.then(() => true)`);
await b.js(`document.documentElement.style.overflow = "hidden"`);
await b.cdp("Animation.enable");

const now = () => performance.now();
// Records one segment: `actions` run at their animation time; returns stills stamped with it.
// `clip` is the part of the page filmed, in page pixels, scaled up to fill the frame.
async function segment(name, seconds, actions, clip) {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  await b.cdp("Animation.setPlaybackRate", { playbackRate: RATE });
  const shots = [];
  const todo = [...actions];
  const t0 = now();
  for (let i = 0; ; i++) {
    const t = ((now() - t0) / 1000) * RATE;
    while (todo.length && todo[0].at <= t) await b.js(todo.shift().js);
    const { data } = await b.cdp("Page.captureScreenshot", { format: "jpeg", quality: 92, clip: { ...clip, scale: W / clip.width } });
    const at = ((now() - t0) / 1000) * RATE;
    const file = join(dir, `s${String(i).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    shots.push({ at, file });
    if (at >= seconds) break;
  }
  await b.cdp("Animation.setPlaybackRate", { playbackRate: 1 });
  // Resample to an even frame rate: each frame takes the latest still taken at or before its time.
  const fdir = join(OUT, `${name}-frames`);
  rmSync(fdir, { recursive: true, force: true }); mkdirSync(fdir, { recursive: true });
  const n = Math.round(seconds * FPS);
  let j = 0;
  for (let k = 0; k < n; k++) {
    while (j + 1 < shots.length && shots[j + 1].at <= k / FPS) j++;
    copyFileSync(shots[j].file, join(fdir, `f${String(k).padStart(4, "0")}.jpg`));
  }
  console.log(`${name}: ${shots.length} stills -> ${n} frames`);
}

const scrollTo = (sel, gap) => `{ const el = document.querySelector(${JSON.stringify(sel)}); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - ${gap}); }`;
const settle = () => new Promise((r) => setTimeout(r, 600));
// A frame-shaped clip around an element: its left edge at the text column, tall enough for all of it.
const around = (sel) => b.js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); const h = Math.max(r.height + 40, 470); const w = h * ${W / H}; return { x: r.left - 24, y: r.top + scrollY - 20, width: w, height: h }; })()`);

// 1. The cover: the judge's red marks draw first, then the green ring of the check.
await b.js(`window.scrollTo(0, 0)`);
await b.js(`document.querySelectorAll(".cover .mk").forEach((m) => m.classList.add("pending")); document.documentElement.classList.add("draw"); true`);
await settle();
const coverClip = { x: 150, y: 60, width: 1100, height: 1100 * H / W };
await segment("a-cover", 3.6, [
  { at: 0.35, js: `document.querySelectorAll(".exam-m .mk").forEach((m) => m.classList.remove("pending"))` },
  { at: 1.1, js: `document.querySelectorAll(".marks-key .red .mk").forEach((m) => m.classList.remove("pending"))` },
  { at: 1.6, js: `document.querySelectorAll(".moderated .mk, .marks-key .green .mk").forEach((m) => m.classList.remove("pending"))` },
], coverClip);

// 2. The explorer: kappa, then agreement, then verdicts wrongly failed.
await b.js(scrollTo("[data-ix-chart=explorer]", 28));
await settle();
const pickMeasure = (v) => `document.querySelector('[data-ix-chart=explorer] input[value=${v}]').click()`;
await segment("b-explorer", 4.4, [
  { at: 1.1, js: pickMeasure("rate") },
  { at: 2.6, js: pickMeasure("over") },
], await around("[data-ix-chart=explorer]"));
await b.js(pickMeasure("kappa"));

// 3. The picker: drop the safety bar and the cheapest model wins; put it back and Sonnet does.
await b.js(scrollTo("[data-ix-chart=picker]", 28));
await settle();
const safety = `document.querySelector("[data-ix-chart=picker] .check:nth-of-type(3) input").click()`;
await segment("c-picker", 4.2, [
  { at: 1.0, js: safety },
  { at: 2.6, js: safety },
], await around("[data-ix-chart=picker]"));

if (b.errors.length) throw new Error(`page errors: ${b.errors.join("; ")}`);
await b.close(); server.close();
const x = 0.35;
console.log(`ffmpeg -y -framerate ${FPS} -i ${OUT}/a-cover-frames/f%04d.jpg -framerate ${FPS} -i ${OUT}/b-explorer-frames/f%04d.jpg -framerate ${FPS} -i ${OUT}/c-picker-frames/f%04d.jpg -filter_complex "[0][1]xfade=transition=fade:duration=${x}:offset=${3.6 - x}[ab];[ab][2]xfade=transition=fade:duration=${x}:offset=${3.6 + 4.4 - 2 * x},format=yuv420p" -c:v libx264 -preset slow -crf 26 -movflags +faststart -an loop.mp4`);
