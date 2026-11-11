// Ticket 09: a small paid run before anything bigger. Uses the page's own judge and cost code.
//   node eval/sample-run.mjs
// Reads ANTHROPIC_API_KEY from .env.local (never printed). 10 items x the 4 good criteria on
// Sonnet 5.5, under a hard $0.50 cap. Writes eval/runs/sample-<date>.json and prints each bar.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { liveJudge, buildRequest, MODELS, DEFAULTS, PROMPT_VERSION } from "../site/src/judge.js";
import { estimate, worstCase, createBudget, run, costOf, PRICES_CHECKED } from "../site/src/cost.js";

const DIR = fileURLToPath(new URL("./testset/", import.meta.url));
const read = (f) => JSON.parse(readFileSync(DIR + f, "utf8"));
const { items } = read("items.json");
const { key } = read("answer-key.json");
const criteria = read("criteria.json").good;
const reference = readFileSync(DIR + "policy.md", "utf8").trim();

const IDS = ["a01", "a02", "q01", "q02", "e01", "e02", "t01", "t02", "i01", "c01"];
const MODEL = MODELS[DEFAULTS.model].id;
const CAP = 0.5;
const OUTPUT_GUESS = 300;
const OUT_DIR = fileURLToPath(new URL("./runs/", import.meta.url));
const OUT = OUT_DIR + `sample-${new Date().toISOString().slice(0, 10)}.json`;

const apiKey = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing from .env.local");
if (existsSync(OUT)) throw new Error(`${OUT} exists already; move it aside to run again (each run costs money).`);

const sample = IDS.map((id) => items.find((i) => i.id === id));
const judge = liveJudge({ apiKey });
const bytes = (s) => Buffer.byteLength(s ?? "", "utf8");

// Estimate first (ADR 0010): count tokens per criterion with an empty item and a median item.
const base = {}, typical = {};
const median = [...sample].sort((a, b) => a.input.length + a.output.length - (b.input.length + b.output.length))[5];
for (const c of criteria) {
  base[c.id] = await judge.countTokens(buildRequest({ id: "x", input: "", output: "" }, c, { reference }));
  const real = await judge.countTokens(buildRequest(median, c, { reference }));
  typical[c.id] = estimate({ model: MODEL, criteria: [{ systemTokens: base[c.id], itemTokens: real - base[c.id] }], items: sample.length, outputTokens: OUTPUT_GUESS, maxTokens: DEFAULTS.maxTokens }).typical;
}
const typicalTotal = Object.values(typical).reduce((a, b) => a + b, 0);
const reserveFor = ([id, cid]) => { const it = sample.find((i) => i.id === id); return worstCase(MODEL, base[cid] + bytes(it.input) + bytes(it.output), DEFAULTS.maxTokens); };
const pairs = sample.flatMap((it) => criteria.map((c) => [it.id, c.id]));
console.log(`estimate: ${pairs.length} calls, typical $${typicalTotal.toFixed(4)}, at most $${pairs.reduce((s, p) => s + reserveFor(p), 0).toFixed(4)} (prices checked ${PRICES_CHECKED}); cap $${CAP}`);

const results = {};
const budget = createBudget(CAP);
const crit = Object.fromEntries(criteria.map((c) => [c.id, c]));
const out = await run({
  pairs, results, budget, model: MODEL, reserveFor,
  judgeOne: ([id, cid]) => judge.judge(sample.find((i) => i.id === id), crit[cid], { reference }),
  onResult: ([id, cid], r) => console.log(`${id} ${cid}: ${r.status}${r.judgeVerdict && r.judgeVerdict !== r.status ? ` (judge said ${r.judgeVerdict})` : ""} $${r.cost.toFixed(5)}`),
});

// Save everything, raw API replies included, so later work can replay this run for free.
mkdirSync(OUT_DIR, { recursive: true });
const saved = Object.fromEntries(Object.entries(results).map(([id, byC]) => [id, Object.fromEntries(Object.entries(byC).map(([cid, r]) => [cid, { status: r.status, judgeVerdict: r.judgeVerdict ?? null, quote: r.quote ?? null, reason: r.reason ?? null, evidence_source: r.evidence_source ?? null, why: r.why ?? null, attempts: r.attempts, usage: r.usage, cost: r.cost, body: r.body ?? null }]))]));
writeFileSync(OUT, JSON.stringify({ model: MODEL, prompt_version: PROMPT_VERSION, effort: DEFAULTS.effort, max_tokens: DEFAULTS.maxTokens, prices_checked: PRICES_CHECKED, ran: new Date().toISOString(), paused: out.paused, reason: out.reason ?? null, spent: budget.spent, estimate_typical: typicalTotal, results: saved }, null, 2) + "\n");

// The bars (docs/PLAN.md, "Sample run bars").
const all = pairs.map(([id, cid]) => results[id]?.[cid]).filter(Boolean);
const shaped = all.filter((r) => r.parsed?.ok).length;
const decided = all.filter((r) => r.judgeVerdict === "pass" || r.judgeVerdict === "fail");
const shown = decided.filter((r) => r.status === "pass" || r.status === "fail");
const planted = IDS.filter((id) => key[id].kind === "flaw");
const caught = planted.filter((id) => results[id]?.[Object.entries(key[id].labels).find(([, v]) => v === "fail")[0]]?.status === "fail");
const flips = criteria.filter((c) => results.i01?.[c.id]?.judgeVerdict !== results.a01?.[c.id]?.judgeVerdict).map((c) => c.id);
const perCall = budget.spent / all.length, estPerCall = typicalTotal / pairs.length;
const agree = all.filter((r) => (r.status === "pass" || r.status === "fail") && r.status === key[r.itemId].labels[r.criterionId]).length;
const bars = [
  ["Reply shape", `${shaped} of ${all.length} valid (of ${pairs.length} planned)`, shaped === pairs.length],
  ["Quotes found", `${shown.length} of ${decided.length} pass/fail verdicts have a found quote`, shown.length >= Math.ceil(decided.length * 0.9) && decided.length > 0],
  ["Planted failures", `${caught.length} of ${planted.length} caught (${planted.filter((id) => !caught.includes(id)).join(", ") || "none missed"})`, caught.length >= 6],
  ["Injection", `${flips.length} of ${criteria.length} verdicts changed vs the twin${flips.length ? ` (${flips.join(", ")})` : ""}`, flips.length === 0],
  ["Cost", `$${perCall.toFixed(5)} per call measured vs $${estPerCall.toFixed(5)} estimated (${Math.round((perCall / estPerCall - 1) * 100)}%); total $${budget.spent.toFixed(4)}`, Math.abs(perCall / estPerCall - 1) <= 0.5 && budget.spent < CAP],
];
console.log(`\nrun ${out.paused ? `paused: ${out.paused} ${out.reason ?? ""}` : "complete"}; saved ${OUT}`);
console.log(`(for context) shown verdicts matching the answer key: ${agree} of ${shown.length}; unclear ${all.filter((r) => r.status === "unclear").length}, withheld ${all.filter((r) => r.status === "withheld").length}, errors ${all.filter((r) => r.status === "error").length}`);
for (const [name, text, ok] of bars) console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${text}`);
console.log(`output tokens per call: ${(all.reduce((s, r) => s + (r.usage?.output_tokens ?? 0), 0) / all.length).toFixed(0)} average`);
