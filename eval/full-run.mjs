// Ticket 10: the test set on one model and one criteria set. Uses the page's own judge and cost code.
//   node eval/full-run.mjs <haiku|sonnet|opus> <good|vague> <original|all> <stage cap in $>
// Reads ANTHROPIC_API_KEY from .env.local (never printed). Resumable: results are saved after every
// call to eval/runs/full-<model>-<criteria>-<set>.json, and a finished pair is never sent twice.
// Three caps, all hard: $0.50 per run (the page's default), the stage cap given on the command line,
// and TOTAL_CAP across every full-run file (the spend approved for this ticket).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { liveJudge, MODELS, DEFAULTS, PROMPT_VERSION } from "../site/src/judge.js";
import { worstCase, createBudget, run, missing, PRICES_CHECKED } from "../site/src/cost.js";

const RUN_CAP = 0.5;
const TOTAL_CAP = 6.5; // across every full-run file: ticket 10 ($2.50 approved, raised to $3.50 so the vague criteria could run on any winner), the demo's results (2026-11-11), then Opus on vague criteria (~$1.20, owner approved 2026-11-11); raised to $6.50 so Opus on vague criteria could finish its last 30 calls (owner approved 2026-11-14)

const [modelKey, critSet, itemSet, stageArg] = process.argv.slice(2);
if (!MODELS[modelKey] || !["good", "vague"].includes(critSet) || !["original", "all"].includes(itemSet) || !(Number(stageArg) > 0)) {
  console.error("usage: node eval/full-run.mjs <haiku|sonnet|opus> <good|vague> <original|all> <stage cap>");
  process.exit(2);
}
const STAGE_CAP = Number(stageArg);
const MODEL = MODELS[modelKey].id;

const DIR = fileURLToPath(new URL("./testset/", import.meta.url));
const read = (f) => JSON.parse(readFileSync(DIR + f, "utf8"));
const all = read("items.json").items;
const criteria = read("criteria.json")[critSet];
const reference = readFileSync(DIR + "policy.md", "utf8").trim();

// The original 60: c01-c20, a01-a09, q01-q09, e01-e09, t01-t09 and the four injections.
const ORIGINAL = /^(c\d\d|[aqet]0\d|i\d\d)$/;
const items = itemSet === "original" ? all.filter((i) => ORIGINAL.test(i.id)) : all;
if (itemSet === "original" && items.length !== 60) throw new Error(`expected 60 original items, found ${items.length}`);

const OUT_DIR = fileURLToPath(new URL("./runs/", import.meta.url));
const OUT = OUT_DIR + `full-${modelKey}-${critSet}-${itemSet}.json`;
mkdirSync(OUT_DIR, { recursive: true });
const spentIn = (f) => JSON.parse(readFileSync(OUT_DIR + f, "utf8")).spent ?? 0;
const others = readdirSync(OUT_DIR).filter((f) => f.startsWith("full-") && OUT_DIR + f !== OUT).reduce((s, f) => s + spentIn(f), 0);
const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
if (prior && (prior.prompt_version !== PROMPT_VERSION || prior.model !== MODEL)) throw new Error(`${OUT} was made with another prompt or model`);
const stageSpent = prior?.spent ?? 0;
const results = prior?.results ?? {};

const cap = Math.min(RUN_CAP, STAGE_CAP - stageSpent, TOTAL_CAP - others - stageSpent);
const pairs = items.flatMap((it) => criteria.map((c) => [it.id, c.id]));
const todo = missing(pairs, results);
console.log(`${modelKey} ${critSet} ${itemSet}: ${pairs.length - todo.length} of ${pairs.length} done; stage $${stageSpent.toFixed(4)} of $${STAGE_CAP}; ticket $${(others + stageSpent).toFixed(4)} of $${TOTAL_CAP}; this run's cap $${Math.max(0, cap).toFixed(4)}`);
if (!todo.length) { console.log("COMPLETE"); process.exit(0); }
if (cap <= 0) { console.log("CAPPED"); process.exit(3); }

const apiKey = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing from .env.local");
const judge = liveJudge({ apiKey });
const byId = Object.fromEntries(items.map((i) => [i.id, i]));
const crit = Object.fromEntries(criteria.map((c) => [c.id, c]));
const bytes = (s) => Buffer.byteLength(s ?? "", "utf8");
// Characters over-count tokens, so bytes of the whole prompt are a safe upper bound for the reservation.
const systemBytes = Object.fromEntries(criteria.map((c) => [c.id, bytes(JSON.stringify(c)) + bytes(reference) + 3000]));
const reserveFor = ([id, cid]) => worstCase(MODEL, systemBytes[cid] + bytes(byId[id].input) + bytes(byId[id].output), DEFAULTS.maxTokens);

const keep = (r) => ({ status: r.status, judgeVerdict: r.judgeVerdict ?? null, quote: r.quote ?? null, reason: r.reason ?? null, evidence_source: r.evidence_source ?? null, why: r.why ?? null, attempts: r.attempts, usage: r.usage, cost: r.cost, transient: r.transient, fatal: r.fatal, stopped: r.stopped, body: r.body ?? null });
const save = (spent, out) => writeFileSync(OUT, JSON.stringify({ model: MODEL, criteria_set: critSet, item_set: itemSet, prompt_version: PROMPT_VERSION, effort: DEFAULTS.effort, max_tokens: DEFAULTS.maxTokens, prices_checked: PRICES_CHECKED, updated: new Date().toISOString(), paused: out?.paused ?? null, reason: out?.reason ?? null, spent, results }, null, 2) + "\n");

const budget = createBudget(cap);
let n = 0;
const out = await run({
  pairs, results, budget, model: MODEL, reserveFor,
  judgeOne: ([id, cid]) => judge.judge(byId[id], crit[cid], { reference, model: modelKey }),
  onResult: ([id, cid], r) => {
    results[id][cid] = keep(r);
    save(stageSpent + budget.spent);
    if (++n % 20 === 0 || r.status === "error") console.log(`${n} done (${id} ${cid}: ${r.status}${r.status === "error" ? ` ${r.reason}` : ""}), run $${budget.spent.toFixed(4)}`);
  },
});
save(stageSpent + budget.spent, out);
const left = missing(pairs, results).length;
console.log(`run ${out.paused ?? "finished"} ${out.reason ?? ""}; spent $${budget.spent.toFixed(4)} this run; ${left} pairs left`);
// A cap pause with no calls made means the stage or ticket cap can't fit even one worst-case call:
// stop rather than let a loop restart it forever.
const stuck = out.paused === "cap" && out.done === 0;
console.log(left ? (stuck ? "CAPPED" : out.paused === "cap" ? "PAUSED" : "STOPPED") : "COMPLETE");
process.exit(left ? (stuck ? 3 : out.paused === "cap" ? 4 : 5) : 0);
