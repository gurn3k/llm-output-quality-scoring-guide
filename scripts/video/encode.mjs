// Turns the stills from film.mjs into the walkthrough video.
//   node scripts/video/encode.mjs <work dir> prep     caption bands, end card, one checked frame per scene, contact sheet
//   node scripts/video/encode.mjs <work dir> render   one file per scene (crossfades inside), joined without re-encoding
//   node scripts/video/encode.mjs <work dir> render 1,2,8,9   after an edit: only those scene files are drawn again
//     (a changed scene, and the scene after it, which holds the crossfade from it), then everything is rejoined
// The frames themselves (camera crop, caption, crossfades) are drawn by frames.py.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { watched, ROOT, W, H, FPS, BAND } from "./lib.mjs";

const [OUT, mode, only] = process.argv.slice(2);
const MEDIA = join(ROOT, "report", "media");
const LOGO = "/home/claude/portfolio/brand/gurn3k/gurn3k-01-original-dark.svg";
const REPO = "github.com/gurn3k/llm-output-quality-scoring-guide";
const MAX_BYTES = 8e6;
const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
const scenes = manifest.scenes;
const cap = (i) => join(OUT, `caption-${i + 1}.png`);
const keyFrame = (i) => join(OUT, `key-${i + 1}.jpg`);
const endCard = join(OUT, "endcard.jpg");
const ffmpeg = (args, input) => {
  const r = spawnSync("/usr/local/bin/ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { input, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
};
const page = (body) => "data:text/html;base64," + Buffer.from(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:Inter,sans-serif}</style>${body}`).toString("base64");

const frames = (what, ...more) => {
  const r = spawnSync("python3", [fileURLToPath(new URL("./frames.py", import.meta.url)), OUT, what, ...more], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`frames.py ${what} failed`);
};
const probe = (f) => spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,codec_name,pix_fmt,nb_frames:format=duration,size", "-of", "default=nw=1", f]).stdout.toString().trim().replace(/\n/g, " ");

if (mode === "prep") {
  const w = await watched();
  const { b } = w;
  try {
    // Caption bands: transparent pictures the size of the frame, drawn by Chrome in Inter.
    await b.cdp("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    for (const [i, sc] of scenes.entries()) {
      let size = 30, width;
      for (; size >= 28; size--) {
        await b.open(page(`<div style="position:absolute;left:0;right:0;bottom:0;height:${BAND}px;background:rgba(8,10,18,.95);display:flex;align-items:center;justify-content:center"><span id="t" style="color:#fff;font-weight:600;font-size:${size}px;white-space:nowrap"></span></div>`));
        await b.js(`document.getElementById("t").textContent = ${JSON.stringify(sc.caption)}; document.fonts.ready.then(() => true)`);
        width = await b.js(`document.getElementById("t").getBoundingClientRect().width`);
        if (width <= W - 60) break;
      }
      if (width > W - 60) throw new Error(`caption ${i + 1} doesn't fit on one line at 28 px: ${sc.caption}`);
      const font = await b.js(`getComputedStyle(document.getElementById("t")).fontFamily + " / Inter loaded: " + document.fonts.check("600 30px Inter")`);
      const { data } = await b.cdp("Page.captureScreenshot", { format: "png" });
      writeFileSync(cap(i), Buffer.from(data, "base64"));
      console.log(`caption ${i + 1}: ${size}px, ${Math.round(width)}px wide, ${font}`);
    }
    // End card.
    await b.cdp("Emulation.setDefaultBackgroundColorOverride", { color: { r: 6, g: 16, b: 15, a: 1 } });
    const svg = readFileSync(LOGO, "utf8").replace(/<svg /, '<svg style="width:420px;height:auto;display:block" ');
    await b.open(page(`<div style="width:${W}px;height:${H}px;background:#06100F;display:flex;flex-direction:column;align-items:center;justify-content:center">${svg}<p style="margin:26px 0 0;color:#EAFFF6;font-size:36px;font-weight:600;letter-spacing:-.01em">Built and measured by Gurnek Khaira</p><p id="repo" style="margin:30px 0 0;color:#8CF5C7;font-size:30px;font-weight:600">${REPO}</p><p id="below" style="margin:22px 0 0;color:#EAFFF6;opacity:.72;font-size:24px;font-weight:500">Full findings below ↓</p></div>`));
    await b.js(`document.fonts.ready.then(() => true)`);
    console.log("end card boxes", JSON.stringify(await b.js(`[...document.querySelectorAll("svg, p")].map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.tagName, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })`)));
    writeFileSync(endCard, await w.jpeg());
    console.log("helper pages network", JSON.stringify(w.summary()));
  } finally { await b.close(); }
  // One frame per scene as it will look in the video, and a contact sheet of them at full size.
  frames("keys");
  const all = [...scenes.map((_, i) => keyFrame(i)), endCard];
  mkdirSync(MEDIA, { recursive: true });
  const layout = all.map((_, i) => `${(i % 2) * W}_${Math.floor(i / 2) * H}`).join("|");
  ffmpeg([...all.flatMap((f) => ["-i", f]), "-filter_complex", `${all.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=${all.length}:layout=${layout}:fill=0x06100F`, "-frames:v", "1", "-q:v", "3", join(MEDIA, "contact-sheet.jpg")]);
  copyFileSync(keyFrame(scenes.findIndex((s) => s.name === "calibrate")), join(MEDIA, "poster.jpg"));
  console.log("prep done");
}

if (mode === "render") {
  frames("render", ...(only ? [only] : []));
  const list = join(OUT, "scenes.txt");
  const files = readFileSync(list, "utf8").trim().split("\n").map((l) => l.slice(6, -1));
  mkdirSync(MEDIA, { recursive: true });
  const tmp = join(MEDIA, "walkthrough.part.mp4"), final = join(MEDIA, "walkthrough.mp4");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", tmp]);
  // Over the size limit: the finished file is encoded again, smaller; nothing is drawn again.
  for (let crf = 21; statSync(tmp).size > MAX_BYTES && crf <= 30; crf += 2) {
    const small = join(MEDIA, "walkthrough.small.part.mp4");
    ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-crf", String(crf), "-preset", "slow", "-pix_fmt", "yuv420p", "-r", String(FPS), "-an", "-movflags", "+faststart", small]);
    renameSync(small, tmp);
    console.log(`re-encoded at CRF ${crf}`);
  }
  renameSync(tmp, final);
  for (const f of files) console.log(f.split("/").pop(), probe(f));
  console.log("walkthrough.mp4", probe(final), `${(statSync(final).size / 1e6).toFixed(2)} MB`);
}
