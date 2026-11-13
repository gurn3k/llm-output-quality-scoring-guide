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
    `kappa ${F.models.opus.kappa.toFixed(2)} against ${F.models.sonnet.kappa.toFixed(2)}`,
    `${(F.models.opus.costPerReply / F.models.sonnet.costPerReply).toFixed(1)} times the cost per reply`,
    `${Math.round(F.scale.cacheShare * 100)}% of input tokens came from the cache`,
    `cost ${F.scale.cacheSaving.toFixed(1)} times as much`,
    `<td>${F.scale.labelsAt[2].labels.toLocaleString("en-US")}</td>`,
    `The ${F.scale.maxRows}-row limit`,
  ]) assert.ok(html.includes(s), `report should say "${s}"`);
  // Without scripts the page still has its static charts and table; the script-only parts start hidden.
  assert.equal((html.match(/<figure class="chart plate" data-static>/g) || []).length, 2);
  assert.match(html, /<div data-ix="labels"><div class="table-wrap">/);
  assert.equal((html.match(/class="ix-only" hidden/g) || []).length, 3);
  // The embedded data is JSON a script can't break out of.
  const data = html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(data, /</);
  assert.equal(JSON.parse(data).models.opus.costPerReply, F.models.opus.costPerReply);
});

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".woff2": "font/woff2" };
const PUBLIC = /^\/(?:index\.html|style\.css|interactive\.js|fonts\/[a-z0-9-]+\.woff2|media\/[a-z0-9-]+\.(?:svg|jpg|mp4))$/;

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
  assert.ok(await b.js(`!!document.querySelector('video source[src="media/walkthrough.mp4"]')`));
  // Every gurn3k logo links to gurn3k.com.
  assert.deepEqual(await b.js(`[...document.querySelectorAll("img.mark")].map((i) => i.closest("a")?.href ?? null)`), ["https://gurn3k.com/", "https://gurn3k.com/"]);

  // The script ran: the headline chart stays static, the other three pieces are interactive, and
  // the script-only sections are shown.
  assert.equal(await b.js(`document.querySelectorAll("figure.chart[data-static]").length`), 1);
  assert.deepEqual(await b.js(`[...document.querySelectorAll("[data-ix-chart]")].map((n) => n.dataset.ixChart)`), ["explorer", "labels", "picker"]);
  assert.equal(await b.js(`document.querySelectorAll(".ix-only[hidden]").length`), 0);
  const q = (sel, all = false) => `[...document.querySelectorAll(${JSON.stringify(sel)})]${all ? "" : "[0]"}`;
  const text = (sel) => b.js(`${q(sel)}.textContent`);
  const fire = (sel, value, ev) => b.js(`{ const n = ${q(sel)}; ${value === undefined ? "n.click()" : `n.value = ${JSON.stringify(String(value))}; n.dispatchEvent(new Event("${ev}", { bubbles: true }))`}; }`);
  const crit = F.testSet.criteria;

  // Explorer: kappa first, then agreement, then wrongly failed, each from findings.json.
  const vals = () => b.js(`${q("[data-ix-chart=explorer] .bval", true)}.map((n) => n.textContent)`);
  assert.deepEqual(await vals(), crit.flatMap((c) => [F.full.good.byCriterion[c.id].kappa.toFixed(2), F.full.vague.byCriterion[c.id].kappa.toFixed(2)]));
  await b.js(`{ const n = document.querySelector('[data-ix-chart=explorer] input[value=rate]'); n.checked = true; n.dispatchEvent(new Event("change", { bubbles: true })); }`);
  assert.deepEqual(await vals(), crit.flatMap((c) => [F.full.good.byCriterion[c.id].rate, F.full.vague.byCriterion[c.id].rate].map((v) => `${Math.round(v * 100)}%`)));
  await b.js(`{ const n = document.querySelector('[data-ix-chart=explorer] input[value=over]'); n.checked = true; n.dispatchEvent(new Event("change", { bubbles: true })); }`);
  assert.deepEqual(await vals(), crit.flatMap((c) => [String(F.full.good.byCriterion[c.id].overFailed), String(F.full.vague.byCriterion[c.id].overFailed)]));

  // Labels slider: each step says how many criteria can be decided, as in findings.json.
  for (const [i, s] of F.labelsNeeded.entries()) {
    await fire("[data-ix-chart=labels] input[type=range]", i, "input");
    const ok = crit.filter((c) => s.byCriterion[c.id].decidable).length;
    assert.match(await text("[data-ix-chart=labels] .ix-out"), new RegExp(`^${s.labels} replies labelled.*: ${ok} of 4 criteria can be decided`));
    assert.equal(await b.js(`document.querySelectorAll("[data-ix-chart=labels] .lrow.ok").length`), ok);
  }

  // Picker: the default bars pick the chosen model; dropping the safety bar picks the cheapest;
  // adding the stricter kappa bar on top of the defaults picks the most expensive.
  const pick = () => b.js(`document.querySelector("[data-ix-chart=picker] .is-pick .mname strong")?.textContent ?? null`);
  assert.equal(await pick(), F.models[F.chosen].label);
  const visibleChips = () => b.js(`[...document.querySelectorAll("[data-ix-chart=picker] .chip.pick")].filter((n) => n.offsetParent !== null).length`);
  assert.equal(await visibleChips(), 1);
  assert.match(await text("[data-ix-chart=picker] .ix-out"), new RegExp(`\\$${(F.models.sonnet.costPerReply * 10000).toFixed(2)} a month`));
  await fire("[data-ix-chart=picker] .check:nth-of-type(3) input");
  assert.equal(await pick(), F.models.haiku.label);
  await fire("[data-ix-chart=picker] .check:nth-of-type(3) input");
  await fire("[data-ix-chart=picker] .check:nth-of-type(4) input");
  assert.equal(await pick(), F.models.opus.label);
  assert.equal(await visibleChips(), 1);
  await fire("[data-ix-chart=picker] .vol input", 3, "input");
  assert.match(await text("[data-ix-chart=picker] .vol output"), /^1,000,000 replies a month$/);

  // Quiz: one reply at a time; the reveal states the key and the judge, and the score counts the
  // judge's real matches.
  const shown = () => b.js(`[...document.querySelectorAll(".q-card")].map((n) => !n.hidden)`);
  assert.deepEqual(await shown(), [true, false, false]);
  for (let i = 0; i < 3; i++) {
    await b.js(`document.querySelectorAll(".q-card")[${i}].querySelector(".q-fail").click()`);
    assert.ok(await b.js(`!document.querySelectorAll(".q-card")[${i}].querySelector(".q-result").hidden`));
    assert.equal(await b.js(`document.querySelectorAll(".q-card")[${i}].querySelectorAll(".q-mark.on").length`), 1, "the judge's quote is marked in the reply");
    if (i < 2) {
      await b.js(`document.querySelectorAll(".q-card")[${i}].querySelector(".q-next").click()`);
      assert.deepEqual(await shown(), [0, 1, 2].map((j) => j === i + 1));
    } else assert.equal(await b.js(`document.querySelectorAll(".q-card")[2].querySelector(".q-next")`), null);
  }
  assert.match(await text(".quiz > .ix-out"), /^You matched the answer key on 2 of 3\. The AI judge matched it on 2 of 3\.$/);
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
