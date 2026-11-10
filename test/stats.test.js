// Reference values were computed independently (Python, standard formulas) before this code ran.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wilson, tally, kappa, agreement, passRate } from "../site/src/stats.js";
import { mulberry32, shuffle, drawSample, splitHeldBack, newSeed } from "../site/src/random.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 5e-4, `${msg}: ${a} vs ${b}`);

test("Wilson intervals match hand-worked values, including 0 of n and n of n", () => {
  for (const [k, n, low, high] of [[0, 10, 0, 0.2775], [10, 10, 0.7225, 1], [9, 10, 0.5958, 0.9821], [81, 263, 0.2553, 0.3662], [1, 1, 0.2065, 1], [13, 15, 0.6212, 0.9626]]) {
    const w = wilson(k, n);
    near(w.low, low, `${k}/${n} low`);
    near(w.high, high, `${k}/${n} high`);
  }
  assert.equal(wilson(0, 0), null);
});

const pairsFrom = (a, b, c, d) => [
  ...Array(a).fill({ human: "pass", judge: "pass" }),
  ...Array(b).fill({ human: "pass", judge: "fail" }),
  ...Array(c).fill({ human: "fail", judge: "pass" }),
  ...Array(d).fill({ human: "fail", judge: "fail" }),
];

test("kappa matches the textbook example (0.40) and a second hand-worked case", () => {
  const k1 = kappa(tally(pairsFrom(20, 5, 10, 15)));
  near(k1.kappa, 0.4, "kappa");
  near(k1.low, 0.146, "low");
  near(k1.high, 0.654, "high");
  const k2 = kappa(tally(pairsFrom(18, 2, 1, 9)));
  near(k2.kappa, 0.7805, "kappa 2");
  near(k2.observed, 0.9, "observed");
});

test("kappa is reported as not computable when everyone said the same thing", () => {
  const k = kappa(tally(pairsFrom(10, 0, 0, 0)));
  assert.equal(k.kappa, null);
  assert.equal(kappa(tally([])), null);
});

test("unclear, skipped and withheld verdicts are excluded and counted, never treated as pass or fail", () => {
  const t = tally([{ human: "pass", judge: "unclear" }, { human: "skip", judge: "pass" }, { human: "fail", judge: "withheld" }, { human: "fail", judge: "fail" }]);
  assert.deepEqual(t, { bothPass: 0, humanPassJudgeFail: 0, humanFailJudgePass: 0, bothFail: 1, excluded: 3 });
});

test("caught and passed rates, and the too-wide rule", () => {
  // 9 of 10 failures caught, 18 of 20 passes passed.
  const a = agreement(pairsFrom(18, 2, 1, 9));
  assert.equal(a.caught.k, 9); assert.equal(a.caught.n, 10);
  assert.equal(a.passed.k, 18); assert.equal(a.passed.n, 20);
  near(a.caught.low, 0.5958, "caught low");
  assert.equal(a.tooWide, true, "9/10 spans more than 30 points");
  assert.match(a.reasons.join(" "), /"caught" range is 39 points wide/);
  // Plenty of labels: narrow enough.
  const b = agreement(pairsFrom(90, 5, 5, 95));
  assert.equal(b.tooWide, false, b.reasons.join("; "));
  // Too few failures labelled, however the ranges look.
  const c = agreement(pairsFrom(40, 0, 0, 4));
  assert.ok(c.reasons.some((r) => /only 4 failures labelled/.test(r)));
  // No failures at all.
  assert.ok(agreement(pairsFrom(10, 0, 0, 0)).reasons.some((r) => /no failures labelled/.test(r)));
});

test("pass rate counts only shown verdicts and lists the rest beside it", () => {
  const r = passRate(["pass", "pass", "fail", "withheld", "unclear", "unclear", "error"]);
  assert.equal(r.rate.k, 2); assert.equal(r.rate.n, 3);
  assert.deepEqual([r.withheld, r.unclear, r.error], [1, 2, 1]);
  assert.equal(passRate([]).rate, null);
});

test("the same seed gives the same draw and split; a different seed gives a different one", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `row-${i + 2}`);
  assert.deepEqual(drawSample(ids, 40, 42), drawSample(ids, 40, 42));
  assert.notDeepEqual(drawSample(ids, 40, 42), drawSample(ids, 40, 43));
  const s = splitHeldBack(drawSample(ids, 40, 42), 42);
  assert.deepEqual(s, splitHeldBack(drawSample(ids, 40, 42), 42));
  assert.equal(s.heldBack.length, 13);
  assert.equal(s.tuning.length, 27);
  assert.deepEqual([...s.tuning, ...s.heldBack].sort(), drawSample(ids, 40, 42).sort(), "every labelled item is in exactly one set");
});

test("the draw takes everything when there are fewer items than asked, and never changes its input", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(drawSample(ids, 40, 1).sort(), ids);
  assert.deepEqual(ids, ["a", "b", "c"]);
});

test("the generator is roughly uniform (a check that it isn't badly broken)", () => {
  const rng = mulberry32(7);
  const buckets = Array(10).fill(0);
  for (let i = 0; i < 100000; i++) buckets[Math.floor(rng() * 10)]++;
  for (const b of buckets) assert.ok(b > 9500 && b < 10500, `bucket ${b}`);
  const positions = Array(5).fill(0);
  const r2 = mulberry32(9);
  for (let i = 0; i < 20000; i++) positions[shuffle([0, 1, 2, 3, 4], r2).indexOf(0)]++;
  for (const p of positions) assert.ok(p > 3700 && p < 4300, `shuffle position ${p}`);
  assert.ok(Number.isInteger(newSeed()));
});
