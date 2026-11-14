import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuote, normalize, locate } from "../site/src/quote.js";
import { parseReply, decide } from "../site/src/reply.js";

const REPLY = "Hi,\n\nYou can return the linen throw within 60 days of delivery, provided it’s unused.\r\nOnce the return arrives — usually in a week — your refund goes back to your card.\n\nBest,\nMaya";

test("a quote is found despite curly quotes, line breaks, dashes and case", () => {
  assert.deepEqual(checkQuote(REPLY, "within 60 days of delivery, provided it's unused"), { found: true });
  assert.deepEqual(checkQuote(REPLY, "PROVIDED IT’S UNUSED. Once the return arrives"), { found: true });
  assert.deepEqual(checkQuote(REPLY, "arrives - usually in a week - your refund"), { found: true });
  assert.equal(normalize("“Hi” —\tthere…"), '"hi" - there...');
});

test("an ellipsis joins parts that must all appear, in order", () => {
  assert.deepEqual(checkQuote(REPLY, "You can return the linen throw ... your refund goes back"), { found: true });
  assert.deepEqual(checkQuote(REPLY, "You can return the linen throw… your refund goes back"), { found: true });
  assert.match(checkQuote(REPLY, "your refund goes back ... You can return the linen throw").reason, /out of order/);
  assert.deepEqual(checkQuote(REPLY, "...within 60 days of delivery..."), { found: true }, "leading and trailing ellipses are ignored");
});

test("a found quote is placed in the original text, so it can be marked in place", () => {
  const at = (q) => locate(REPLY, q)?.map(([a, b]) => REPLY.slice(a, b));
  assert.deepEqual(at("within 60 days of delivery, provided it's unused"), ["within 60 days of delivery, provided it’s unused"]);
  assert.deepEqual(at("PROVIDED IT’S UNUSED. Once the return arrives"), ["provided it’s unused.\r\nOnce the return arrives"]);
  assert.deepEqual(at("You can return the linen throw ... your refund goes back"), ["You can return the linen throw", "your refund goes back"]);
  assert.deepEqual(at("arrives - usually in a week"), ["arrives — usually in a week"]);
  assert.equal(locate(REPLY, "within 30 days of delivery"), null, "a quote that isn't there is never placed");
  assert.equal(locate(REPLY, "60 days"), null, "a quote the check refuses (too short) is never placed either");
  // "İ" lowercases to two characters; both must map back to the one original character.
  const tr = "Hi. İstanbul is lovely today";
  assert.deepEqual(locate(tr, "istanbul is lovely")?.map(([a, b]) => tr.slice(a, b)) ?? null, checkQuote(tr, "istanbul is lovely").found ? ["İstanbul is lovely"] : null);
});

// Found by the independent review.
test("a word-for-word quote of a reply containing '...' is found, and placed", () => {
  const text = "Sorry... we can refund you today. Thanks for waiting.";
  assert.deepEqual(checkQuote(text, "Sorry... we can refund you today"), { found: true });
  assert.deepEqual(locate(text, "Sorry... we can refund you today"), [[0, 32]]);
  assert.deepEqual(checkQuote(text, "we can refund ... thanks for waiting"), { found: true }, "a joining ellipsis still works");
});

test("a fragment cut from the middle of words isn't a quote", () => {
  const text = "We will refund you in full.";
  assert.equal(checkQuote(text, "und you in fu").found, false);
  assert.equal(checkQuote(text, "refund you in").found, true);
  assert.equal(checkQuote(text, "you in full.").found, true, "punctuation at the edge is fine");
  assert.equal(locate(text, "und you in fu"), null);
});

test("a paraphrase or invented quote is refused", () => {
  assert.match(checkQuote(REPLY, "you may return it within sixty days").reason, /isn't in the text/);
  assert.match(checkQuote(REPLY, "within 30 days of delivery").reason, /isn't in the text/, "one changed number is enough to refuse");
});

test("a quote under 3 words is refused unless it's the whole text", () => {
  assert.match(checkQuote(REPLY, "60 days").reason, /too short/);
  assert.match(checkQuote(REPLY, "You can return ... Maya").reason, /too short/);
  assert.deepEqual(checkQuote("No.", "No."), { found: true }, "a two-word reply can only be quoted whole");
  assert.match(checkQuote(REPLY, "").reason, /empty/);
  assert.match(checkQuote(REPLY, " ... ").reason, /empty/);
});

const body = (obj, stop = "end_turn", extra = []) => ({ stop_reason: stop, content: [...extra, { type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }] });
const good = { verdict: "fail", evidence_source: "output", quote: "within 60 days of delivery", reason: "Policy says 30 days." };

test("a well-formed reply is read, with thinking blocks before the text ignored", () => {
  const r = parseReply(body(good, "end_turn", [{ type: "thinking", thinking: "" }]));
  assert.deepEqual(r, { ok: true, ...good });
});

test("refusals, cut-off replies and malformed JSON are errors, and only the fixable ones are retried", () => {
  assert.deepEqual([parseReply(body(good, "refusal")).ok, parseReply(body(good, "refusal")).retry], [false, false]);
  assert.deepEqual([parseReply(body(good, "max_tokens")).ok, parseReply(body(good, "max_tokens")).retry], [false, false]);
  for (const bad of ["not json", "[1]", "null", JSON.stringify({ ...good, verdict: "maybe" }), JSON.stringify({ ...good, evidence_source: "web" }),
    JSON.stringify({ ...good, extra: 1 }), JSON.stringify({ verdict: "pass" }), JSON.stringify({ ...good, reason: "  " }), JSON.stringify({ ...good, quote: 3 })]) {
    const r = parseReply(body(bad));
    assert.equal(r.ok, false, bad);
    assert.equal(r.retry, true, bad);
  }
  assert.equal(parseReply(null).ok, false);
  assert.equal(parseReply({ stop_reason: "tool_use", content: [] }).ok, false);
});

const item = { input: "My kettle sparked when I plugged it in this morning. What should I do?", output: REPLY };

test("a verdict is shown only with a quote found in the right text", () => {
  assert.equal(decide(item, parseReply(body(good))).status, "fail");
  assert.equal(decide(item, parseReply(body({ ...good, quote: "within 30 days of delivery" }))).status, "withheld");
  assert.equal(decide(item, parseReply(body({ ...good, verdict: "pass" }))).status, "pass");
});

test("evidence from the customer's message counts only for a failure", () => {
  const missed = { verdict: "fail", evidence_source: "input", quote: "kettle sparked when I plugged it in", reason: "Sparks require a hand-off." };
  assert.equal(decide(item, parseReply(body(missed))).status, "fail");
  assert.equal(decide(item, parseReply(body({ ...missed, verdict: "pass" }))).status, "withheld");
  assert.equal(decide(item, parseReply(body({ ...missed, quote: "kettle caught fire" }))).status, "withheld");
});

test("unclear goes to the review pile; errors stay errors; nothing is guessed", () => {
  assert.equal(decide(item, parseReply(body({ verdict: "unclear", evidence_source: "output", quote: "", reason: "Can't tell." }))).status, "unclear");
  const e = decide(item, parseReply(body(good, "refusal")));
  assert.equal(e.status, "error");
  assert.match(e.reason, /declined/);
});
