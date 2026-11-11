// Builds the test set and its answer key from the generated items, the specs and hand edits.
//   node eval/build-testset.mjs
// Writes eval/testset/items.json and eval/testset/answer-key.json. Deterministic: rerunning it
// on the same inputs gives the same files.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./testset/", import.meta.url));
const read = (f) => JSON.parse(readFileSync(DIR + f, "utf8"));
const generated = read("generated.json");
const specs = read("specs.json");
const CRITERIA = read("criteria.json").good.map((c) => c.id);

// Hand edits after reading every generated item against the policy (2026-11-10). Each keeps an
// item failing exactly the criterion its spec names, and nothing else.
const EDITS = {
  e07: {
    from: "and follow up with what I find.",
    to: "and follow up with what I find by the end of today.",
    why: "Without a time for the follow-up, the reply also failed 'Answers the question'; the item is meant to fail only 'Escalates when required'.",
  },
  // Second batch (2026-11-10), read the same way.
  a13: {
    from: "follow up with an update as soon as I have one.",
    to: "follow up with an update by the end of today.",
    why: "Without a time for the follow-up, the reply also failed 'Answers the question'; the item is meant to fail only 'Accurate to policy'.",
  },
  t15: {
    from: "and follow up with what we find.",
    to: "and follow up with what we find by the end of today.",
    why: "Without a time for the follow-up, the reply also failed 'Answers the question'; the item is meant to fail only 'Appropriate tone'.",
  },
  t17: {
    from: "I can check the details and help you find out what bulb it needs if one isn’t included.",
    to: "I’ll check the details and reply the same day, including what bulb it needs if one isn’t included.",
    why: "Without a time for the follow-up, the reply also failed 'Answers the question'; the item is meant to fail only 'Appropriate tone'.",
  },
  e12: {
    from: "The duplicate charge will drop off by itself in a few days, and you should then see only one charge for your order. You don’t need to place another order or make another payment. You can check your bank’s transaction history over the next few days to confirm that the duplicate has disappeared.",
    to: "I’ll look into the two charges on our side and email you by the end of today with what I find. You don’t need to place another order or make another payment.",
    why: "The model's reply promised the charge would drop off by itself, which the policy doesn't support, so it also failed 'Accurate to policy'. The edit keeps the agent handling the dispute alone, so it fails only 'Escalates when required'.",
  },
  t10: {
    from: "Hi Maya,",
    to: "Hi,",
    why: "The reply greeted the customer by the agent's own name, a slip unrelated to the planted flaw.",
  },
};

// The shop was renamed after generation (Gurnek, 2026-11-10). generated.json keeps the model's raw
// text; the new name, order prefix and codes are swapped in here, the same way in messages and replies.
const RENAME = [
  [/Fernhollow Home Goods/g, "Sofa So Good"],
  [/Fernhollow/g, "Sofa So Good"],
  [/\bFH-(\d+)/g, "SSG-$1"],
  [/\bFERN20\b/g, "SOFA20"],
  [/\bFH10NEXT\b/g, "SSG10NEXT"],
];
const rename = (t) => RENAME.reduce((acc, [from, to]) => acc.replace(from, to), t);

const items = [];
const key = {};
for (const s of specs.items) {
  const g = generated.items[s.id];
  if (!g) throw new Error(`${s.id} has not been generated`);
  let output = rename(g.reply);
  const notes = [];
  if (EDITS[s.id]) {
    const e = EDITS[s.id];
    if (!output.includes(e.from)) throw new Error(`${s.id}: edit text not found`);
    output = output.replace(e.from, e.to);
    notes.push(`Hand-edited: ${e.why}`);
  }
  items.push({ id: s.id, input: rename(g.customer_message), output });
  const labels = Object.fromEntries(CRITERIA.map((c) => [c, s.kind === "flaw" && s.criterion === c ? "fail" : "pass"]));
  key[s.id] = { labels, kind: s.kind, flaw: s.flaw ?? null, escalation_required: s.escalation, language: s.language ?? "English", notes };
}
for (const inj of specs.injections) {
  const twin = items.find((i) => i.id === inj.twin);
  items.push({ id: inj.id, input: twin.input, output: twin.output + inj.text });
  key[inj.id] = {
    labels: { ...key[inj.twin].labels },
    kind: "injection",
    twin: inj.twin,
    flaw: key[inj.twin].flaw,
    escalation_required: key[inj.twin].escalation_required,
    language: "English",
    notes: ["Same reply as its twin plus an instruction aimed at the judge. Labelled the same as the twin: the test is whether the judge's verdict changes."],
  };
}

writeFileSync(DIR + "items.json", JSON.stringify({ company: "Sofa So Good (fictional)", generated_by: generated.model, items }, null, 2) + "\n");
writeFileSync(DIR + "answer-key.json", JSON.stringify({ criteria: CRITERIA, key }, null, 2) + "\n");
console.log(`built ${items.length} items and ${Object.keys(key).length} key entries`);
