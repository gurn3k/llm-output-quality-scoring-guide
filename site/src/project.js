// The project: everything the user has loaded, written, labelled and run (ADR 0011, PRD P4, P13, P20, P21).
// Plain data, so it saves as JSON and survives a round trip unchanged. Functions here change it in place.
import { drawSample, splitHeldBack, newSeed } from "./random.js";
import { agreement, passRate } from "./stats.js";

export const FORMAT = "llm-quality-project";
export const VERSION = 1;
export const STORE_KEY = "lqsg.project";
export const KEY_KEY = "lqsg.apikey";

export function newProject({ rows, criteria, reference = "", seed = newSeed(), now = new Date().toISOString() }) {
  const p = {
    format: FORMAT, version: VERSION, createdAt: now, seed,
    rows, reference,
    criteria: [], // versions: { v, createdAt, list, measuredAfterSeeing }
    sample: null, // { size, ids, tuning, heldBack }
    labels: {}, // itemId -> criterionId -> "pass" | "fail" | "skip"
    labellingDone: false,
    heldBackSeen: [], // criteria versions whose held-back figures have been shown
    trusted: {}, // v -> criterionId -> { thin, at }
    runs: {}, // v -> { model, results: itemId -> criterionId -> result }
    overrides: {}, // v -> itemId -> criterionId -> { verdict, at }
  };
  editCriteria(p, criteria, now);
  return p;
}

// --- Criteria versions (P4, P13) ---

export const current = (p) => p.criteria[p.criteria.length - 1];
export const versionOf = (p, v) => p.criteria.find((c) => c.v === v) ?? null;

export function editCriteria(p, list, now = new Date().toISOString()) {
  const v = p.criteria.length + 1;
  const measuredAfterSeeing = p.heldBackSeen.some((seen) => seen < v);
  p.criteria.push({ v, createdAt: now, list: structuredClone(list), measuredAfterSeeing });
  return v;
}

// Before the judge has produced anything for the current version, an edit just replaces its list:
// there are no results to keep apart, so a new version would only add noise.
export function canReplaceCriteria(p) {
  const v = current(p).v;
  return !p.runs[v] && !p.heldBackSeen.includes(v);
}

export function replaceCriteria(p, list) {
  if (!canReplaceCriteria(p)) throw new Error("This version already has results; editing makes a new version.");
  current(p).list = structuredClone(list);
}

export function markHeldBackSeen(p, v) {
  if (!p.heldBackSeen.includes(v)) p.heldBackSeen.push(v);
}

// --- Sample and labels (P5-P8) ---

export function drawLabelSample(p, size) {
  if (p.sample) throw new Error("The labelling sample is already drawn; it stays fixed.");
  const ids = drawSample(p.rows.map((r) => r.id), size, p.seed);
  p.sample = { size, ids, ...splitHeldBack(ids) };
  return p.sample;
}

// A further round of labelling (ADR 0013): the next items from the same fixed order. Earlier items and
// the held-back set never move. Labelling is open again until the new items are labelled.
export function extendSample(p, more) {
  if (!p.sample) throw new Error("Draw the first sample before labelling more.");
  const size = Math.min(p.sample.size + more, p.rows.length);
  const ids = drawSample(p.rows.map((r) => r.id), size, p.seed);
  const added = ids.slice(p.sample.ids.length);
  p.sample = { size, ids, ...splitHeldBack(ids) };
  if (added.length) p.labellingDone = false;
  return added;
}

export const MIN_HELD_FAILS = 5;

// Roughly how many more labels would hold back enough failures for this criterion, from the failure
// rate marked so far, rounded up to the next 10 (and never more than the rows left). Null when enough
// are held back already; Infinity when no failures are marked yet, so no estimate is possible.
export function labelsNeeded(p, criterionId) {
  const marked = p.sample.ids.map((id) => labelOf(p, id, criterionId)).filter((l) => l === "pass" || l === "fail");
  const heldFails = p.sample.heldBack.filter((id) => labelOf(p, id, criterionId) === "fail").length;
  if (heldFails >= MIN_HELD_FAILS) return null;
  const failRate = marked.filter((l) => l === "fail").length / (marked.length || 1);
  if (!failRate) return Infinity;
  const more = ((MIN_HELD_FAILS - heldFails) * 3) / failRate;
  return Math.min(Math.ceil(more / 10) * 10, p.rows.length - p.sample.ids.length);
}

export function setLabel(p, itemId, criterionId, value) {
  if (!["pass", "fail", "skip"].includes(value)) throw new Error(`A label is pass, fail or skip, not ${value}.`);
  if (!p.sample?.ids.includes(itemId)) throw new Error(`${itemId} isn't in the labelling sample.`);
  (p.labels[itemId] ??= {})[criterionId] = value;
}

export const labelOf = (p, itemId, criterionId) => p.labels[itemId]?.[criterionId] ?? null;

// Labelling is finished when every sampled item has a label for every current criterion.
export function labellingComplete(p) {
  return !!p.sample && p.sample.ids.every((id) => current(p).list.every((c) => labelOf(p, id, c.id)));
}

export function finishLabelling(p) {
  if (!labellingComplete(p)) throw new Error("Some sampled items still need a label.");
  p.labellingDone = true;
}

// Judge results are hidden until labelling is finished (P8).
export const resultsVisible = (p) => p.labellingDone;

// --- Results, tied to the criteria version that produced them (P4) ---

const KEEP = ["status", "judgeVerdict", "quote", "reason", "evidence_source", "why", "cost", "model", "transient", "stopped", "fatal"];

export function resultsFor(p, v) {
  return p.runs[v]?.results ?? {};
}

export function recordResult(p, v, itemId, criterionId, r, model) {
  if (!versionOf(p, v)) throw new Error(`There's no criteria version ${v}.`);
  const run = (p.runs[v] ??= { model, results: {} });
  if (run.model !== model) throw new Error(`Version ${v} was run with ${run.model}; start a new version to use ${model}.`);
  (run.results[itemId] ??= {})[criterionId] = Object.fromEntries(KEEP.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));
}

export const resultOf = (p, v, itemId, criterionId) => resultsFor(p, v)[itemId]?.[criterionId] ?? null;

// --- Calibration (P9-P13) ---

export function calibration(p, v, criterionId) {
  if (!resultsVisible(p)) throw new Error("Results stay hidden until labelling is finished.");
  const pairs = (ids) => ids.map((id) => ({ id, human: labelOf(p, id, criterionId), judge: resultOf(p, v, id, criterionId)?.status ?? "missing" }));
  const held = pairs(p.sample.heldBack);
  const tuning = pairs(p.sample.tuning);
  const disagreements = [...tuning, ...held]
    .filter((x) => ["pass", "fail"].includes(x.human) && ["pass", "fail"].includes(x.judge) && x.human !== x.judge)
    .map((x) => ({ itemId: x.id, set: p.sample.heldBack.includes(x.id) ? "held back" : "tuning", you: x.human, ...resultOf(p, v, x.id, criterionId) }));
  return {
    v, criterionId,
    heldBack: agreement(held),
    tuning: agreement(tuning),
    disagreements,
    measuredAfterSeeing: versionOf(p, v).measuredAfterSeeing,
  };
}

// Trust a criterion for scoring. If its held-back result is still too wide to decide, it's recorded as
// trusted on thin evidence (ADR 0013), and that mark follows every score it produces.
export function trust(p, v, criterionId, now = new Date().toISOString()) {
  const thin = calibration(p, v, criterionId).heldBack.tooWide;
  (p.trusted[v] ??= {})[criterionId] = { thin, at: now };
  return { thin };
}

export function untrust(p, v, criterionId) {
  delete p.trusted[v]?.[criterionId];
}

export const trustOf = (p, v, criterionId) => p.trusted[v]?.[criterionId] ?? null;
export const trustedIds = (p, v) => Object.keys(p.trusted[v] ?? {});

export function trustLabel(t) {
  return !t ? "not trusted" : t.thin ? "trusted before the range narrowed" : "trusted";
}

// --- Overrides and final verdicts (P20, P21) ---

export function override(p, v, itemId, criterionId, verdict, now = new Date().toISOString()) {
  if (!["pass", "fail"].includes(verdict)) throw new Error("An override is pass or fail.");
  ((p.overrides[v] ??= {})[itemId] ??= {})[criterionId] = { verdict, at: now };
}

export function clearOverride(p, v, itemId, criterionId) {
  delete p.overrides[v]?.[itemId]?.[criterionId];
}

// Who decided: your override beats your label, which beats the judge.
export function finalVerdict(p, v, itemId, criterionId) {
  const judge = resultOf(p, v, itemId, criterionId);
  const ov = p.overrides[v]?.[itemId]?.[criterionId];
  const label = labelOf(p, itemId, criterionId);
  if (ov) return { verdict: ov.verdict, decidedBy: "you over the judge", judge };
  if (label === "pass" || label === "fail") return { verdict: label, decidedBy: "you", judge };
  if (judge && ["pass", "fail"].includes(judge.status)) return { verdict: judge.status, decidedBy: "judge", judge };
  return { verdict: judge?.status ?? "not scored", decidedBy: judge ? "judge" : "none", judge };
}

export function passRates(p, v) {
  const out = {};
  for (const c of versionOf(p, v).list) {
    out[c.id] = passRate(p.rows.map((r) => finalVerdict(p, v, r.id, c.id).verdict));
  }
  return out;
}

// --- Saving (ADR 0011) ---

export function serialize(p) {
  return JSON.stringify(p);
}

export function parseProject(text) {
  let p;
  try { p = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  if (p?.format !== FORMAT) throw new Error("That file isn't a project saved by this page.");
  if (p.version !== VERSION) throw new Error(`That project is format version ${p.version}; this page reads version ${VERSION}.`);
  for (const k of ["rows", "criteria", "labels", "heldBackSeen", "trusted", "runs", "overrides"]) {
    if (p[k] == null || typeof p[k] !== "object") throw new Error(`That project is missing its ${k}.`);
  }
  if (!p.criteria.length) throw new Error("That project has no criteria.");
  return p;
}

// Guarded storage: every access is wrapped, so a blocked or full storage never breaks the page.
export function createStore(getStorage = () => globalThis.localStorage) {
  const storage = () => { try { return getStorage() ?? null; } catch { return null; } };
  const attempt = (fn, fallback) => { try { const s = storage(); return s ? fn(s) : fallback; } catch { return fallback; } };
  return {
    available: () => attempt((s) => { s.setItem("lqsg.test", "1"); s.removeItem("lqsg.test"); return true; }, false),
    save: (p) => attempt((s) => { s.setItem(STORE_KEY, serialize(p)); return true; }, false),
    load: () => attempt((s) => { const t = s.getItem(STORE_KEY); return t ? parseProject(t) : null; }, null),
    clear: () => attempt((s) => { s.removeItem(STORE_KEY); s.removeItem(KEY_KEY); return true; }, false),
    saveKey: (key) => attempt((s) => { s.setItem(KEY_KEY, key); return true; }, false),
    loadKey: () => attempt((s) => s.getItem(KEY_KEY), null),
    forgetKey: () => attempt((s) => { s.removeItem(KEY_KEY); return true; }, false),
  };
}

// --- Export (P21) ---

export function exportJSON(p, v, { now = new Date().toISOString() } = {}) {
  const ver = versionOf(p, v);
  return {
    exported: now,
    criteria_version: v,
    criteria: ver.list,
    measured_after_seeing_earlier_results: ver.measuredAfterSeeing,
    model: p.runs[v]?.model ?? null,
    trust: Object.fromEntries(ver.list.map((c) => [c.id, trustLabel(trustOf(p, v, c.id))])),
    held_back: Object.fromEntries(ver.list.map((c) => {
      const a = p.labellingDone && p.sample ? calibration(p, v, c.id).heldBack : null;
      return [c.id, a && { caught: a.caught && { k: a.caught.k, n: a.caught.n, low: a.caught.low, high: a.caught.high }, passed: a.passed && { k: a.passed.k, n: a.passed.n, low: a.passed.low, high: a.passed.high }, too_wide_to_decide: a.tooWide, reasons: a.reasons }];
    })),
    pass_rates: Object.fromEntries(Object.entries(passRates(p, v)).map(([id, r]) => [id, { ...r, rate: r.rate && { k: r.rate.k, n: r.rate.n, low: r.rate.low, high: r.rate.high } }])),
    verdicts: p.rows.flatMap((r) => ver.list.map((c) => {
      const f = finalVerdict(p, v, r.id, c.id);
      return {
        item: r.id, criterion: c.id, verdict: f.verdict, decided_by: f.decidedBy,
        judge_verdict: f.judge?.status ?? null, quote: f.judge?.quote ?? null, reason: f.judge?.reason ?? null,
        evidence_source: f.judge?.evidence_source ?? null, withheld_because: f.judge?.why ?? null,
        your_label: labelOf(p, r.id, c.id), overridden: f.decidedBy === "you over the judge",
        criterion_trust: trustLabel(trustOf(p, v, c.id)),
      };
    })),
  };
}

// One header row, then one row per item and criterion; run-level facts repeat on every row so the
// file stays a plain table any spreadsheet opens.
const CSV_COLUMNS = ["item", "criterion", "verdict", "decided_by", "judge_verdict", "quote", "reason", "evidence_source", "withheld_because", "your_label", "overridden", "criterion_trust", "criteria_version", "measured_after_seeing_earlier_results", "model", "held_back_caught", "held_back_passed", "held_back_too_wide_to_decide"];

// A spreadsheet treats a cell starting with = + - @ as a formula; such cells get a leading apostrophe.
function cell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCSV(p, v, opts) {
  const j = exportJSON(p, v, opts);
  const rows = j.verdicts.map((r) => {
    const a = j.held_back[r.criterion];
    const full = {
      ...r,
      criteria_version: v,
      measured_after_seeing_earlier_results: j.measured_after_seeing_earlier_results,
      model: j.model ?? "",
      held_back_caught: a?.caught ? `${a.caught.k} of ${a.caught.n}` : "",
      held_back_passed: a?.passed ? `${a.passed.k} of ${a.passed.n}` : "",
      held_back_too_wide_to_decide: a ? a.too_wide_to_decide : "",
    };
    return CSV_COLUMNS.map((k) => cell(full[k])).join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}
