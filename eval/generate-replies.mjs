// Generates the test set's customer messages and replies with an OpenAI model (ADR 0012).
// Run on the owner's machine only. Reads OPENAI_API_KEY from .env.local.
//
//   node eval/generate-replies.mjs --only c01,a01,e01   # a small sample first
//   node eval/generate-replies.mjs                      # everything still missing
//
// Resumable: items already in generated.json are skipped. A hard cap stops the run before any
// call whose worst-case cost would take total spend past it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./testset/", import.meta.url));
const OUT = DIR + "generated.json";
const MODEL = "gpt-6.1-terra";
// Per million tokens, from developers.openai.com/api/docs/pricing, checked 2026-11-10.
const PRICE = { input: 1.0, output: 5.0 };
const CAP_USD = 1.0;
const MAX_OUTPUT = { short: 1500, long: 3000 };

const key = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error("OPENAI_API_KEY is missing from .env.local");

const policy = readFileSync(DIR + "policy.md", "utf8");
const specs = JSON.parse(readFileSync(DIR + "specs.json", "utf8")).items;
const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { model: MODEL, items: {}, spentUsd: 0, calls: [] };

const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const todo = specs.filter((s) => !done.items[s.id] && (!only || only.has(s.id)));

const instructions = `You write realistic test data for evaluating customer support replies.

The company is Sofa So Good, a fictional online shop. Its support policy:

${policy}

For each scenario, write:
1. customer_message: what the customer wrote, 2-4 sentences, natural and specific. Include an order number in the form SSG-12345 (any five digits) when an order is involved.
2. reply: the support agent's reply to that message, signed by a first name.

When the scenario names a flaw, the reply must contain exactly that flaw and otherwise follow the policy, stay polite and answer the question, unless the flaw itself is about those. Make the flaw read like a real agent's mistake. Never point it out, hint at it, or add notes about it. When there is no flaw, the reply must follow the policy exactly, answer everything asked, escalate exactly when the policy requires, and be polite.`;

function prompt(s) {
  const lines = [`Scenario: ${s.scenario}`];
  if (s.language) lines.push(`Language: write both the customer message and the reply in ${s.language}.`);
  lines.push(`Length: ${s.length === "long" ? "the customer message is long and detailed (6-10 sentences); the reply is thorough, 250-400 words" : "reply of 60-150 words"}.`);
  lines.push(s.kind === "flaw" ? `Flaw the reply must contain: ${s.flaw}` : "Flaw: none. This reply must be correct in every respect.");
  lines.push(`Escalation required by the policy for this scenario: ${s.escalation ? "yes" : "no"}.`);
  return lines.join("\n");
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["customer_message", "reply"],
  properties: { customer_message: { type: "string" }, reply: { type: "string" } },
};

const usd = (inTok, outTok) => (inTok * PRICE.input + outTok * PRICE.output) / 1e6;

for (const s of todo) {
  const input = prompt(s);
  const maxOut = MAX_OUTPUT[s.length === "long" ? "long" : "short"];
  // Worst case: generous input estimate (1 token per 3 characters, plus overhead) and every output token used.
  const worst = usd(Math.ceil((instructions.length + input.length) / 3) + 200, maxOut);
  if (done.spentUsd + worst > CAP_USD) {
    console.log(`cap reached: spent $${done.spentUsd.toFixed(4)}, next call could cost up to $${worst.toFixed(4)}, cap $${CAP_USD}. Stopping.`);
    break;
  }
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input,
      max_output_tokens: maxOut,
      text: { format: { type: "json_schema", name: "support_item", strict: true, schema } },
    }),
  });
  const body = await res.json();
  if (!res.ok) { console.log(`${s.id}: HTTP ${res.status} ${body.error?.message ?? ""}`); break; }
  const cost = usd(body.usage?.input_tokens ?? 0, body.usage?.output_tokens ?? 0);
  done.spentUsd += cost;
  done.calls.push({ id: s.id, status: body.status, input_tokens: body.usage?.input_tokens, output_tokens: body.usage?.output_tokens, usd: Number(cost.toFixed(6)) });
  const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
  if (body.status !== "completed" || !text) { console.log(`${s.id}: not completed (${body.status}, ${body.incomplete_details?.reason ?? "no text"})`); writeFileSync(OUT, JSON.stringify(done, null, 2)); continue; }
  let item;
  try { item = JSON.parse(text); } catch { console.log(`${s.id}: reply wasn't JSON`); writeFileSync(OUT, JSON.stringify(done, null, 2)); continue; }
  done.items[s.id] = { ...item, generated: new Date().toISOString().slice(0, 10) };
  writeFileSync(OUT, JSON.stringify(done, null, 2));
  console.log(`${s.id}: ok, ${body.usage?.input_tokens} in / ${body.usage?.output_tokens} out, $${cost.toFixed(5)} (total $${done.spentUsd.toFixed(4)})`);
}
console.log(`generated ${Object.keys(done.items).length} of ${specs.length}; spent $${done.spentUsd.toFixed(4)} of $${CAP_USD}`);
