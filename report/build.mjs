// Builds the findings report: report/template.html + report/data/findings.json -> report/index.html.
//   node report/build.mjs
// Every number in the page comes from findings.json through a placeholder, so none is typed by
// hand. Placeholders: {{pct path}} {{n path}} {{k path}} {{usd path}} {{text path}} {{block name}}.
// The build fails on an unknown placeholder or a missing value.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const F = JSON.parse(readFileSync(here("./data/findings.json"), "utf8"));

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
};
const CRIT = F.testSet.criteria.map((c) => c.id);
const NAME = Object.fromEntries(F.testSet.criteria.map((c) => [c.id, c.name]));
const VNAME = Object.fromEntries(F.testSet.vagueCriteria.map((c) => [c.id, c.name]));

// Kappa per criterion, good vs vague criteria: paired horizontal bars on one 0-1 scale.
function kappaChart() {
  const W = 640, rowH = 58, top = 34, left = 190, right = 56, H = top + rowH * CRIT.length + 26;
  const x = (v) => left + (W - left - right) * Math.max(0, v);
  const parts = [];
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) parts.push(`<line x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H - 22}" class="grid"/><text x="${x(t)}" y="${H - 6}" class="tick" text-anchor="middle">${t.toFixed(1)}</text>`);
  CRIT.forEach((c, i) => {
    const y = top + i * rowH, g = F.full.good.byCriterion[c].kappa, v = F.full.vague.byCriterion[c].kappa;
    parts.push(`<text x="${left - 12}" y="${y + 13}" class="lab" text-anchor="end">${esc(NAME[c])}</text>`);
    parts.push(`<text x="${left - 12}" y="${y + 33}" class="lab sub" text-anchor="end">vague: “${esc(VNAME[c])}”</text>`);
    parts.push(`<rect x="${left}" y="${y + 2}" width="${x(g) - left}" height="16" class="bar-good" rx="2"/><text x="${x(g) + 6}" y="${y + 15}" class="val">${g.toFixed(2)}</text>`);
    parts.push(`<rect x="${left}" y="${y + 22}" width="${Math.max(2, x(v) - left)}" height="16" class="bar-vague" rx="2"/><text x="${x(v) + 6}" y="${y + 35}" class="val">${v.toFixed(2)}</text>`);
  });
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="kchart-t"><title id="kchart-t">Agreement beyond chance (kappa) per criterion: clear criteria ${CRIT.map((c) => `${NAME[c]} ${F.full.good.byCriterion[c].kappa}`).join(", ")}; vague criteria ${CRIT.map((c) => `${VNAME[c]} ${F.full.vague.byCriterion[c].kappa}`).join(", ")}.</title>${parts.join("")}</svg>
<figcaption><span class="key key-good"></span>Clear criteria <span class="key key-vague"></span>Vague criteria · Agreement beyond chance (kappa) with the answer key, all ${fmt.n(F.full.replies)} replies. 1 is perfect agreement, 0 is no better than chance.</figcaption></figure>`;
}

// How many labels a trust decision needs: one row per label count, one cell per criterion.
function labelsTable() {
  const head = `<tr><th scope="col">Replies labelled</th>${CRIT.map((c) => `<th scope="col">${esc(NAME[c])}</th>`).join("")}</tr>`;
  const rows = F.labelsNeeded.map((r) => `<tr><th scope="row">${r.labels}</th>${CRIT.map((c) => {
    const x = r.byCriterion[c];
    return `<td class="${x.decidable ? "ok" : "no"}"><span class="cell-v">${x.decidable ? "Can decide" : "Too few"}</span><span class="cell-d">${x.caught} of ${x.heldBackFailures} held-back failures caught</span></td>`;
  }).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table class="grid-table">${head}${rows}</table></div>`;
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
${showReply ? `<p class="ex-who">Customer</p><p class="ex-text cust">${esc(e.customer)}</p><p class="ex-who">Reply being judged</p><p class="ex-text reply">${esc(e.reply)}</p>` : ""}
<div class="verdict"><p class="ex-crit">${esc(e.criterionName)}${e.set === "vague" ? " <span class=\"chip\">vague</span>" : ""} · answer key: ${keyWord} · judge: ${verdict}</p>
<p class="ex-quote">“${esc(e.quote)}”</p><p class="ex-reason">${esc(e.reason)}</p>${e.why ? `<p class="small">Quote check: ${esc(e.why)}</p>` : ""}</div></div>`;
}
function verdictOnly(name) { return example(name, { showReply: false }); }

const blocks = {
  kappaChart, labelsTable, modelsTable,
  exCaught: () => example("caught"), exMissed: () => example("missed"),
  exVague: () => example("vague"), exVagueHelpful: () => verdictOnly("vagueHelpful"), exVagueGood: () => verdictOnly("vagueGood"), exVagueGoodAccurate: () => verdictOnly("vagueGoodAccurate"),
  exWithheld: () => example("withheld"),
  injectionText: () => esc(F.examples.injection.text),
  blindDifferences: () => `<ul>${F.blind.differences.map((d) => `<li>${esc(NAME[d.criterion])}: you ${d.owner === "pass" ? "passed" : "failed"} it, the key ${d.key === "pass" ? "passes" : "fails"} it, the judge ${d.judge === "pass" ? "passed" : "failed"} it.</li>`).join("")}</ul>`,
};

const template = readFileSync(here("./template.html"), "utf8");
const out = template.replace(/\{\{(\w+) ([\w.]+)\}\}/g, (m, f, arg) => {
  if (f === "block") { if (!blocks[arg]) throw new Error(`unknown block ${arg}`); return blocks[arg](); }
  if (!fmt[f]) throw new Error(`unknown format ${f} in ${m}`);
  return fmt[f](get(arg));
});
if (/\{\{/.test(out)) throw new Error(`unfilled placeholder: ${out.match(/\{\{[^}]*\}\}/)[0]}`);
writeFileSync(here("./index.html"), out);
console.log(`report: ${(out.length / 1024).toFixed(0)} KB`);
