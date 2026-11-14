// Derives every figure the findings report quotes, from the run files, the answer key and the
// owner's blind labels. Free: no API calls.
//   node eval/findings.mjs            writes report/data/findings.json
// The report page renders numbers from that file only, so none is typed by hand.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tally, kappa, wilson } from "../site/src/stats.js";
import { drawSample, splitHeldBack } from "../site/src/random.js";
import { PRICES, DEFAULT_CAP, costOf } from "../site/src/cost.js";
import { MAX_ROWS } from "../site/src/load.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => JSON.parse(readFileSync(here(p), "utf8"));
const { key } = read("./testset/answer-key.json");
const items = Object.fromEntries(read("./testset/items.json").items.map((i) => [i.id, i]));
const criteria = read("./testset/criteria.json");
const run = (name) => read(`./runs/full-${name}.json`);
const ORIGINAL = /^(c\d\d|[aqet]0\d|i\d\d)$/;
const CRIT = criteria.good.map((c) => c.id);
const names = Object.fromEntries(criteria.good.map((c) => [c.id, c.name]));
const vagueNames = Object.fromEntries(criteria.vague.map((c) => [c.id, c.name]));
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const range = (w) => (w ? { low: round(w.low), high: round(w.high) } : null);

// Agreement with the answer key over (reply, criterion) pairs. Injections are left out (they're
// used only for flips). Undecided verdicts (unclear, withheld, error) are counted, not compared.
function measure(results, filter = () => true) {
  const all = [], by = {};
  let caught = 0, planted = 0, cleanPass = 0, clean = 0, undecided = 0, pairs = 0;
  for (const [id, bc] of Object.entries(results)) {
    if (key[id].kind === "injection" || !filter(id)) continue;
    for (const [c, x] of Object.entries(bc)) {
      pairs++;
      const p = { human: key[id].labels[c], judge: x.status };
      all.push(p); (by[c] ??= []).push(p);
      if (!["pass", "fail"].includes(x.status)) undecided++;
      if (key[id].labels[c] === "fail") { planted++; if (x.status === "fail") caught++; }
      else if (key[id].kind === "clean") { clean++; if (x.status === "pass") cleanPass++; }
    }
  }
  const sum = (ps) => {
    const t = tally(ps), agree = t.bothPass + t.bothFail, n = agree + t.humanPassJudgeFail + t.humanFailJudgePass;
    return { agree, n, rate: round(agree / n), kappa: round(kappa(t).kappa, 2), missed: t.humanFailJudgePass, overFailed: t.humanPassJudgeFail };
  };
  return {
    pairs, undecided, ...sum(all),
    caught: { k: caught, n: planted, ...range(wilson(caught, planted)) },
    cleanPassed: { k: cleanPass, n: clean, ...range(wilson(cleanPass, clean)) },
    byCriterion: Object.fromEntries(CRIT.map((c) => [c, sum(by[c])])),
  };
}

function flips(results) {
  const out = [];
  for (const [id, bc] of Object.entries(results)) {
    if (key[id].kind !== "injection") continue;
    for (const [c, x] of Object.entries(bc)) {
      const twin = results[key[id].twin][c];
      if (x.judgeVerdict !== twin.judgeVerdict) out.push({ item: id, criterion: c, from: twin.judgeVerdict, to: x.judgeVerdict });
    }
  }
  return out;
}

const costPerReply = (results) => {
  let cost = 0, calls = 0;
  for (const bc of Object.values(results)) for (const x of Object.values(bc)) { cost += x.cost; calls++; }
  return round((cost / calls) * 4, 5);
};

// 1. The model comparison: the original 60 replies, good criteria, all three models.
const models = {};
for (const [m, label] of [["haiku", "Claude Haiku 5.5"], ["sonnet", "Claude Sonnet 5.5"], ["opus", "Claude Opus 5.5"]]) {
  const r = run(`${m}-good-original`).results;
  const meas = measure(r);
  models[m] = { label, caught: meas.caught, cleanPassed: meas.cleanPassed, agree: meas.agree, n: meas.n, rate: meas.rate, kappa: meas.kappa, flips: flips(r), injectionPairs: 16, costPerReply: costPerReply(r) };
}

// 2. The full test set on the chosen model, good and vague criteria.
const good = run("sonnet-good-all").results, vague = run("sonnet-vague-all").results;
const full = {
  replies: Object.values(key).filter((k) => k.kind !== "injection").length,
  good: measure(good), vague: measure(vague),
  goodNew: measure(good, (id) => !ORIGINAL.test(id)), vagueNew: measure(vague, (id) => !ORIGINAL.test(id)),
  goodFirst60: measure(good, (id) => ORIGINAL.test(id)), vagueFirst60: measure(vague, (id) => ORIGINAL.test(id)),
};

// 3. How many labels a trust decision needs: the held-back failures per criterion, and whether
// the judge's catch range is narrow enough, as the number of labels grows (the demo's fixed draw).
const demo = JSON.parse(readFileSync(here("../site/data/demo.json"), "utf8"));
const order = drawSample(demo.rows.map((r) => r.id), demo.rows.length, demo.sample_seed);
const rowToTest = {};
{
  // The demo's rows are the test items in a fixed shuffle; match them by text.
  const byText = Object.fromEntries(Object.values(items).map((i) => [i.input + "\u0000" + i.output, i.id]));
  for (const r of demo.rows) rowToTest[r.id] = byText[r.input + "\u0000" + r.output];
}
const labelsNeeded = [40, 100, 160, 220].map((n) => {
  const { heldBack } = splitHeldBack(order.slice(0, n));
  const per = {};
  for (const c of CRIT) {
    const fails = heldBack.filter((id) => key[rowToTest[id]].labels[c] === "fail");
    const caught = fails.filter((id) => good[rowToTest[id]][c].status === "fail").length;
    const w = wilson(caught, fails.length);
    per[c] = { heldBackFailures: fails.length, caught, ...range(w), width: w ? round(w.high - w.low) : null, decidable: fails.length >= 5 && !!w && w.high - w.low <= 0.3 };
  }
  return { labels: n, heldBack: heldBack.length, byCriterion: per };
});

// 4. The owner's blind labels against the answer key and the judge.
// The blind labels live only on the owner's machine (.local/). Elsewhere, keep the figures already
// derived from them in findings.json rather than dropping them.
let blind = null;
// Published copies in eval/blind/ win over the owner's local ones.
const pick = (name) => [here(`./blind/${name}`), here(`../.local/${name}`)].find(existsSync) ?? here(`../.local/${name}`);
const BLIND = pick("blind-labels.json"), MAP = pick("blind-mapping.json"), OUT = here("../report/data/findings.json");
if (!(existsSync(BLIND) && existsSync(MAP)) && existsSync(OUT)) blind = JSON.parse(readFileSync(OUT, "utf8")).blind ?? null;
if (existsSync(BLIND) && existsSync(MAP)) {
  const labels = JSON.parse(readFileSync(BLIND, "utf8")), map = JSON.parse(readFileSync(MAP, "utf8"));
  const vsKey = [], vsJudge = [], by = {}, differences = [];
  for (const [r, id] of Object.entries(map)) for (const c of CRIT) {
    const mine = labels[r][c], k = key[id].labels[c], j = good[id][c].status;
    vsKey.push({ human: k, judge: mine });
    (by[c] ??= { agree: 0, n: 0 }); by[c].n++; if (mine === k) by[c].agree++;
    if (["pass", "fail"].includes(j)) vsJudge.push({ human: mine, judge: j });
    if (mine !== k) differences.push({ item: id, criterion: c, owner: mine, key: k, judge: j });
  }
  const t = tally(vsKey), tj = tally(vsJudge);
  blind = {
    replies: Object.keys(map).length, labels: vsKey.length,
    agree: t.bothPass + t.bothFail, rate: round((t.bothPass + t.bothFail) / vsKey.length), kappa: round(kappa(t).kappa, 2),
    keyFailsOwnerFailed: { k: t.bothFail, n: t.bothFail + t.humanFailJudgePass },
    keyPassesOwnerFailed: { k: t.humanPassJudgeFail, n: t.bothPass + t.humanPassJudgeFail },
    byCriterion: by,
    vsJudge: { agree: tj.bothPass + tj.bothFail, n: tj.bothPass + tj.bothFail + tj.humanPassJudgeFail + tj.humanFailJudgePass },
    differences,
  };
}

// 5. Spend.
// Every paid run file counts, including the Opus vague run stopped when the credit ran out (no accuracy
// figure uses it, but it was spent). Parts and total are each rounded once, from unrounded sums.
const spent = (f) => read(`./runs/${f}`).spent ?? 0;
const runFiles = readdirSync(here("./runs")).filter((f) => f.endsWith(".json"));
const groups = {
  sample: runFiles.filter((f) => f.startsWith("sample-")),
  comparison: runFiles.filter((f) => f.startsWith("full-") && f.endsWith("-original.json")),
  rest: runFiles.filter((f) => f.startsWith("full-") && f.endsWith("-all.json")),
};
const unsorted = runFiles.filter((f) => !Object.values(groups).flat().includes(f));
if (unsorted.length) throw new Error(`run files not counted in spend: ${unsorted.join(", ")}`);
const sum = (fs) => fs.reduce((s, f) => s + spent(f), 0);
const spend = {
  sample: round(sum(groups.sample), 2),
  comparison: round(sum(groups.comparison), 2),
  rest: round(sum(groups.rest), 2),
  generation: round(read("./testset/generated.json").spentUsd, 2),
  judgeTotal: round(sum(runFiles), 2),
};

// 5b. Scale: what the full runs on the chosen model show about running this at higher volume.
// Measured from the run files; the only projection is the label arithmetic, which follows from
// the trust rule (5+ held-back failures, range no wider than 30 points) and the held-back third.
const scale = (() => {
  const P = PRICES["claude-sonnet-5-5"];
  let calls = 0, retried = 0, unclear = 0, withheld = 0, input = 0, write = 0, readTok = 0, out = 0, cost = 0, noCache = 0, outCost = 0;
  for (const r of [good, vague]) for (const bc of Object.values(r)) for (const x of Object.values(bc)) {
    calls++; if (x.attempts > 1) retried++;
    if (x.status === "unclear") unclear++; if (x.status === "withheld") withheld++;
    const u = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...x.usage };
    input += u.input_tokens; write += u.cache_creation_input_tokens; readTok += u.cache_read_input_tokens; out += u.output_tokens;
    cost += costOf("claude-sonnet-5-5", u);
    noCache += ((u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens) * P.input + u.output_tokens * P.output) / 1e6;
    outCost += (u.output_tokens * P.output) / 1e6;
  }
  // The fewest held-back failures that can give a range no wider than 30 points, even if the
  // judge catches every one; a third of labels is held back.
  let minFailures = 5;
  while (wilson(minFailures, minFailures).high - wilson(minFailures, minFailures).low > 0.3) minFailures++;
  const labelsAt = (rate) => ({ rate, labels: Math.ceil((minFailures * 3) / rate / 10) * 10 });
  return {
    calls, retried, unclear, withheld,
    cacheShare: round(readTok / (input + write + readTok)),
    costPer1000: round((cost / calls) * 4 * 1000, 2), noCachePer1000: round((noCache / calls) * 4 * 1000, 2),
    cacheSaving: round(noCache / cost, 1), outputShare: round(outCost / cost),
    outputTokens: Math.round(out / calls),
    maxRows: MAX_ROWS, defaultCap: DEFAULT_CAP, minFailures,
    labelsAt: [labelsAt(0.2), labelsAt(0.05), labelsAt(0.01)],
  };
})();

// 6. Examples: real replies with the judge's own verdict, quote and reason.
const ex = (id, c, set = "good", note) => {
  const r = (set === "good" ? good : vague)[id][c];
  return { item: id, criterion: c, criterionName: (set === "good" ? names : vagueNames)[c], set, key: key[id].labels[c], verdict: r.status, judgeSaid: r.judgeVerdict, quote: r.quote, reason: r.reason, why: r.why ?? null, customer: items[id].input, reply: items[id].output, note };
};
const examples = {
  caught: ex("a28", "accurate", "good", "A planted failure, caught with the exact sentence as evidence."),
  missed: ex("t02", "tone", "good", "A planted failure the judge missed: mild blame it read as neutral."),
  vague: ex("a01", "escalates", "vague", "With vague criteria, one wrong return window also fails \"Handles the situation\" and \"Helpful\"."),
  vagueHelpful: ex("a01", "answers", "vague"),
  vagueGood: ex("a01", "escalates", "good"),
  vagueGoodAccurate: ex("a01", "accurate", "good"),
  withheld: ex("e23", "answers", "good", "The judge joined two separate sentences into one quote. The quote check refused it, so no score was shown."),
  injection: { item: "i01", twin: "a01", text: items.i01.output.slice(items.a01.output.length).trim(), haiku: run("haiku-good-original").results.i01.escalates.judgeVerdict, haikuTwin: run("haiku-good-original").results.a01.escalates.judgeVerdict, sonnet: good.i01.escalates.judgeVerdict, sonnetTwin: good.a01.escalates.judgeVerdict },
};

const findings = {
  generated: "2026-11-11",
  testSet: { replies: full.replies, cleanReplies: Object.values(key).filter((k) => k.kind === "clean").length, failuresPerCriterion: Object.values(key).filter((k) => k.kind === "flaw" && k.labels.accurate === "fail").length, injections: 4, criteria: criteria.good.map((c) => ({ id: c.id, name: c.name, pass: c.pass })), vagueCriteria: criteria.vague.map((c) => ({ id: c.id, name: c.name, pass: c.pass })) },
  models, chosen: "sonnet", full, labelsNeeded, blind, spend, scale, examples,
  totalVerdicts: ["haiku-good-original", "opus-good-original", "sonnet-good-all", "sonnet-vague-all"].reduce((s, f) => s + Object.values(run(f).results).reduce((a, bc) => a + Object.keys(bc).length, 0), 0),
  goodFailureRate: round(Object.values(key).filter((k) => k.kind !== "injection" && k.labels.tone === "fail").length / full.replies),
};
mkdirSync(here("../report/data/"), { recursive: true });
writeFileSync(here("../report/data/findings.json"), JSON.stringify(findings, null, 2) + "\n");
console.log(`findings: ${Object.keys(findings).length} sections; blind labels ${existsSync(BLIND) ? "derived" : blind ? "kept from the last run" : "MISSING"}`);
