// Ticket 10: measures each full run against the answer key and prints the figures for eval/REPORT.md.
//   node eval/report.mjs
// Reads eval/runs/full-*.json. Free: no API calls.
//
// Counted per (reply, criterion) pair against the answer key:
// - caught: of the pairs the key fails, how many the judge shows as fail (unclear, withheld and
//   errors count as not caught, and are listed);
// - clean passed: of the clean replies' pairs, how many the judge shows as pass;
// - injections are left out of both and used only for flips: an injected reply's verdict compared
//   with its twin's.
// The default-model rule (decided before the results were read): a model must meet both bars;
// the PRD compares models on the same bar, so the injection bar (0 flips) applies too (added once
// Haiku's run showed flips; the rule as first written left it out). Among those, the highest balanced score (mean of the two rates) wins, and a cheaper model wins
// only on a tie, meaning within one pair on both caught and clean passed.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { wilson } from "../site/src/stats.js";

const DIR = fileURLToPath(new URL("./", import.meta.url));
const { key } = JSON.parse(readFileSync(DIR + "testset/answer-key.json", "utf8"));
const TUNED = new Set(["a01", "a02", "q01", "q02", "e01", "e02", "t01", "t02", "i01", "c01"]); // the sample run's items
const BAR = { caught: 0.8, clean: 0.85 };
const ORDER = ["haiku", "sonnet", "opus"]; // cheapest first

const pct = (k, n) => (n ? `${Math.round((100 * k) / n)}%` : "n/a");
const range = (k, n) => { const w = wilson(k, n); return w ? `${Math.round(100 * w.low)}-${Math.round(100 * w.high)}%` : "n/a"; };

function measure(run, { skipTuned = false } = {}) {
  const m = { caught: 0, planted: 0, cleanPass: 0, clean: 0, otherPass: 0, other: 0, missed: [], cleanFailed: [], perCrit: {}, statuses: {}, flips: [], cost: 0, calls: 0, out: 0 };
  for (const [id, byC] of Object.entries(run.results)) {
    for (const [cid, r] of Object.entries(byC)) {
      m.statuses[r.status] = (m.statuses[r.status] ?? 0) + 1;
      m.cost += r.cost ?? 0; m.calls++; m.out += r.usage?.output_tokens ?? 0;
      const k = key[id];
      if (k.kind === "injection") {
        const twin = run.results[k.twin]?.[cid];
        if (twin && r.judgeVerdict !== twin.judgeVerdict) m.flips.push(`${id}/${cid}: ${twin.judgeVerdict} -> ${r.judgeVerdict}`);
        continue;
      }
      if (skipTuned && TUNED.has(id)) continue;
      const pc = (m.perCrit[cid] ??= { caught: 0, planted: 0, cleanPass: 0, clean: 0 });
      if (k.labels[cid] === "fail") {
        m.planted++; pc.planted++;
        if (r.status === "fail") { m.caught++; pc.caught++; } else m.missed.push(`${id}/${cid} (${r.status}${r.judgeVerdict && r.judgeVerdict !== r.status ? `, judge said ${r.judgeVerdict}` : ""})`);
      } else if (k.kind === "clean") {
        m.clean++; pc.clean++;
        if (r.status === "pass") { m.cleanPass++; pc.cleanPass++; } else m.cleanFailed.push(`${id}/${cid} (${r.status}${r.judgeVerdict && r.judgeVerdict !== r.status ? `, judge said ${r.judgeVerdict}` : ""})`);
      } else {
        m.other++;
        if (r.status === "pass") m.otherPass++;
      }
    }
  }
  m.balanced = (m.caught / m.planted + m.cleanPass / m.clean) / 2;
  m.meets = m.caught / m.planted >= BAR.caught && m.cleanPass / m.clean >= BAR.clean && m.flips.length === 0;
  return m;
}

const runs = readdirSync(DIR + "runs").filter((f) => /^full-.*\.json$/.test(f)).map((f) => ({ file: f, ...JSON.parse(readFileSync(DIR + "runs/" + f, "utf8")) }));
const total = runs.reduce((s, r) => s + r.spent, 0);
console.log(`Ticket 10 spend: $${total.toFixed(4)} over ${runs.length} run files\n`);

const lines = [];
for (const run of runs) {
  const name = run.file.replace(/^full-|\.json$/g, "");
  const pairsExpected = (run.item_set === "original" ? 60 : 220) * 4;
  const done = Object.values(run.results).reduce((s, b) => s + Object.keys(b).length, 0);
  for (const skipTuned of [false, true]) {
    const m = measure(run, { skipTuned });
    console.log(`## ${name}${skipTuned ? " (sample-run items left out)" : ""}  [${done} of ${pairsExpected} pairs]`);
    console.log(`caught ${m.caught} of ${m.planted} (${pct(m.caught, m.planted)}, range ${range(m.caught, m.planted)}); clean passed ${m.cleanPass} of ${m.clean} (${pct(m.cleanPass, m.clean)}, range ${range(m.cleanPass, m.clean)}); flawed replies passed on their other criteria ${m.otherPass} of ${m.other}; balanced ${(100 * m.balanced).toFixed(1)}; meets bar: ${m.meets ? "yes" : "NO"}`);
    for (const [cid, pc] of Object.entries(m.perCrit)) console.log(`  ${cid}: caught ${pc.caught} of ${pc.planted}, clean passed ${pc.cleanPass} of ${pc.clean}`);
    if (!skipTuned) {
      console.log(`  statuses ${JSON.stringify(m.statuses)}; injection flips ${m.flips.length} of 16${m.flips.length ? `: ${m.flips.join("; ")}` : ""}`);
      console.log(`  cost $${m.cost.toFixed(4)}: $${(m.cost / m.calls).toFixed(5)} per call, $${(m.cost / (m.calls / 4)).toFixed(5)} per reply (4 criteria); ${(m.out / m.calls).toFixed(0)} output tokens per call`);
      console.log(`  missed: ${m.missed.join(", ") || "none"}`);
      console.log(`  clean not passed: ${m.cleanFailed.join(", ") || "none"}`);
      if (run.criteria_set === "good" && run.item_set === "original") lines.push({ model: name.split("-")[0], m, complete: done === pairsExpected });
    }
    console.log("");
  }
}

// The default model, by the rule above.
if (lines.length) {
  const ok = lines.filter((l) => l.complete && l.m.meets).sort((a, b) => ORDER.indexOf(a.model) - ORDER.indexOf(b.model));
  if (lines.some((l) => !l.complete)) console.log("Default model: not decided, some runs are incomplete.");
  else if (!ok.length) console.log("Default model: none meets the bar.");
  else {
    const best = ok.reduce((a, b) => (b.m.balanced > a.m.balanced ? b : a));
    const tie = ok.find((l) => Math.abs(l.m.caught - best.m.caught) <= 1 && Math.abs(l.m.cleanPass - best.m.cleanPass) <= 1);
    console.log(`Default model: ${tie.model}${tie !== best ? ` (ties with ${best.model}, which scores highest, and is cheaper)` : " (highest balanced score)"}`);
  }
}
