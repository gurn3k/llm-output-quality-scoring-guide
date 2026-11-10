// Agreement between your labels and the judge's verdicts (ADRs 0003 and 0009).
// Verdicts are "pass" or "fail". Anything else (unclear, skipped, withheld, error) is excluded and counted.

const Z = 1.959963984540054; // 95%

// Wilson score interval for k successes out of n. Null when n is 0: there's nothing to estimate.
export function wilson(k, n, z = Z) {
  if (!n) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { k, n, p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

const decided = (v) => v === "pass" || v === "fail";

// pairs: [{ human, judge }]. Returns the counts both rates and kappa are built from.
export function tally(pairs) {
  const t = { bothPass: 0, humanPassJudgeFail: 0, humanFailJudgePass: 0, bothFail: 0, excluded: 0 };
  for (const { human, judge } of pairs) {
    if (!decided(human) || !decided(judge)) { t.excluded++; continue; }
    if (human === "pass") judge === "pass" ? t.bothPass++ : t.humanPassJudgeFail++;
    else judge === "fail" ? t.bothFail++ : t.humanFailJudgePass++;
  }
  return t;
}

// Cohen's kappa with its approximate 95% range. kappa is null when chance agreement is total
// (everyone said the same thing), because it can't be computed.
export function kappa(t) {
  const n = t.bothPass + t.humanPassJudgeFail + t.humanFailJudgePass + t.bothFail;
  if (!n) return null;
  const po = (t.bothPass + t.bothFail) / n;
  const humanPass = (t.bothPass + t.humanPassJudgeFail) / n;
  const judgePass = (t.bothPass + t.humanFailJudgePass) / n;
  const pe = humanPass * judgePass + (1 - humanPass) * (1 - judgePass);
  if (pe === 1) return { n, kappa: null, low: null, high: null, observed: po, chance: pe };
  const k = (po - pe) / (1 - pe);
  const se = Math.sqrt((po * (1 - po)) / (n * (1 - pe) ** 2));
  return { n, kappa: k, low: k - Z * se, high: k + Z * se, observed: po, chance: pe };
}

export const TOO_WIDE = 0.3;
export const MIN_FAILS = 5;

// Everything the calibration screen shows for one criterion on one set of labels.
export function agreement(pairs) {
  const t = tally(pairs);
  const humanFails = t.bothFail + t.humanFailJudgePass;
  const humanPasses = t.bothPass + t.humanPassJudgeFail;
  const caught = wilson(t.bothFail, humanFails);
  const passed = wilson(t.bothPass, humanPasses);
  const raw = wilson(t.bothPass + t.bothFail, humanFails + humanPasses);
  const reasons = [];
  if (humanFails < MIN_FAILS) reasons.push(`only ${humanFails} failure${humanFails === 1 ? "" : "s"} labelled (at least ${MIN_FAILS} needed)`);
  for (const [name, r] of [["caught", caught], ["passed", passed]]) {
    if (r && r.high - r.low > TOO_WIDE) reasons.push(`the "${name}" range is ${Math.round((r.high - r.low) * 100)} points wide`);
    if (!r) reasons.push(`no ${name === "caught" ? "failures" : "passes"} labelled`);
  }
  return { tally: t, caught, passed, raw, kappa: kappa(t), tooWide: reasons.length > 0, reasons };
}

// Pass rate over scored items: only shown verdicts count; the rest are listed beside it.
export function passRate(verdicts) {
  const shown = verdicts.filter(decided);
  const counts = { shown: shown.length, withheld: 0, unclear: 0, error: 0 };
  for (const v of verdicts) if (v in counts && v !== "shown") counts[v]++;
  return { rate: wilson(shown.filter((v) => v === "pass").length, shown.length), ...counts };
}
