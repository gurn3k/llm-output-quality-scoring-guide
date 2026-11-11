// Cost: estimate before a run, worst-case reservation before each call, hard stop at the cap (ADR 0010).

// US dollars per million tokens. Checked against Anthropic's pricing page on this date; shown on the page.
export const PRICES_CHECKED = "2026-11-10";
export const PRICES = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01, longContext: { above: 100000, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 } },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};
export const DEFAULT_CAP = 0.5;
export const CACHE_MIN_TOKENS = 512;

// Room for what count_tokens doesn't see (the output format's own instructions): 10% plus 500 tokens.
export const inputMargin = (counted) => Math.ceil(counted * 1.1) + 500;

// Billable attempts per call: one, plus one retry when the reply is malformed (ADR 0007).
// Rate-limit and server errors aren't billed, so they don't count.
export const BILLED_ATTEMPTS = 2;

function priceFor(model, totalInput) {
  const p = PRICES[model];
  if (!p) throw new Error(`No price for ${model}.`);
  return p.longContext && totalInput > p.longContext.above ? p.longContext : p;
}

// What a reply's usage cost, in dollars.
export function costOf(model, usage) {
  const u = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...usage };
  const p = priceFor(model, u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens);
  return (u.input_tokens * p.input + u.cache_creation_input_tokens * p.cacheWrite + u.cache_read_input_tokens * p.cacheRead + u.output_tokens * p.output) / 1e6;
}

// The most one judge call can cost: every input token at the dearest input price (a cache write),
// every allowed output token, for every billable attempt.
export function worstCase(model, countedInput, maxTokens) {
  const input = inputMargin(countedInput);
  const p = priceFor(model, input);
  return (BILLED_ATTEMPTS * (input * Math.max(p.input, p.cacheWrite) + maxTokens * p.output)) / 1e6;
}

// The estimate shown before a run. Per criterion: the system prompt's tokens (cached after the first
// call when long enough) and the average item's tokens. outputTokens is the typical reply length,
// measured on the sample run.
export function estimate({ model, criteria, items, outputTokens, maxTokens }) {
  let typical = 0, worst = 0;
  for (const { systemTokens, itemTokens } of criteria) {
    const p = priceFor(model, systemTokens + itemTokens);
    const cached = systemTokens >= CACHE_MIN_TOKENS;
    const first = (cached ? systemTokens * p.cacheWrite : systemTokens * p.input) + itemTokens * p.input;
    const rest = (cached ? systemTokens * p.cacheRead : systemTokens * p.input) + itemTokens * p.input;
    typical += (first + rest * (items - 1) + items * outputTokens * p.output) / 1e6;
    worst += items * worstCase(model, systemTokens + itemTokens, maxTokens);
  }
  return { calls: items * criteria.length, typical, worst };
}

// Money spent so far, plus money held for calls in flight. spent + held never passes the cap.
export function createBudget(cap = DEFAULT_CAP, spent = 0) {
  let held = 0;
  return {
    get cap() { return cap; },
    get spent() { return spent; },
    get held() { return held; },
    // Holds amount for one call. Returns a ticket, or null if it would pass the cap.
    reserve(amount) {
      if (!(amount >= 0)) throw new Error("A reservation must be a number of dollars.");
      if (spent + held + amount > cap + 1e-12) return null;
      held += amount;
      return { amount, open: true };
    },
    // Swaps the held amount for what the call really cost.
    settle(ticket, actual) {
      if (!ticket?.open) throw new Error("This reservation was already settled.");
      ticket.open = false;
      held -= ticket.amount;
      spent += actual;
      if (actual > ticket.amount + 1e-12) return { overran: actual - ticket.amount };
      return {};
    },
  };
}

// A result counts as finished unless it was stopped, hit a passing problem (network, rate limit,
// overload), or failed on the account (bad key, billing), which the user can fix before resuming.
// Those are sent again on resume; everything else is kept.
export const isFinished = (r) => !!r && !(r.status === "error" && (r.stopped || r.transient || r.fatal));

// The pairs still to do, in order. Resume uses this, so no finished pair is ever sent twice.
export function missing(pairs, results) {
  return pairs.filter(([itemId, criterionId]) => !isFinished(results[itemId]?.[criterionId]));
}

// Runs the missing pairs one at a time under the budget.
// reserveFor([itemId, criterionId]) gives that call's worst case; judgeOne runs it.
// Returns { done, paused: "cap" | "stopped" | "fatal" | null, reason }.
// costOfResult defaults to the price table; replay mode passes () => 0, since stored results are free.
export async function run({ pairs, results, budget, model, reserveFor, judgeOne, onResult = () => {}, signal, costOfResult = (r) => costOf(model, r.usage ?? {}) }) {
  let done = 0;
  for (const pair of missing(pairs, results)) {
    if (signal?.aborted) return { done, paused: "stopped" };
    const ticket = budget.reserve(reserveFor(pair));
    if (!ticket) return { done, paused: "cap", reason: `Paused before the $${budget.cap.toFixed(2)} cap: the next call could cost up to $${reserveFor(pair).toFixed(4)}.` };
    let r;
    try {
      r = await judgeOne(pair);
    } catch (e) {
      budget.settle(ticket, 0);
      throw e;
    }
    const spent = costOfResult(r);
    budget.settle(ticket, spent);
    const [itemId, criterionId] = pair;
    (results[itemId] ??= {})[criterionId] = { ...r, cost: spent };
    onResult(pair, results[itemId][criterionId]);
    done++;
    if (r.stopped) return { done, paused: "stopped" };
    if (r.fatal) return { done, paused: "fatal", reason: r.reason };
  }
  return { done, paused: null };
}
