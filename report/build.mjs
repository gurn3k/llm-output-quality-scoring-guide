// Builds the findings report: report/template.html + report/data/findings.json -> report/index.html.
//   node report/build.mjs
// Every number in the page comes from findings.json through a placeholder, so none is typed by
// hand. Placeholders: {{pct path}} {{n path}} {{k path}} {{usd path}} {{text path}} {{block name}}.
// The build fails on an unknown placeholder or a missing value.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handTypedNumbers } from "./numbers.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const F = JSON.parse(readFileSync(here("./data/findings.json"), "utf8"));
// Ratios the conclusion quotes, worked out here from findings.json rather than typed.
F.derived = {
  opusVsSonnet: F.models.opus.costPerReply / F.models.sonnet.costPerReply,
  sonnetVsHaiku: F.models.sonnet.costPerReply / F.models.haiku.costPerReply,
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function get(path) {
  const v = path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), F);
  if (v === undefined || v === null) throw new Error(`findings.json has no value at ${path}`);
  return v;
}
const fmt = {
  pct: (v) => `${Math.round(v * 100)}%`,
  pct1: (v) => `${(v * 100).toFixed(1)}%`,
  n: (v) => Number(v).toLocaleString("en-US"),
  k: (v) => Number(v).toFixed(2),
  usd: (v) => `$${Number(v).toFixed(2)}`,
  usd3: (v) => `$${Number(v).toFixed(3)}`,
  text: (v) => esc(v),
  times: (v) => `${v < 10 ? Number(v).toFixed(1) : Math.round(v)} times`,
};
const CRIT = F.testSet.criteria.map((c) => c.id);
const NAME = Object.fromEntries(F.testSet.criteria.map((c) => [c.id, c.name]));
const VNAME = Object.fromEntries(F.testSet.vagueCriteria.map((c) => [c.id, c.name]));

// Static paired-bar charts: labels and values are HTML text, so they stay full size at any width;
// only the bars are SVG (attributes, not inline styles, so the page's style policy still holds).
// interactive.js swaps the kappa chart for its explorer; these are what a reader sees without scripts.
function bar(cls, frac, text, who) {
  const w = Math.max(0.5, Math.min(1, frac) * 100).toFixed(2);
  return `<div class="btrack"><svg class="sbar" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="16"/><rect class="${cls}" width="${w}" height="16"/></svg><span class="bvalwrap"><span class="sr">${who}: </span><span class="bval">${text}</span></span></div>`;
}
function pairRow(label, sub, good, vague) {
  return `<div class="brow"><div class="blab"><strong>${esc(label)}</strong>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</div><div class="bpair">${bar("bar-good", ...good, "Clear criteria")}${bar("bar-vague", ...vague, "Vague criteria")}</div></div>`;
}
const keyLine = `<span class="key key-good"></span>Clear criteria <span class="key key-vague"></span>Vague criteria`;

// Kappa per criterion, clear vs vague criteria, on one 0-1 scale.
function kappaChart() {
  const rows = CRIT.map((c) => {
    const g = F.full.good.byCriterion[c].kappa, v = F.full.vague.byCriterion[c].kappa;
    return pairRow(NAME[c], `vague: “${VNAME[c]}”`, [g, fmt.k(g)], [v, fmt.k(v)]);
  }).join("");
  return `<figure class="chart plate" data-static><div class="bars">${rows}</div>
<figcaption>${keyLine} · Agreement beyond chance (kappa) with the answer key, all ${fmt.n(F.full.replies)} replies. 1 is perfect agreement, 0 is no better than chance.</figcaption></figure>`;
}

// The headline: catch rate barely moves with vague criteria; agreement falls.
function catchAgreeChart() {
  const g = F.full.good, v = F.full.vague;
  const rows = [
    pairRow("Planted failures caught", "", [g.caught.k / g.caught.n, fmt.pct(g.caught.k / g.caught.n)], [v.caught.k / v.caught.n, fmt.pct(v.caught.k / v.caught.n)]),
    pairRow("Agreement with the key", "", [g.agree / g.n, fmt.pct(g.agree / g.n)], [v.agree / v.n, fmt.pct(v.agree / v.n)]),
  ].join("");
  return `<figure class="chart plate" data-static><div class="bars">${rows}</div><p class="sr">Clear criteria: ${m2s(g)}. Vague criteria: ${m2s(v)}.</p>
<figcaption>${keyLine} · All ${fmt.n(F.full.replies)} replies, judged by ${esc(F.models[F.chosen].label)}. Catch rate counts only the planted failures; agreement counts every verdict, so it also counts failing replies the answer key passes.</figcaption></figure>`;
}
const m2s = (m) => `caught ${m.caught.k} of ${m.caught.n} planted failures, agreed with the answer key on ${m.agree} of ${m.n} verdicts`;

// How many labels a trust decision needs: one row per label count, one cell per criterion.
function labelsTable() {
  const head = `<tr><th scope="col">Replies labelled</th>${CRIT.map((c) => `<th scope="col">${esc(NAME[c])}</th>`).join("")}</tr>`;
  const rows = F.labelsNeeded.map((r) => `<tr><th scope="row">${r.labels}</th>${CRIT.map((c) => {
    const x = r.byCriterion[c];
    return `<td class="${x.decidable ? "ok" : "no"}"><span class="cell-v">${x.decidable ? "Can decide" : "Too few"}</span><span class="cell-d">${x.caught} of ${x.heldBackFailures} caught</span></td>`;
  }).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table class="grid-table"><caption>Each cell: whether the criterion can be decided, and how many of its held-back failures the judge caught.</caption>${head}${rows}</table></div>`;
}

function modelsTable() {
  const order = ["haiku", "sonnet", "opus"];
  const row = (label, f) => `<tr><th scope="row">${label}</th>${order.map((m) => `<td>${f(F.models[m], m)}</td>`).join("")}</tr>`;
  return `<div class="table-wrap"><table class="models"><tr><th></th>${order.map((m) => `<th scope="col">${esc(F.models[m].label)}${m === F.chosen ? ' <span class="chip">chosen</span>' : ""}</th>`).join("")}</tr>
${row("Planted failures caught", (x) => `${x.caught.k} of ${x.caught.n}`)}
${row("Clean replies passed", (x) => `${x.cleanPassed.k} of ${x.cleanPassed.n}`)}
${row("Agreement beyond chance (kappa)", (x) => x.kappa.toFixed(2))}
${row("Verdicts changed by a planted instruction", (x) => `<span class="${x.flips.length ? "bad" : ""}">${x.flips.length} of ${x.injectionPairs}</span>`)}
${row("Cost per reply, 4 criteria", (x) => `$${x.costPerReply.toFixed(4)}`)}
</table></div>`;
}

function example(name, { showReply = true } = {}) {
  const e = get(`examples.${name}`);
  const verdict = e.verdict === "withheld" ? `<span class="v v-withheld">Withheld</span> <span class="small">(the judge said ${esc(e.judgeSaid)})</span>` : `<span class="v v-${e.verdict}">${e.verdict === "pass" ? "Pass" : "Fail"}</span>`;
  const keyWord = e.key === "pass" ? "pass" : "fail";
  return `<div class="ex">
${showReply ? `<details class="ex-full"><summary>Show the customer's message and the reply</summary><p class="ex-who">Customer</p><p class="ex-text cust">${esc(e.customer)}</p><p class="ex-who">Reply being judged</p><p class="ex-text reply">${esc(e.reply)}</p></details>` : ""}
<div class="verdict"><p class="ex-crit">${esc(e.criterionName)}${e.set === "vague" ? " <span class=\"chip\">vague</span>" : ""} · answer key: ${keyWord} · judge: ${verdict}</p>
<p class="ex-quote">“${esc(e.quote)}”</p><p class="ex-reason">${esc(e.reason)}</p>${e.why ? `<p class="small">Quote check: ${esc(e.why)}</p>` : ""}</div></div>`;
}
function verdictOnly(name) { return example(name, { showReply: false }); }

// The data the interactive pieces (report/interactive.js) draw from: a subset of findings.json,
// embedded as a JSON data block so the page still makes no request beyond its own files.
// BARS are the model bars fixed before the runs (docs/PRD.md); RULE is the "can decide" rule.
const BARS = { caught: 0.8, clean: 0.85, kappaOptional: 0.9 };
const RULE = { minFailures: 5, maxWidth: 0.3 };
function ixData() {
  const pick = (m) => ({ label: m.label, caught: m.caught, cleanPassed: m.cleanPassed, kappa: m.kappa, flips: m.flips.length, injectionPairs: m.injectionPairs, costPerReply: m.costPerReply });
  const quiz = [
    ["caught", F.examples.caught.note],
    ["missed", F.examples.missed.note],
    ["vagueGood", `This reply gets the return window wrong, but that belongs to “${NAME.accurate}”. This criterion asks only whether the case should go to a specialist, and a change-of-mind return shouldn't.`],
  ].map(([k, note]) => {
    const e = F.examples[k];
    const def = F.testSet.criteria.find((c) => c.id === e.criterion).pass;
    return { criterion: e.criterionName, definition: def, customer: e.customer, reply: e.reply, key: e.key, judge: e.verdict, quote: e.quote, reason: e.reason, note };
  });
  const D = {
    criteria: F.testSet.criteria.map((c) => ({ id: c.id, name: c.name, vague: VNAME[c.id] })),
    good: F.full.good.byCriterion, vague: F.full.vague.byCriterion, replies: F.full.replies,
    labelsNeeded: F.labelsNeeded, rule: RULE, bars: BARS, chosen: F.chosen,
    models: { haiku: pick(F.models.haiku), sonnet: pick(F.models.sonnet), opus: pick(F.models.opus) },
    quiz,
  };
  return `<script type="application/json" id="report-data">${JSON.stringify(D).replace(/</g, "\\u003c")}</script>`;
}

const blocks = {
  kappaChart, catchAgreeChart, labelsTable, modelsTable, ixData,
  exCaught: () => example("caught"), exMissed: () => example("missed"),
  exVague: () => example("vague"), exVagueHelpful: () => verdictOnly("vagueHelpful"), exVagueGood: () => verdictOnly("vagueGood"), exVagueGoodAccurate: () => verdictOnly("vagueGoodAccurate"),
  exWithheld: () => example("withheld"),
  injectionText: () => esc(F.examples.injection.text),
  blindDifferences: () => `<details class="ex-full"><summary>Show the ${F.blind.differences.length} disagreements</summary><ul>${F.blind.differences.map((d) => `<li>${esc(NAME[d.criterion])}: I ${d.owner === "pass" ? "passed" : "failed"} it, the answer key ${d.key === "pass" ? "passes" : "fails"} it, and the judge ${d.judge === "pass" ? "passed" : "failed"} it.</li>`).join("")}</ul></details>`,
};

const template = readFileSync(here("./template.html"), "utf8");
// A figure typed into the template instead of coming from findings.json stops the build.
const typed = handTypedNumbers(template);
if (typed.length) throw new Error(`numbers typed by hand in report/template.html (use a placeholder, or <span data-fixed> for a fixed rule):\n  ${typed.join("\n  ")}`);
const out = template.replace(/\{\{(\w+) ([\w.]+)\}\}/g, (m, f, arg) => {
  if (f === "block") { if (!blocks[arg]) throw new Error(`unknown block ${arg}`); return blocks[arg](); }
  if (!fmt[f]) throw new Error(`unknown format ${f} in ${m}`);
  return fmt[f](get(arg));
});
if (/\{\{/.test(out)) throw new Error(`unfilled placeholder: ${out.match(/\{\{[^}]*\}\}/)[0]}`);
writeFileSync(here("./index.html"), out);
console.log(`report: ${(out.length / 1024).toFixed(0)} KB`);
