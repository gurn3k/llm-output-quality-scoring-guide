import { test } from "node:test";
import assert from "node:assert/strict";
import { costOf, worstCase, estimate, createBudget, missing, run, inputMargin, PRICES, PRICES_CHECKED } from "../site/src/cost.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test("the price table is dated and covers the three models", () => {
  assert.match(PRICES_CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(PRICES).sort(), ["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
});

test("cost of a reply matches hand-worked figures", () => {
  // Sonnet: 300 input x $2 + 700 cache read x $0.10 + 150 output x $10, per million.
  near(costOf("claude-sonnet-5-5", { input_tokens: 300, cache_read_input_tokens: 700, output_tokens: 150 }), (600 + 70 + 1500) / 1e6, "sonnet");
  // Opus: 1000 cache write x $5 + 200 output x $20.
  near(costOf("claude-opus-5-5", { cache_creation_input_tokens: 1000, output_tokens: 200 }), (5000 + 4000) / 1e6, "opus");
  // Haiku above 100K input switches to the long-context prices.
  near(costOf("claude-haiku-5-5", { input_tokens: 100001, output_tokens: 1000 }), (100001 * 0.5 + 1000 * 2.5) / 1e6, "haiku long");
  near(costOf("claude-haiku-5-5", { input_tokens: 1000, output_tokens: 1000 }), (100 + 500) / 1e6, "haiku");
  assert.throws(() => costOf("gpt-x", {}), /No price/);
});

test("worst case: margin on input, dearest input price, full max_tokens, two billable attempts", () => {
  assert.equal(inputMargin(1000), 1600);
  // Sonnet, 1000 counted -> 1600 at $2.50 (cache write) + 4000 output at $10, twice.
  near(worstCase("claude-sonnet-5-5", 1000, 4000), (2 * (1600 * 2.5 + 4000 * 10)) / 1e6, "sonnet worst");
});

test("the estimate's arithmetic matches a hand-worked run", () => {
  // Sonnet, 1 criterion, 10 items, system 800 tokens (cached), item 200, output 150.
  const e = estimate({ model: "claude-sonnet-5-5", criteria: [{ systemTokens: 800, itemTokens: 200 }], items: 10, outputTokens: 150, maxTokens: 4000 });
  const first = 800 * 2.5 + 200 * 2;
  const rest = 800 * 0.1 + 200 * 2;
  near(e.typical, (first + 9 * rest + 10 * 150 * 10) / 1e6, "typical");
  near(e.worst, 10 * worstCase("claude-sonnet-5-5", 1000, 4000), "worst");
  assert.equal(e.calls, 10);
  // Below the cache minimum nothing is cached.
  const small = estimate({ model: "claude-sonnet-5-5", criteria: [{ systemTokens: 300, itemTokens: 100 }], items: 2, outputTokens: 0, maxTokens: 10 });
  near(small.typical, (2 * 400 * 2) / 1e6, "uncached");
});

test("the budget refuses a reservation that would pass the cap", () => {
  const b = createBudget(1);
  const t1 = b.reserve(0.6);
  assert.ok(t1);
  assert.equal(b.reserve(0.5), null);
  b.settle(t1, 0.1);
  assert.ok(b.reserve(0.5));
  near(b.spent + b.held, 0.6, "spent + held");
  assert.throws(() => b.settle(t1, 0), /already settled/);
});

const pairsFor = (items, criteria) => items.flatMap((i) => criteria.map((c) => [i, c]));

test("the cap is never passed, even when every reply uses its full max_tokens", async () => {
  const model = "claude-opus-5-5";
  const maxTokens = 4000, counted = 1200;
  for (const cap of [0.05, 0.5, 0.2731]) {
    const budget = createBudget(cap);
    const results = {};
    // Every call is as bad as it can be: input at the margin, all of it written to cache, full output, two attempts.
    const usage = { cache_creation_input_tokens: 2 * inputMargin(counted), output_tokens: 2 * maxTokens };
    const out = await run({ pairs: pairsFor(["a", "b", "c", "d", "e", "f"], ["x", "y"]), results, budget, model, reserveFor: () => worstCase(model, counted, maxTokens), judgeOne: async () => ({ status: "pass", usage }) });
    assert.ok(budget.spent <= cap + 1e-12, `spent ${budget.spent} under cap ${cap}`);
    assert.equal(budget.held, 0);
    if (out.paused) assert.equal(out.paused, "cap");
  }
});

test("resume sends only what's missing, and never a finished pair twice", async () => {
  const pairs = pairsFor(["a", "b", "c"], ["x", "y"]);
  const results = { a: { x: { status: "pass" }, y: { status: "error", transient: true } }, b: { x: { status: "withheld" } }, c: { y: { status: "error", stopped: true } } };
  assert.deepEqual(missing(pairs, results), [["a", "y"], ["b", "y"], ["c", "x"], ["c", "y"]]);
  assert.deepEqual(missing([["a", "x"]], { a: { x: { status: "error", fatal: true } } }), [["a", "x"]], "a bad-key error is sent again once the key is fixed");
  assert.deepEqual(missing([["a", "x"]], { a: { x: { status: "error", reason: "The model declined." } } }), [], "a refusal is a finished answer");
  const sent = [];
  const budget = createBudget(1);
  await run({ pairs, results, budget, model: "claude-haiku-5-5", reserveFor: () => 0.001, judgeOne: async (p) => { sent.push(p.join()); return { status: "pass", usage: { input_tokens: 10 } }; } });
  assert.deepEqual(sent, ["a,y", "b,y", "c,x", "c,y"]);
  const again = [];
  await run({ pairs, results, budget, model: "claude-haiku-5-5", reserveFor: () => 0.001, judgeOne: async (p) => { again.push(p); return { status: "pass" }; } });
  assert.deepEqual(again, [], "a second resume sends nothing");
});

test("a run stops on a fatal error (bad key) and on stop, and records the cost of each result", async () => {
  const results = {};
  const out = await run({ pairs: pairsFor(["a", "b"], ["x"]), results, budget: createBudget(1), model: "claude-sonnet-5-5", reserveFor: () => 0.01, judgeOne: async () => ({ status: "error", fatal: true, reason: "The API key wasn't accepted.", usage: {} }) });
  assert.equal(out.paused, "fatal");
  assert.equal(out.done, 1);
  const ac = new AbortController();
  ac.abort();
  assert.equal((await run({ pairs: [["a", "y"]], results, budget: createBudget(1), model: "claude-sonnet-5-5", reserveFor: () => 0.01, judgeOne: async () => ({}), signal: ac.signal })).paused, "stopped");
  const r2 = {};
  await run({ pairs: [["a", "x"]], results: r2, budget: createBudget(1), model: "claude-sonnet-5-5", reserveFor: () => 0.01, judgeOne: async () => ({ status: "pass", usage: { output_tokens: 100 } }) });
  near(r2.a.x.cost, 0.001, "cost recorded");
});

test("a judge that throws releases its reservation", async () => {
  const budget = createBudget(1);
  await assert.rejects(run({ pairs: [["a", "x"]], results: {}, budget, model: "claude-sonnet-5-5", reserveFor: () => 0.5, judgeOne: async () => { throw new Error("boom"); } }));
  assert.equal(budget.held, 0);
});

test("replay runs cost nothing, even for a model with no price", async () => {
  const results = {};
  const budget = createBudget(0);
  const out = await run({ pairs: [["a", "x"]], results, budget, model: "stored-results", reserveFor: () => 0, costOfResult: () => 0, judgeOne: async () => ({ status: "pass", usage: { output_tokens: 1e6 } }) });
  assert.equal(out.paused, null);
  assert.equal(results.a.x.cost, 0);
  assert.equal(budget.spent, 0);
});
