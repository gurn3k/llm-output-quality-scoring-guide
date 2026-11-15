// The findings report: no hand-typed figures, figures that match findings.json, and a page that
// renders cleanly in a real browser at phone and desktop widths, light and dark, normal and wide font.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

// Found by the independent review: the total left out a stopped paid run and added rounded parts.
test("the judge spend counts every paid run file, rounded once", () => {
  const runs = fileURLToPath(new URL("../eval/runs/", import.meta.url));
  const files = readdirSync(runs).filter((f) => f.endsWith(".json"));
  const total = files.reduce((s, f) => s + (JSON.parse(readFileSync(join(runs, f), "utf8")).spent ?? 0), 0);
  assert.ok(files.includes("full-opus-vague-original.json"), "the Opus vague run, once stopped for credit, is counted");
  assert.equal(F.spend.judgeTotal, Math.round(total * 100) / 100);
});

// A comparison resting on an unfinished run must not build.
test("the build refuses when a run behind the vague-criteria comparison is unfinished", () => {
  const dir = mkdtempSync(join(tmpdir(), "report-build-"));
  try {
    for (const f of ["build.mjs", "numbers.mjs", "template.html"]) cpSync(join(REPORT, f), join(dir, f));
    mkdirSync(join(dir, "data"));
    const partial = structuredClone(F);
    partial.vagueByModel.opus = { complete: false, pairs: 33 };
    writeFileSync(join(dir, "data/findings.json"), JSON.stringify(partial));
    assert.throws(() => execFileSync(process.execPath, [join(dir, "build.mjs")], { stdio: "pipe" }), /opus vague-criteria run isn't complete/);
    assert.ok(!existsSync(join(dir, "index.html")), "nothing is written");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the build refuses a template with a figure typed by hand", () => {
  const dir = mkdtempSync(join(tmpdir(), "report-build-"));
  try {
    for (const f of ["build.mjs", "numbers.mjs"]) cpSync(join(REPORT, f), join(dir, f));
    cpSync(join(REPORT, "data"), join(dir, "data"), { recursive: true });
    writeFileSync(join(dir, "template.html"), template.replace("</main>", "<p>It caught 189 of 196.</p></main>"));
    assert.throws(() => execFileSync(process.execPath, [join(dir, "build.mjs")], { stdio: "pipe" }), /numbers typed by hand[\s\S]*189 of 196/);
    assert.ok(!existsSync(join(dir, "index.html")), "nothing is written");
    writeFileSync(join(dir, "template.html"), template);
    execFileSync(process.execPath, [join(dir, "build.mjs")], { stdio: "pipe" });
    assert.ok(existsSync(join(dir, "index.html")), "the real template builds");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the built report quotes findings.json", () => {
  execFileSync(process.execPath, [join(REPORT, "build.mjs")], { stdio: "pipe" });
  const html = readFileSync(join(REPORT, "index.html"), "utf8");
  assert.doesNotMatch(html, /\{\{/);
  const g = F.full.good, v = F.full.vague;
  for (const s of [
    `caught ${g.caught.k} of ${g.caught.n} planted failures`,
    `on ${Math.round(g.rate * 100)}% of verdicts`,
    `still caught ${v.caught.k} of ${v.caught.n}`,
    `it also failed ${v.overFailed} verdicts that should have passed`,
    `agreement with the answer key fell from ${Math.round(g.rate * 100)}% to ${Math.round(v.rate * 100)}%`,
    `<b>${v.overFailed}</b><small>wrongly failed</small>`,
    `${F.labelsNeeded[0].labels} hand-labelled replies couldn't show`,
    `It took ${F.labelsNeeded[2].labels} to trust three of the four`,
    `held back only ${F.labelsNeeded[0].heldBack} replies`,
    `agreed with the answer key on ${Math.round(F.vagueByModel.opus.vague.rate * 100)}% of verdicts, against ${Math.round(F.vagueByModel.sonnet.vague.rate * 100)}% for ${F.vagueByModel.sonnet.label}`,
    `on ${F.blind.agree} of ${F.blind.labels} labels`,
    `$${F.spend.judgeTotal.toFixed(2)}`,
    `kappa ${F.models.opus.kappa.toFixed(2)} against ${F.models.sonnet.kappa.toFixed(2)}`,
    `${(F.models.opus.costPerReply / F.models.sonnet.costPerReply).toFixed(1)} times the cost per reply`,
    `${Math.round(F.scale.cacheShare * 100)}% of input tokens came from the cache`,
    `cost ${F.scale.cacheSaving.toFixed(1)} times as much`,
    `<td>${F.scale.labelsAt[2].labels.toLocaleString("en-US")}</td>`,
    `The ${F.scale.maxRows}-row limit`,
    `It reached ${F.vagueByModel.opus.vague.kappa.toFixed(2)}, against ${F.vagueByModel.sonnet.vague.kappa.toFixed(2)} for ${F.vagueByModel.sonnet.label}`,
    `kappa of at least ${F.rescueKappa.toFixed(2)}`,
    `Findings from ${F.totalVerdicts.toLocaleString("en-US")} verdicts`,
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

// The README's figures are typed (a README can't be built), so this checks each against findings.json,
// and fails on any number in its findings that it can't account for.
export function readmeFigures(readme, F) {
  const g = F.full.good, v = F.full.vague;
  const decidable = (r) => Object.values(r.byCriterion).filter((x) => x.decidable).length;
  const firstOk = F.labelsNeeded.find((r) => decidable(r) > 0 && decidable(r) === Math.max(...F.labelsNeeded.map(decidable)));
  const words = ["no", "one", "two", "three", "four"];
  const expected = [
    `graded ${F.full.replies} customer support replies`,
    `caught ${g.caught.k} of ${g.caught.n} planted failures`,
    `on ${Math.round(g.rate * 100)}% of verdicts (kappa ${g.kappa.toFixed(2)})`,
    `stayed high (${v.caught.k} of ${v.caught.n})`,
    `fell to ${Math.round(v.rate * 100)}% (kappa ${v.kappa.toFixed(2)})`,
    `failed ${v.overFailed} verdicts the key passes`,
    `With ${F.labelsNeeded[0].labels} labelled replies, ${words[decidable(F.labelsNeeded[0])]} criterion`,
    `took ${firstOk.labels} before ${words[decidable(firstOk)]} of the four`,
    `cost $${F.spend.judgeTotal.toFixed(2)}`,
    `the ${F.testSet.replies} replies plus ${F.testSet.injections} prompt-injection replies`,
    `on the ${F.vagueByModel.opus.replies} replies used to compare models, ${F.vagueByModel.opus.label} reached kappa ${F.vagueByModel.opus.vague.kappa.toFixed(2)} on vague criteria, against ${F.vagueByModel.sonnet.vague.kappa.toFixed(2)} for ${F.vagueByModel.sonnet.label}`,
  ];
  const missing = expected.filter((s) => !readme.includes(s));
  const section = readme.slice(0, readme.indexOf("## Walkthrough"));
  const allowed = new Set(expected.join(" ").match(/\d[\d.,]*\d|\d/g));
  const stray = (section.match(/(?<![\w/.-])\d[\d.,]*\d(?![\w/])|(?<![\w/.-])\d(?![\w/.])/g) ?? []).filter((n) => !allowed.has(n.replace(/[.,]$/, "")));
  return { missing, stray };
}

test("the README's figures match findings.json", () => {
  const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
  assert.deepEqual(readmeFigures(readme, F), { missing: [], stray: [] });
  // Shown failing: a stale figure, and an extra number nobody checks.
  assert.ok(readmeFigures(readme.replace("caught 189 of 196", "caught 188 of 196"), F).missing.length);
  assert.deepEqual(readmeFigures(readme.replace("## Three findings", "## Three findings\n\nAbout 3,000 calls."), F).stray, ["3,000"]);
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
  // With no bars ticked it doesn't claim a model "clears your bars" (found by the adversarial pass).
  for (const n of [1, 2, 3, 4]) await fire(`[data-ix-chart=picker] .check:nth-of-type(${n}) input`);
  assert.equal(await b.js(`[...document.querySelectorAll("[data-ix-chart=picker] .check input")].filter((c) => c.checked).length`), 0);
  assert.match(await text("[data-ix-chart=picker] .ix-out"), new RegExp(`^No bars ticked, so nothing rules a model out\\. The cheapest is ${F.models.haiku.label}`));

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
    // Phone and desktop, the smallest phone, and either side of every breakpoint in style.css.
    for (const width of [320, 390, 399, 401, 759, 761, 999, 1001, 1280]) {
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
