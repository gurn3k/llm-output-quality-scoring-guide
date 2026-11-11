// Builds the demo the page runs without a key: site/data/demo.json.
//   node eval/build-demo.mjs
// Holds the test set's replies (shuffled, with neutral ids, so an id or a row number never hints at a
// planted flaw), the fictional policy as reference material, the answer key as ready-made labels,
// and stored judge results for the good and the vague criteria.
//
// Until the real judge run (plan ticket 10), the stored results are PLACEHOLDERS: they follow the
// answer key, with a fixed few flipped, marked unclear or given a quote that isn't in the reply, so
// every screen has something to show. Each placeholder's reason says so, and the page says so too.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mulberry32, shuffle } from "../site/src/random.js";
import { toReplay } from "../site/src/judge.js";

const DIR = fileURLToPath(new URL("./testset/", import.meta.url));
const OUT = fileURLToPath(new URL("../site/data/demo.json", import.meta.url));
const read = (f) => JSON.parse(readFileSync(DIR + f, "utf8"));
const { items } = read("items.json");
const { key } = read("answer-key.json");
const criteria = read("criteria.json");
const policy = readFileSync(DIR + "policy.md", "utf8").trim();

const ORDER_SEED = 20261110; // the shuffle of rows (fixed, so the file is the same on every build)
const SAMPLE_SEED = 20261114; // the demo project's sample draw, shown on the page

// FNV-1a: a stable number per item, criterion and set, so the placeholders never change between builds.
function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

const order = shuffle(items.map((i) => i.id), mulberry32(ORDER_SEED));
const rows = order.map((testId, n) => {
  const it = items.find((i) => i.id === testId);
  return { id: `row-${n + 2}`, row: n + 2, input: it.input, output: it.output, reference: "" };
});
const testIdOf = Object.fromEntries(order.map((t, n) => [`row-${n + 2}`, t]));
const labels = Object.fromEntries(rows.map((r) => [r.id, { ...key[testIdOf[r.id]].labels }]));

const words = (s) => s.split(/\s+/).filter(Boolean);
function quoteFrom(text, h) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => words(s).length >= 4);
  const pick = sentences.length ? sentences[h % sentences.length] : text.trim();
  return words(pick).slice(0, 20).join(" ");
}

const body = (v) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(v) }], usage: { input_tokens: 0, output_tokens: 0 } });

// Good criteria: about 4% unclear, 5% flipped, 2% withheld. Vague: 10% unclear, 25% flipped.
function placeholder(row, c, set) {
  const truth = labels[row.id][c.id];
  const h = hash(`${row.id}:${c.id}:${set}`);
  const roll = h % 100;
  const [unclear, flip, withheld] = set === "good" ? [4, 9, 11] : [10, 35, 35];
  const quote = quoteFrom(row.output, h);
  if (roll < unclear) return body({ verdict: "unclear", evidence_source: "output", quote, reason: "Placeholder result: marked unclear to show the review pile." });
  if (roll < flip) return body({ verdict: truth === "pass" ? "fail" : "pass", evidence_source: "output", quote, reason: "Placeholder result: disagrees with the answer key on purpose, to show a disagreement." });
  if (roll < withheld) return body({ verdict: truth, evidence_source: "output", quote: "This reply follows every rule in the policy.", reason: "Placeholder result: its quote isn't in the reply, so the page withholds it." });
  return body({ verdict: truth, evidence_source: "output", quote, reason: "Placeholder result: agrees with the answer key." });
}

const replays = ["good", "vague"].map((set) => {
  const bodies = Object.fromEntries(rows.map((r) => [r.id, Object.fromEntries(criteria[set].map((c) => [c.id, placeholder(r, c, set)]))]));
  return { ...toReplay("placeholder", criteria[set], bodies), set, placeholder: true };
});

const demo = {
  format: "lqsg-demo",
  version: 1,
  company: "Sofa So Good (fictional)",
  about: "Customer support replies for a made-up online shop, with planted failures and a written answer key.",
  placeholder: true,
  sample_seed: SAMPLE_SEED,
  reference: policy,
  criteria: { good: criteria.good, vague: criteria.vague },
  rows,
  labels,
  replays,
};

mkdirSync(fileURLToPath(new URL("../site/data/", import.meta.url)), { recursive: true });
writeFileSync(OUT, JSON.stringify(demo) + "\n");
console.log(`demo: ${rows.length} rows, ${replays.length} replay sets, ${(JSON.stringify(demo).length / 1024).toFixed(0)} KB`);
