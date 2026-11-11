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
  e02: {
    from: "I’ll update you when I have more details, though",
    to: "I’ll update you by the end of today, though",
    why: "Found by the sample run (2026-11-11): without a time for the update, the reply also failed 'Answers the question'; the item is meant to fail only 'Escalates when required'.",
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
  // Third batch (2026-11-11), read the same way. `input` edits the customer's message instead.
  a29: {
    from: "I can look into the shipment for you. Could you please confirm the delivery address on order SSG-48216 so I can check the details?",
    to: "I’ll look into the shipment with the carrier and email you an update by the end of today.",
    why: "The reply asked the customer to confirm their address and gave no time for the update, so it also failed 'Answers the question'; the item is meant to fail only 'Accurate to policy'.",
  },
  q44: {
    from: "You can return the throw within 30 days of delivery, provided it is unused and in its original packaging.",
    to: "To be returned, the throw needs to be unused and in its original packaging.",
    why: "The reply stated the 30-day window, so a labeller could fairly say the customer can work out the days left; the edit keeps only the conditions, so the question clearly goes unanswered.",
  },
  e49: {
    from: "who will reply within 5 business days.",
    to: "who will be in touch.",
    why: "A wrong reply time (5 business days) is also a wrong statement, failing 'Accurate to policy'. With no time at all, the hand-off fails only 'Escalates when required'.",
  },
  q28: {
    from: "Our [returns policy page](https://example.com/returns) has",
    to: "Our returns policy page has",
    why: "The reply linked to a placeholder web address. The edit keeps the pointer to the policy page as plain text; the item still fails only 'Answers the question'.",
  },
  t20: {
    from: "I can check the latest tracking information for order SSG-48216 and see whether there’s an update on its status.",
    to: "I’ll check the latest tracking information for order SSG-48216 and email you an update on its status by the end of today.",
    why: "Without a time for the update, the reply also failed 'Answers the question'; the item is meant to fail only 'Appropriate tone'.",
  },
  t25: {
    from: "I’ll look into the shipment and share any available update.",
    to: "I’ll look into the shipment and reply with an update the same day.",
    why: "Without a time for the update, the reply also failed 'Answers the question'; the item is meant to fail only 'Appropriate tone'.",
  },
  t29: {
    from: "Once we have that information, we can look into the delivery further.",
    to: "Once we have that information, we’ll look into the delivery and reply the same day.",
    why: "Without a time for the follow-up, the reply also failed 'Answers the question'; the item is meant to fail only 'Appropriate tone'.",
  },
  t36: {
    input: true,
    from: "Can I return it for a refund?",
    to: "It was a clearance item. Can I return it for a refund?",
    why: "The customer's message never said the vase was clearance, so the reply's 'final sale' answer would also fail 'Accurate to policy'. The message now says so, as the spec intended.",
  },
  t48: {
    from: "I can check the latest tracking information for SSG-48216 and follow up with an update.",
    to: "I’ll check the latest tracking information for SSG-48216 and email you an update by the end of today.",
    why: "Without a time for the update, the reply also failed 'Answers the question'; the item is meant to fail only 'Appropriate tone'.",
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

// The model sometimes greets the customer by one of its own agent names ("Hi Maya," signed "Lena").
// The customer never gave that name, so it's a slip unrelated to any planted flaw: "Hi," instead.
const AGENT_GREETING = /^(Hi|Hello|Dear) (Maya|Mia|Jamie|Lena|Sam|Alex),/;
const fixGreeting = (reply, message) => {
  const m = reply.match(AGENT_GREETING);
  return m && !message.includes(m[2]) ? reply.replace(AGENT_GREETING, "$1,") : reply;
};

const items = [];
const key = {};
for (const s of specs.items) {
  const g = generated.items[s.id];
  if (!g) throw new Error(`${s.id} has not been generated`);
  let input = rename(g.customer_message);
  let output = fixGreeting(rename(g.reply), g.customer_message);
  const notes = [];
  if (output !== rename(g.reply)) notes.push("Greeting changed to \"Hi,\": the reply had greeted the customer by an agent's name.");
  if (EDITS[s.id]) {
    const e = EDITS[s.id];
    const text = e.input ? input : output;
    if (!text.includes(e.from)) throw new Error(`${s.id}: edit text not found`);
    if (e.input) input = input.replace(e.from, e.to);
    else output = output.replace(e.from, e.to);
    notes.push(`Hand-edited${e.input ? " (customer's message)" : ""}: ${e.why}`);
  }
  items.push({ id: s.id, input, output });
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
