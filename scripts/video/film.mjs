// Films the demo (stored results) as stills: node scripts/video/film.mjs <work dir>
// Writes 2560x1440 JPEG stills of the 1280x720 page and manifest.json: scenes, captions read from the page,
// the part of each still to show (the camera), frame counts and the network log.
// Never enters a key and never leaves demo mode; stops if any request goes outside 127.0.0.1.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { studio, sleep, save, ROOT, FPS, W, H, BAND } from "./lib.mjs";

const OUT = process.argv[2];
if (!OUT) throw new Error("usage: film.mjs <work dir>");
mkdirSync(join(OUT, "stills"), { recursive: true });
const s = await studio();
const { b, click, press } = s;
const SAFE = H - BAND; // nothing that matters sits under the caption band

// --- The camera: which 16:9 part of the 1280x720 page is shown (x, y, width in page pixels) ---
const FULL = { x: 0, y: 0, w: W };
let cam = { ...FULL };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
const mix = (a, c, t) => ({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, w: a.w + (c.w - a.w) * t });

const scenes = [];
let scene = null, shots = 0, fadeNext = false, widest = 0;
const begin = (name, caption) => { scene = { name, caption, items: [], key: null, focusWidths: [] }; scenes.push(scene); fadeNext = false; };
const check = async () => {
  if (await b.js(`!!document.getElementById("api-key")`)) throw new Error("STOP: a key field is on screen");
  if (await b.js(`document.querySelector("#mode-badge").textContent`) !== "Demo" && scene.name !== "start") throw new Error("STOP: not in demo mode");
};
// One still, shown for some frames while the camera goes from c0 to c1 (the same place for a hold).
const shoot = async (frames, c0, c1, key = false) => {
  await sleep(70);
  await check();
  const file = save(join(OUT, "stills", `${String(++shots).padStart(4, "0")}.jpg`), await s.jpeg());
  const item = { file, frames, c0, c1, ...(fadeNext ? { fade: true } : {}) };
  fadeNext = false;
  scene.items.push(item);
  if (key) scene.key = { file, crop: c1 };
};
const snap = (frames, key) => shoot(frames, cam, cam, key);
const hold = (sec, key) => { scene.focusWidths.push(Math.round(cam.w)); return snap(Math.round(sec * FPS), key); };
// The page changed off camera: the next still fades in over the last one.
const cut = () => { fadeNext = true; };
const scrollY = () => b.js(`scrollY`);
const jump = (y) => b.js(`window.scrollTo({ top: ${Math.round(y)}, behavior: "instant" })`);
// Where an element is: viewport box plus its top in the document.
const box = (el) => b.js(`(() => { const r = (${el}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, top: r.top + scrollY }; })()`);
const k = (key) => `document.querySelector('[data-k="${key}"]')`;
// Two elements as one box.
const span = (a, z) => `(() => { const a = (${a}).getBoundingClientRect(), z = (${z}).getBoundingClientRect(); const l = Math.min(a.left, z.left), t = Math.min(a.top, z.top); return { getBoundingClientRect: () => ({ left: l, top: t, width: Math.max(a.right, z.right) - l, height: Math.max(a.bottom, z.bottom) - t }) }; })()`;
// A view w page pixels wide on an element: the scroll position and camera that put it in the middle of
// what the caption band leaves free (or `top` pixels below the view's top edge).
const aim = async (el, w, { top = null, fixed = false } = {}) => {
  const r = await box(el);
  const max = await b.js(`document.documentElement.scrollHeight - innerHeight`);
  const hc = (w * H) / W, hs = (hc * SAFE) / H;
  const viewTop = top == null ? r.top + r.h / 2 - hs / 2 : r.top - top;
  const scroll = fixed ? await scrollY() : Math.round(clamp(viewTop - (H - hc) / 2, 0, Math.max(0, max)));
  return { scroll, crop: { x: clamp(r.x + r.w / 2 - w / 2, 0, W - w), y: clamp(viewTop - scroll, 0, H - hc), w } };
};
// Move there, eased, never faster than a second. Scrolling is filmed frame by frame.
const go = async (to, sec = 1) => {
  if (sec < 1) throw new Error("camera moves take at least a second");
  const from = await scrollY(), n = Math.round(sec * FPS), c0 = cam;
  if (Math.abs(from - to.scroll) < 1) await shoot(n, c0, to.crop);
  else for (let i = 1; i <= n; i++) { const t = ease(i / n); await jump(from + (to.scroll - from) * t); cam = mix(c0, to.crop, t); await snap(1); }
  await jump(to.scroll);
  cam = to.crop;
};
const place = async (to) => { await jump(to.scroll); cam = to.crop; };

// Temporary overlays, added to the open page only (the site's files are untouched).
const OVERLAYS = `(() => {
  if (window.__film) return;
  const mk = (css) => { const d = document.createElement("div"); d.style.cssText = css; document.body.appendChild(d); return d; };
  const ringCss = "position:absolute;display:none;border:3px solid #ff5a1f;border-radius:12px;box-shadow:0 0 0 5px rgba(255,90,31,.22);pointer-events:none;z-index:9998";
  const ring = mk(ringCss), ring2 = mk(ringCss);
  const cur = mk("position:fixed;display:none;left:0;top:0;width:22px;height:30px;pointer-events:none;z-index:9999;filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 2px 3px rgba(0,0,0,.45))");
  const arrow = document.createElement("div");
  arrow.style.cssText = "width:22px;height:30px;background:#15131f;clip-path:polygon(0 0,0 80%,26% 61%,45% 100%,62% 92%,43% 54%,78% 54%)";
  cur.appendChild(arrow);
  const chip = mk("position:fixed;display:none;background:#fff;border:1px solid #d9d4ee;border-radius:12px;box-shadow:0 6px 18px rgba(30,20,80,.18);padding:10px 16px 12px;z-index:9997;box-sizing:border-box");
  const side = mk("position:fixed;display:none;inset:0;z-index:9990;align-items:flex-start;justify-content:center;gap:22px;padding-top:150px;box-sizing:border-box");
  window.__film = { ring, ring2, cur, chip, side, good: [] };
})()`;
const ring = async (el, pad = 6, which = "ring") => {
  const r = await box(el);
  await b.js(`(() => { const s = window.__film.${which}.style; s.display = "block"; s.left = "${r.x - pad - 3}px"; s.top = "${r.top - pad - 3}px"; s.width = "${r.w + 2 * pad}px"; s.height = "${r.h + 2 * pad}px"; })()`);
};
const ringOff = () => b.js(`window.__film.ring.style.display = "none"; window.__film.ring2.style.display = "none"`);
let cx = 900, cy = 420;
const curAt = (x, y) => b.js(`(() => { const s = window.__film.cur.style; s.display = "block"; s.transform = "translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)"; })()`);
const curOff = () => b.js(`window.__film.cur.style.display = "none"`);
const pointAt = async (el, sec = 0.7) => {
  const r = await box(el), tx = r.x + r.w * 0.5, ty = r.y + r.h * 0.55, n = Math.round(sec * FPS);
  if (cx < cam.x || cx > cam.x + cam.w || cy < cam.y || cy > cam.y + (cam.w * SAFE) / W) { cx = cam.x + cam.w * 0.8; cy = cam.y + (cam.w * SAFE) / W * 0.85; }
  for (let i = 1; i <= n; i++) { const t = ease(i / n); await curAt(cx + (tx - cx) * t, cy + (ty - cy) * t); await snap(1); }
  cx = tx; cy = ty;
};
// The page's own progress line, pinned to the top of the view while the pass/fail rows are on screen.
const chip = () => b.js(`(() => {
  const c = window.__film.chip, line = document.querySelector('.panel p.small[aria-live]'), bar = document.querySelector(".panel .progress");
  c.replaceChildren(line.cloneNode(true), bar.cloneNode(true));
  c.firstChild.removeAttribute("aria-live"); c.firstChild.style.margin = "0 0 8px";
  c.style.left = "${cam.x + 14}px"; c.style.top = "${cam.y + 8}px"; c.style.width = "${cam.w - 28}px"; c.style.display = "block";
})()`);
const chipOff = () => b.js(`window.__film.chip.style.display = "none"`);
const text = (el) => b.js(`(${el}).textContent.trim()`);
const WORDS = ["zero", "one", "two", "three", "four", "five", "six"];
const facts = {};
const PANEL = `document.querySelector(".panel")`;
const cardAt = (i) => `document.querySelectorAll(".panel .cards .card")[${i}]`;
// What the trust cards say, read from the page.
const readCards = () => b.js(`[...document.querySelectorAll(".panel .cards .card")].map((c) => {
  const rate = (i) => { const m = c.querySelectorAll(".rate")[i]?.innerText.replace(/\\s+/g, " ").match(/(\\d+) of (\\d+).*?between (\\d+)% and (\\d+)%/); return m ? { k: +m[1], n: +m[2], low: +m[3], high: +m[4] } : null; };
  const kap = c.textContent.match(/\\(kappa\\): (-?\\d\\.\\d+), likely between (-?\\d\\.\\d+) and (-?\\d\\.\\d+)/);
  return { name: c.querySelector("h3").textContent, pills: [...c.querySelectorAll(".pill")].map((p) => p.textContent), caught: rate(0), passed: rate(1), kappa: kap ? +kap[1] : null, kappaRange: kap ? [+kap[2], +kap[3]] : null,
    notCounted: +(c.textContent.match(/Not counted: (\\d+)/)?.[1] ?? 0), disagreements: +(c.textContent.match(/Disagreements \\((\\d+)\\)/)?.[1] ?? 0), why: c.querySelector(".notice")?.innerText.replace(/\\s+/g, " ") ?? null };
})`);

try {
  // Off camera, a throwaway pass: what the answer key says for the first three replies of the sample.
  await s.fresh();
  await click("start-demo"); await click("load-next"); await click("crit-save"); await click("fill-key");
  const plan = await b.js(`(() => { const p = JSON.parse(localStorage.getItem("lqsg.project")); return p.sample.ids.slice(0, 3).map((i) => [i, p.labels[i]]); })()`);
  facts.keyLabels = plan;

  // 1. Start: the whole page, the footer's link to the source, then the demo button.
  await s.fresh();
  await b.js(OVERLAYS);
  begin("start", "Before you trust an AI judge's scores, check it against your own labels.");
  const foot = `document.querySelector("footer.site-footer p.small")`;
  facts.footer = await text(foot);
  if (!/Source code on GitHub\.$/.test(facts.footer)) throw new Error(`the footer reads: ${facts.footer}`);
  await hold(1.2);
  // The start card and the whole footer in one view, then closer on the footer's sentence.
  const shell = span(PANEL, foot);
  await go(await aim(shell, 1040), 1.0);
  await pointAt(k("start-demo"), 0.7);
  await ring(k("start-demo"));
  await hold(1.0, true);
  await ringOff(); await curOff();
  const sentence = `(() => { const r = document.createRange(); r.selectNodeContents(${foot}); return r; })()`;
  const words = await box(sentence);
  if (words.h > 30) throw new Error("the footer sentence wraps");
  const footView = await aim(sentence, Math.max(900, Math.ceil(words.w + 56)));
  if (footView.crop.x > words.x - 12 || footView.crop.x + footView.crop.w < words.x + words.w + 12) throw new Error("the footer sentence doesn't fit the view");
  facts.footerView = { ...footView.crop, textFrom: words.x, textTo: words.x + words.w };
  await go(footView, 1.0);
  await ring(`document.querySelector("footer.site-footer p.small a")`, 4);
  await hold(1.5);
  await ringOff();
  await click("start-demo");
  await b.until(`document.querySelector("#mode-badge").textContent === "Demo"`, "the demo badge");

  // 2. Load
  const line = await text(`document.querySelector(".summary-line")`);
  const m = line.match(/^(\d+) loaded, (\d+) refused$/);
  if (!m) throw new Error(`unexpected summary line: ${line}`);
  facts.summaryLine = line;
  begin("load", `${m[1]} support replies loaded, ${m[2]} refused: nothing silently dropped.`);
  await jump(0); cam = { ...FULL };
  await hold(1.1);
  await go(await aim(span(`document.querySelector(".panel h2")`, `document.querySelector(".summary-line")`), 860, { top: 26 }), 1.0);
  await ring(`document.querySelector(".summary-line")`, 8);
  await hold(2.2, true);
  await ringOff();
  await go(await aim(`document.querySelector(".preview-row")`, 860, { top: 60 }), 1.2);
  await hold(1.4);
  await click("load-next");
  await s.heading("Write your criteria");

  // 3. Criteria
  const names = await b.js(`[...document.querySelectorAll('input[id^="c"][id$="-name"]')].map((e) => e.value)`);
  facts.criteria = names;
  if (names.length !== 4 || names.some((n) => !n)) throw new Error(`expected four filled criteria, saw ${JSON.stringify(names)}`);
  begin("criteria", `${WORDS[names.length][0].toUpperCase()}${WORDS[names.length].slice(1)} pass/fail criteria, each judging one thing.`);
  await place({ scroll: 0, crop: { x: 110, y: 0, w: 1060 } });
  await hold(0.8);
  await go(await aim(`document.querySelector(".crit-card")`, 840, { top: 14 }), 1.0);
  await hold(0.9, true);
  await go(await aim(`document.querySelectorAll(".crit-card")[3]`, 840, { top: 14 }), 1.6);
  await hold(0.7);
  await click("crit-save");
  await s.heading("Is this reply good?");
  await b.js(`document.activeElement.blur()`);

  // 4. Labelling: three replies by keyboard, with the answer key's own labels so later figures match a full answer-key run.
  begin("label", "Label a sample by hand, keyboard only.");
  await place({ scroll: 0, crop: { x: 110, y: 0, w: 1060 } });
  const counter = `document.querySelector('.panel p.small[aria-live]')`;
  facts.labelCounter = [await text(counter)];
  await hold(0.8);
  await ring(span(counter, `document.querySelector(".panel .progress")`), 8);
  await hold(1.0);
  await ringOff();
  const rows = () => aim(span(`document.querySelector(".panel .verdicts")`, `document.querySelector(".panel p.keys")`), 840, { top: 84 });
  const KEYS = { "accurate": ["1", "2"], "answers": ["3", "4"], "escalates": ["5", "6"], "tone": ["7", "8"] };
  await go(await rows(), 1.0);
  for (let i = 0; i < 3; i++) {
    if (i > 0) await place(await rows());
    await chip();
    await hold(0.5);
    const row = await text(counter);
    const id = row.match(/row (\d+)$/)[1];
    if (plan[i][0] !== `row-${id}`) throw new Error(`reply ${i + 1} is row ${id}, expected ${plan[i][0]}`);
    for (const [crit, pair] of Object.entries(KEYS)) {
      const v = plan[i][1][crit];
      await press(pair[v === "pass" ? 0 : 1]);
      await ring(k(`v-${crit}-${v}`), 4);
      await chip();
      await hold(0.38, i === 0 && crit === "tone");
    }
    await ringOff();
    facts.labelCounter.push(await text(counter));
    await hold(i === 2 ? 1.1 : 0.55);
    if (i < 2) { await press("Enter"); await sleep(80); }
  }
  await chipOff();
  // Off camera: the rest of the sample from the answer key and a first judge pass, then round after round
  // of labels until every reply is labelled. The last round's judge pass is left for the camera.
  await click("fill-key"); await click("lab-finish"); await click("run-start");
  await s.heading("How far can you trust the judge?");
  facts.rounds = [];
  for (let round = 1; ; round++) {
    const state = await readCards();
    const labelled = await b.js(`JSON.parse(localStorage.getItem("lqsg.project")).sample.ids.length`);
    facts.rounds.push({ labelled, undecided: state.filter((c) => c.pills.includes("Too wide to decide yet")).map((c) => c.name) });
    if (!(await b.js(`!!document.querySelector('[data-k^="more-"]')`))) throw new Error("the full run should end on the run screen, not here");
    if (round > 30) throw new Error("labelling never finished");
    await b.js(`document.querySelector('[data-k^="more-"]').click()`);
    await s.heading("Is this reply good?");
    await click("fill-key"); await click("lab-finish");
    await s.heading("Now the judge scores your labelled replies");
    const p = await b.js(`(() => { const p = JSON.parse(localStorage.getItem("lqsg.project")); return [p.sample.ids.length, p.rows.length]; })()`);
    if (p[0] === p[1]) break;
    await click("run-start");
    await s.heading("How far can you trust the judge?");
  }

  // 5. Calibrate
  begin("calibrate", "How often the judge agrees with you, measured on replies held back.");
  await place({ scroll: 0, crop: { ...FULL } });
  facts.runScreen = await b.js(`document.querySelector(".panel").innerText`);
  await hold(0.7);
  await go(await aim(PANEL, 900, { top: 16 }), 1.0);
  await pointAt(k("run-start"), 0.6);
  await hold(0.4);
  await curOff();
  await click("run-start");
  await s.heading("How far can you trust the judge?");
  facts.trustHelp = await text(`document.querySelector(".panel .help")`);
  if (!/held back/.test(facts.trustHelp)) throw new Error("the held-back sentence is missing");
  facts.good = await readCards();
  const undecided = facts.good.filter((c) => c.pills.includes("Too wide to decide yet")).map((c) => c.name);
  if (undecided.join() !== "Appropriate tone") throw new Error(`expected only tone undecided, saw ${undecided}`);
  if (facts.good.some((c) => !c.caught || !c.passed)) throw new Error("a criterion has no range");
  await place(await aim(span(`document.querySelector(".panel h2")`, `document.querySelector(".panel .help")`), 860, { top: 22 }));
  cut();
  await hold(0.7);
  await ring(`document.querySelector(".panel .help")`, 6);
  await hold(1.6);
  await ringOff();
  const figures = (i, j) => span(`${cardAt(i)}.querySelector(".card-head")`, `[...${cardAt(j)}.querySelectorAll("p.small")].find((p) => /kappa/.test(p.textContent))`);
  await go(await aim(figures(0, 1), 800), 1.2);
  await hold(2.5, true);
  await go(await aim(figures(2, 3), 800), 1.3);
  await hold(1.9);

  // 6. Disagreements
  begin("disagreements", "Every disagreement, with the judge's evidence marked in the reply.");
  const det = `document.querySelectorAll(".panel details.disagreements")[0]`;
  const sum = `${det}.querySelector("summary")`;
  await go(await aim(span(`${cardAt(0)}.querySelector(".rate")`, sum), 640), 1.1);
  await pointAt(sum, 0.6);
  await hold(0.4);
  await b.js(`${sum}.click()`);
  await b.until(`${det}.open`, "the disagreements to open");
  await curOff();
  facts.disagreements = await text(sum);
  const first = `${det}.querySelector(".disagreement")`;
  facts.firstDisagreement = await b.js(`${first}.innerText`);
  const mark = `${det}.querySelector("mark")`;
  if (!(await b.js(`!!${mark}`))) throw new Error("no quote is marked in the first disagreement");
  // The verdict line and the marked quote together, as large as they fit.
  const quoted = span(`${first}.querySelector("p")`, mark);
  const need = ((await box(quoted)).h + 56) * W / SAFE;
  facts.disagreementView = Math.round(clamp(need, 640, 960));
  await go(await aim(quoted, facts.disagreementView), 1.0);
  await hold(0.5);
  await ring(mark, 4);
  await hold(2.6, true);
  await ringOff();
  await go(await aim(`${det}.querySelector(".reason")`, 640), 1.0);
  await ring(`${det}.querySelector(".reason")`, 6);
  await hold(2.0);
  await ringOff();
  await b.js(`${det}.open = false`);

  // 7. Trust: three on the evidence, tone on thin evidence
  begin("trust", "Trust a criterion only when the evidence supports it, and say when it's thin.");
  const pillOf = (i, re) => `[...${cardAt(i)}.querySelectorAll(".pill")].find((p) => ${re}.test(p.textContent))`;
  const trustIt = async (id, i, label, re) => {
    if ((await text(k(`trust-${id}`))) !== label) throw new Error(`the ${id} button reads ${await text(k(`trust-${id}`))}`);
    await pointAt(k(`trust-${id}`), 0.5);
    await ring(k(`trust-${id}`), 5);
    await hold(0.35);
    await click(`trust-${id}`);
    await b.until(`!!${pillOf(i, re)}`, `${id} trusted`);
    await ring(pillOf(i, re), 5);
  };
  await place(await aim(span(cardAt(0), cardAt(1)), 1010, { top: 8 }));
  cut();
  await hold(0.5);
  await trustIt("accurate", 0, "Trust this criterion", "/^Trusted$/");
  await hold(0.6);
  await trustIt("answers", 1, "Trust this criterion", "/^Trusted$/");
  await hold(0.6);
  await ringOff(); await curOff();
  await go(await aim(span(cardAt(2), k("trust-escalates")), 1010, { top: 8 }), 1.1);
  await trustIt("escalates", 2, "Trust this criterion", "/^Trusted$/");
  await hold(0.5);
  await ringOff(); await curOff();
  await go(await aim(span(`${cardAt(3)}.querySelector(".notice")`, k("trust-tone")), 800), 1.0);
  facts.toneBefore = (await readCards())[3];
  await pointAt(k("trust-tone"), 0.5);
  await ring(k("trust-tone"), 5);
  await hold(0.6);
  await ringOff(); await curOff();
  await click("trust-tone");
  await b.until(`!!${pillOf(3, "/Trusted before the range narrowed/")}`, "tone marked as trusted on thin evidence");
  await go(await aim(span(`${cardAt(2)}.querySelector(".card-head")`, `${cardAt(3)}.querySelectorAll(".rate")[1]`), 800, { top: 20 }), 1.0);
  await ring(pillOf(3, "/Trusted before the range narrowed/"), 5);
  facts.trusted = await readCards();
  const want = ["Trusted", "Trusted", "Trusted", "Too wide to decide yet|Trusted before the range narrowed"];
  if (facts.trusted.map((c) => c.pills.join("|")).join() !== want.join()) throw new Error(`trust pills: ${JSON.stringify(facts.trusted.map((c) => c.pills))}`);
  await hold(2.2, true);
  await ringOff();
  // Kept for the side-by-side view in scene 9: the version 1 cards as the page drew them.
  await b.js(`window.__film.good = [...document.querySelectorAll(".panel .cards .card")].map((c) => c.cloneNode(true))`);
  await click("to-score");
  await s.heading("Score the rest");

  // 8. Results (the "Score the rest" screen is passed off camera: with every reply labelled it has nothing to run)
  facts.scoreScreen = await b.js(`document.querySelector(".panel").innerText`);
  if (!/nothing is sent and nothing is paid/.test(facts.scoreScreen)) throw new Error("the stored-results notice is missing");
  if (!/Everything is scored\./.test(facts.scoreScreen)) throw new Error("the score screen still has verdicts to fetch");
  await click("to-results");
  await s.heading("Results");
  facts.results = await b.js(`[...document.querySelectorAll(".panel .cards .card")].map((c) => c.innerText.replace(/\\s+/g, " ").trim())`);
  if (facts.results.length !== 4 || facts.results.some((r) => !/Passed \d+ of \d+ .*likely between \d+% and \d+%.*Withheld \d+ · Unclear \d+ · Errors \d+/.test(r))) throw new Error(`results cards: ${JSON.stringify(facts.results)}`);
  facts.resultsDecidedBy = await b.js(`(() => { const n = {}; for (const d of document.querySelectorAll("details.item summary")) { const w = d.textContent.match(/decided by (.+)$/)?.[1] ?? "not scored"; n[w] = (n[w] ?? 0) + 1; } return n; })()`);
  // The caption's claim, from the test set's answer key and from the cards on screen.
  const answerKey = Object.entries(JSON.parse(readFileSync(join(ROOT, "eval", "testset", "answer-key.json"), "utf8")).key);
  const fails = {};
  for (const [, row] of answerKey) for (const [c, v] of Object.entries(row.labels)) fails[c] = (fails[c] ?? 0) + (v === "fail" ? 1 : 0);
  const shown = facts.results.map((r) => r.match(/Passed (\d+) of (\d+)/).slice(1).map(Number));
  facts.answerKey = { replies: answerKey.length, failsPerCriterion: fails, cards: shown };
  const perCriterion = [...new Set(Object.values(fails))];
  const same = perCriterion.length === 1 && Object.keys(fails).length === 4 && shown.every(([k, n]) => n === answerKey.length && n - k === perCriterion[0]);
  begin("score", same ? `Same count by design: each criterion has ${perCriterion[0]} failing replies in the test set.` : "Results for all four criteria. Here, stored results: no API calls.");
  if (!same) console.log("CAPTION REWORDED: the answer key and the cards don't give one failure count per criterion", JSON.stringify(facts.answerKey));
  await place(await aim(span(`document.querySelector(".panel h2")`, `document.querySelector(".panel .help")`), 900, { top: 16 }));
  await hold(0.8);
  await go(await aim(span(cardAt(0), cardAt(3)), 860), 1.2);
  await hold(3.4, true);

  // 9. The headline finding: the deliberately vague criteria, judged on the same labels.
  await click("rail-criteria");
  await b.until(`/^Criteria, version 1$/.test(document.querySelector(".panel h2")?.textContent)`, "the criteria screen");
  begin("vague", "Vague criteria still catch the failures, but agreement with you collapses.");
  await place({ scroll: 0, crop: { x: 110, y: 0, w: 1060 } });
  facts.vagueButton = await text(k("demo-vague"));
  if (facts.vagueButton !== "Use the deliberately vague criteria") throw new Error(`the button reads ${facts.vagueButton}`);
  await hold(0.6);
  await pointAt(k("demo-vague"), 0.6);
  await ring(k("demo-vague"), 5);
  await hold(0.6);
  await click("demo-vague");
  await ringOff(); await curOff();
  facts.vagueCriteria = await b.js(`[...document.querySelectorAll(".crit-card")].map((c) => [c.querySelector("input").value, c.querySelector("textarea").value])`);
  // The whole first card, down to the page's own warning that the judge has less to go on.
  if (await b.js(`document.querySelector(".crit-card .notice-tip").hidden`)) throw new Error("the vague criterion shows no warning");
  const cardW = clamp(((await box(`document.querySelector(".crit-card")`)).h + 28) * W / SAFE, 840, 1000);
  await go(await aim(`document.querySelector(".crit-card")`, cardW), 1.0);
  await hold(1.1);
  // Off camera: save as version 2 and fetch its stored verdicts.
  await click("crit-save");
  await s.heading("Now the judge scores your labelled replies");
  await click("run-start");
  await s.heading("How far can you trust the judge?");
  facts.vagueLine = await b.js(`[...document.querySelectorAll(".panel p.small")].find((p) => /criteria version/.test(p.textContent)).innerText.replace(/\\s+/g, " ")`);
  if (!/criteria version 2/.test(facts.vagueLine)) throw new Error(`not version 2: ${facts.vagueLine}`);
  facts.vague = await readCards();
  // The caption's two claims, checked against the page.
  facts.vagueCheck = facts.vague.map((v, i) => ({ good: facts.good[i].name, vague: v.name, caughtGood: `${facts.good[i].caught.k}/${facts.good[i].caught.n}`, caughtVague: `${v.caught.k}/${v.caught.n}`, passedGood: `${facts.good[i].passed.k}/${facts.good[i].passed.n}`, passedVague: `${v.passed.k}/${v.passed.n}`, kappaGood: facts.good[i].kappa, kappaVague: v.kappa }));
  if (!facts.vague.every((v) => v.caught.k / v.caught.n >= 0.9)) throw new Error(`vague criteria don't catch the failures: ${JSON.stringify(facts.vagueCheck)}`);
  if (!facts.vague.every((v, i) => v.kappa < facts.good[i].kappa)) throw new Error(`kappa doesn't fall everywhere: ${JSON.stringify(facts.vagueCheck)}`);
  const worst = facts.vague.map((v, i) => facts.good[i].kappa - v.kappa).reduce((best, d, i, all) => (d > all[best] ? i : best), 0);
  facts.shownPair = facts.vagueCheck[worst];
  await place(await aim(span(`document.querySelector(".panel h2")`, `${cardAt(0)}.querySelector(".card-head")`), 900, { top: 16 }));
  cut();
  await hold(0.5);
  await ring(`[...document.querySelectorAll(".panel p.small")].find((p) => /criteria version/.test(p.textContent))`, 5);
  await hold(1.5);
  await ringOff();
  // The two versions of one criterion side by side: the page's own cards, copied as drawn (the good one was
  // copied from the version 1 screen earlier), without their buttons and fold-outs.
  await jump(0);
  await b.js(`(() => {
    const f = window.__film, col = (title, card) => {
      const c = card.cloneNode(true);
      for (const x of c.querySelectorAll("details, .row-actions, .notice")) x.remove();
      c.style.cssText = "width:400px;box-sizing:border-box;margin:0;background:#fff";
      const t = document.createElement("p");
      t.textContent = title; t.style.cssText = "font-size:19px;font-weight:700;margin:0 0 10px 4px";
      const d = document.createElement("div"); d.append(t, c); return d;
    };
    f.side.style.background = getComputedStyle(document.body).backgroundColor;
    f.side.replaceChildren(col("Good criteria", f.good[${worst}]), col("Vague criteria", document.querySelectorAll(".panel .cards .card")[${worst}]));
    f.side.style.display = "flex";
  })()`);
  const sideCard = (i) => `window.__film.side.querySelectorAll(".card")[${i}]`;
  facts.sideBySide = await b.js(`[...window.__film.side.children].map((d) => d.innerText.replace(/\\s+/g, " ").trim())`);
  const kap = (i) => `[...${sideCard(i)}.querySelectorAll("p.small")].find((p) => /kappa/.test(p.textContent))`;
  cam = (await aim(span(`window.__film.side.children[0]`, sideCard(1)), 920, { fixed: true })).crop;
  cut();
  await hold(1.6);
  await ring(kap(0), 5); await ring(kap(1), 5, "ring2");
  await hold(3.6, true);
  await ringOff();
  await b.js(`window.__film.side.style.display = "none"`);

  if (b.errors.length) throw new Error(`page errors: ${b.errors.join("; ")}`);
  s.guard();
  for (const sc of scenes) { sc.seconds = sc.items.reduce((n, i) => n + i.frames, 0) / FPS; widest = Math.max(widest, ...sc.focusWidths); }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ scenes, facts, network: s.summary() }, null, 1));
  console.log(scenes.map((sc) => `${sc.name} ${sc.seconds.toFixed(2)}s  ${sc.caption} (${sc.caption.length})  views ${[...new Set(sc.focusWidths)].join("/")}`).join("\n"));
  console.log("page total", scenes.reduce((n, sc) => n + sc.seconds, 0).toFixed(2), "stills", shots);
  console.log(JSON.stringify(facts, null, 1));
  console.log("network", JSON.stringify(s.summary()));
} finally {
  await s.close();
}
