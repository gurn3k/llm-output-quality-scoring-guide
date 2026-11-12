// The findings report: no hand-typed figures, figures that match findings.json, and a page that
// renders cleanly in a real browser at phone and desktop widths, light and dark, normal and wide font.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handTypedNumbers } from "../report/numbers.mjs";
import { launch, SKIP } from "./harness.mjs";

const REPORT = fileURLToPath(new URL("../report/", import.meta.url));
const template = readFileSync(join(REPORT, "template.html"), "utf8");
const F = JSON.parse(readFileSync(join(REPORT, "data/findings.json"), "utf8"));

test("the template has no figures typed by hand", () => {
  assert.deepEqual(handTypedNumbers(template), []);
  // Shown failing: a typed figure, in text or next to a placeholder, is caught; fixed values aren't.
  assert.equal(handTypedNumbers("<p>It caught 189 of 196.</p>").length, 2);
  assert.equal(handTypedNumbers("<p>{{n a.b}} of 40 labels</p>").length, 1);
  assert.deepEqual(handTypedNumbers('<p>at least <span data-fixed>5</span> {{n a.b}}</p><!-- 12 -->'), []);
});

test("the built report quotes findings.json", () => {
  execFileSync(process.execPath, [join(REPORT, "build.mjs")], { stdio: "pipe" });
  const html = readFileSync(join(REPORT, "index.html"), "utf8");
  assert.doesNotMatch(html, /\{\{/);
  const g = F.full.good, v = F.full.vague;
  for (const s of [
    `caught ${g.caught.k} of ${g.caught.n} planted failures`,
    `${Math.round(g.rate * 100)}% of verdicts`,
    `(${v.caught.k} of ${v.caught.n})`,
    `fell to ${Math.round(v.rate * 100)}% (kappa ${v.kappa.toFixed(2)})`,
    `With ${F.labelsNeeded[0].labels} labelled replies`,
    `on ${F.blind.agree} of ${F.blind.labels} labels`,
    `$${F.spend.judgeTotal.toFixed(2)}`,
  ]) assert.ok(html.includes(s), `report should say "${s}"`);
});

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".mp4": "video/mp4" };
const PUBLIC = /^\/(?:index\.html|style\.css|media\/[a-z0-9-]+\.(?:svg|jpg|mp4))$/;

test("the report page in a real browser", { skip: SKIP }, async (t) => {
  execFileSync(process.execPath, [join(REPORT, "build.mjs")], { stdio: "pipe" });
  const server = createServer((req, res) => {
    const p = req.url === "/" ? "/index.html" : new URL(req.url, "http://x").pathname;
    if (!PUBLIC.test(p)) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { "content-type": TYPES[extname(p)] }).end(readFileSync(join(REPORT, p))); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const b = await launch();
  t.after(async () => { await b.close(); server.close(); });
  await b.open(`http://127.0.0.1:${server.address().port}/`);

  const broken = await b.js(`[...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src)`);
  assert.deepEqual(broken, [], "every image loads");
  assert.equal(await b.js(`document.querySelectorAll("figure.chart svg").length`), 2);
  assert.ok(await b.js(`!!document.querySelector('video source[src="media/walkthrough.mp4"]')`));
  for (const theme of ["light", "dark"]) {
    await b.scheme(theme);
    for (const width of [390, 1280]) {
      for (const wide of [false, true]) {
        await b.viewport(width);
        await b.wideFont(wide);
        assert.deepEqual(await b.overflow(), [], `report at ${width}px ${theme}${wide ? " wide font" : ""}`);
        if (!wide) await b.screenshot(`report-${width}-${theme}`);
      }
    }
  }
  assert.deepEqual(b.errors, [], "no console errors");
});
