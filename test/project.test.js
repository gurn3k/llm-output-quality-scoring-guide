import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "../site/src/project.js";
import { parseTable } from "../site/src/load.js";

const rows = Array.from({ length: 12 }, (_, i) => ({ id: `row-${i + 2}`, row: i + 2, input: `Question ${i}`, output: `Answer ${i}, with = and "quotes"`, reference: "" }));
const criteria = [{ id: "accurate", name: "Accurate", pass: "Matches policy.", fail_examples: [] }, { id: "tone", name: "Tone", pass: "Polite.", fail_examples: [] }];
const NOW = "2026-11-10T12:00:00.000Z";

function labelled() {
  const p = P.newProject({ rows, criteria, seed: 42, now: NOW });
  P.drawLabelSample(p, 9);
  for (const id of p.sample.ids) for (const c of criteria) P.setLabel(p, id, c.id, Number(id.slice(4)) % 3 === 0 ? "fail" : "pass");
  P.finishLabelling(p);
  return p;
}
const judged = (p, v, judgeFn) => {
  for (const r of p.rows) for (const c of criteria) {
    const status = judgeFn(r, c);
    P.recordResult(p, v, r.id, c.id, { status, judgeVerdict: status, quote: "Answer", reason: "r", evidence_source: "output", body: { big: "x" } }, "claude-sonnet-5-5");
  }
};

test("a project survives a save/load round trip unchanged", () => {
  const p = labelled();
  judged(p, 1, () => "pass");
  P.override(p, 1, "row-3", "tone", "fail", NOW);
  P.trust(p, 1, "accurate", NOW);
  P.markHeldBackSeen(p, 1);
  assert.deepEqual(P.parseProject(P.serialize(p)), p);
  const s = fakeStorage();
  const store = P.createStore(() => s);
  assert.equal(store.save(p), true);
  assert.deepEqual(store.load(), p);
});

test("the raw API reply isn't kept in the project (keeps saves small)", () => {
  const p = labelled();
  judged(p, 1, () => "pass");
  assert.equal(P.resultOf(p, 1, "row-2", "accurate").body, undefined);
});

test("results are never shown against another criteria version", () => {
  const p = labelled();
  judged(p, 1, () => "pass");
  const v2 = P.editCriteria(p, [{ ...criteria[0], pass: "Edited." }, criteria[1]], NOW);
  assert.equal(v2, 2);
  assert.deepEqual(P.resultsFor(p, 2), {});
  const unlabelled = p.rows.find((r) => !p.sample.ids.includes(r.id)).id;
  assert.equal(P.finalVerdict(p, 1, unlabelled, "accurate").verdict, "pass");
  assert.equal(P.finalVerdict(p, 2, unlabelled, "accurate").verdict, "not scored");
  assert.equal(P.calibration(p, 2, "accurate").heldBack.tally.excluded, p.sample.heldBack.length, "nothing from v1 counts for v2");
  assert.throws(() => P.recordResult(p, 7, "row-2", "accurate", { status: "pass" }, "m"), /no criteria version 7/);
  assert.throws(() => P.recordResult(p, 1, "row-2", "accurate", { status: "pass" }, "claude-opus-5-5"), /new version/);
});

test("the 'measured after you saw earlier results' flag", () => {
  const p = labelled();
  const v2 = P.editCriteria(p, criteria, NOW);
  assert.equal(P.versionOf(p, v2).measuredAfterSeeing, false, "editing before seeing held-back figures is clean");
  P.markHeldBackSeen(p, v2);
  const v3 = P.editCriteria(p, criteria, NOW);
  assert.equal(P.versionOf(p, v3).measuredAfterSeeing, true);
  assert.equal(P.calibration(p, v3, "accurate").measuredAfterSeeing, true);
  assert.equal(P.versionOf(p, 1).measuredAfterSeeing, false, "earlier versions keep their flag");
});

test("the sample is drawn once and labelling must be complete before results show", () => {
  const p = P.newProject({ rows, criteria, seed: 42, now: NOW });
  assert.throws(() => P.setLabel(p, "row-2", "accurate", "pass"), /isn't in the labelling sample/);
  P.drawLabelSample(p, 9);
  assert.throws(() => P.drawLabelSample(p, 9), /already drawn/);
  assert.equal(p.sample.ids.length, 9);
  assert.equal(p.sample.heldBack.length, 3);
  assert.equal(P.resultsVisible(p), false);
  assert.throws(() => P.calibration(p, 1, "accurate"), /hidden until labelling is finished/);
  assert.throws(() => P.finishLabelling(p), /still need a label/);
  assert.throws(() => P.setLabel(p, p.sample.ids[0], "accurate", "maybe"), /pass, fail or skip/);
});

test("calibration counts held-back and tuning separately and lists every disagreement", () => {
  const p = labelled();
  judged(p, 1, () => "pass"); // the judge passes everything, so it misses every failure you marked
  const cal = P.calibration(p, 1, "accurate");
  const fails = (ids) => ids.filter((id) => P.labelOf(p, id, "accurate") === "fail").length;
  assert.equal(cal.heldBack.caught?.n ?? 0, fails(p.sample.heldBack));
  assert.equal(cal.heldBack.caught?.k ?? 0, 0);
  assert.equal(cal.disagreements.length, fails(p.sample.ids));
  for (const d of cal.disagreements) {
    assert.equal(d.you, "fail");
    assert.equal(d.status, "pass");
    assert.equal(d.quote, "Answer");
  }
});

test("overrides keep the judge's verdict, quote and reason; who decided is recorded", () => {
  const p = labelled();
  judged(p, 1, () => "pass");
  const unlabelled = p.rows.find((r) => !p.sample.ids.includes(r.id)).id;
  assert.equal(P.finalVerdict(p, 1, unlabelled, "tone").decidedBy, "judge");
  P.override(p, 1, unlabelled, "tone", "fail", NOW);
  const f = P.finalVerdict(p, 1, unlabelled, "tone");
  assert.deepEqual([f.verdict, f.decidedBy, f.judge.status, f.judge.quote], ["fail", "you over the judge", "pass", "Answer"]);
  const labelledId = p.sample.ids.find((id) => P.labelOf(p, id, "tone") === "fail");
  assert.equal(P.finalVerdict(p, 1, labelledId, "tone").decidedBy, "you");
  P.clearOverride(p, 1, unlabelled, "tone");
  assert.equal(P.finalVerdict(p, 1, unlabelled, "tone").decidedBy, "judge");
});

test("pass rates count withheld and unclear beside the rate, never inside it", () => {
  const p = P.newProject({ rows: rows.slice(0, 4), criteria, seed: 1, now: NOW });
  const statuses = ["pass", "fail", "withheld", "unclear"];
  p.rows.forEach((r, i) => P.recordResult(p, 1, r.id, "accurate", { status: statuses[i] }, "m"));
  const r = P.passRates(p, 1).accurate;
  assert.deepEqual([r.rate.k, r.rate.n, r.withheld, r.unclear], [1, 2, 1, 1]);
});

test("the page still works when storage throws or is missing", () => {
  const p = labelled();
  const throwing = P.createStore(() => ({ setItem() { throw new Error("QuotaExceeded"); }, getItem() { throw new Error("SecurityError"); }, removeItem() { throw new Error("x"); } }));
  assert.equal(throwing.available(), false);
  assert.equal(throwing.save(p), false);
  assert.equal(throwing.load(), null);
  assert.equal(throwing.saveKey("k"), false);
  const blocked = P.createStore(() => { throw new Error("SecurityError: access denied"); });
  assert.equal(blocked.save(p), false);
  assert.equal(blocked.load(), null);
  assert.equal(P.createStore(() => undefined).available(), false);
});

test("the key is stored separately, only when asked, and clear removes both", () => {
  const s = fakeStorage();
  const store = P.createStore(() => s);
  store.save(labelled());
  assert.equal(store.loadKey(), null);
  store.saveKey("sk-abc");
  assert.equal(store.loadKey(), "sk-abc");
  assert.ok(!s.getItem(P.STORE_KEY).includes("sk-abc"), "the key never goes into the project");
  store.forgetKey();
  assert.equal(store.loadKey(), null);
  store.saveKey("sk-abc");
  store.clear();
  assert.equal(store.load(), null);
  assert.equal(store.loadKey(), null);
});

test("opening a file that isn't a project gives a plain reason", () => {
  assert.throws(() => P.parseProject("{"), /isn't valid JSON/);
  assert.throws(() => P.parseProject('{"format":"other"}'), /isn't a project/);
  assert.throws(() => P.parseProject(JSON.stringify({ format: P.FORMAT, version: 9 })), /format version 9/);
  assert.throws(() => P.parseProject(JSON.stringify({ format: P.FORMAT, version: 1, rows: [] })), /missing its criteria/);
});

test("exports include version, model, held-back rates, every verdict, overrides and who decided", () => {
  const p = labelled();
  judged(p, 1, () => "pass");
  const unlabelled = p.rows.find((r) => !p.sample.ids.includes(r.id)).id;
  P.override(p, 1, unlabelled, "accurate", "fail", NOW);
  const j = P.exportJSON(p, 1, { now: NOW });
  assert.equal(j.criteria_version, 1);
  assert.equal(j.model, "claude-sonnet-5-5");
  assert.ok("caught" in j.held_back.accurate && j.held_back.accurate.passed, "held-back figures are in the export (caught may be empty when no failures are held back)");
  assert.equal(j.verdicts.length, rows.length * criteria.length);
  const o = j.verdicts.find((v) => v.item === unlabelled && v.criterion === "accurate");
  assert.deepEqual([o.verdict, o.decided_by, o.judge_verdict, o.overridden], ["fail", "you over the judge", "pass", true]);

  const csv = P.exportCSV(p, 1, { now: NOW });
  const table = parseTable(csv, "export.csv");
  assert.equal(table.error, null);
  assert.equal(table.records.length, rows.length * criteria.length, "one row per item and criterion, and the file reads back as a table");
  assert.ok(table.columns.includes("held_back_caught") && table.columns.includes("decided_by"));
  for (const r of table.records) assert.equal(r.cells.length, table.columns.length);
});

test("a CSV cell that a spreadsheet would run as a formula is neutralised", () => {
  const p = P.newProject({ rows: [{ id: "row-2", row: 2, input: "q", output: "a" }], criteria: [criteria[0]], seed: 1, now: NOW });
  P.recordResult(p, 1, "row-2", "accurate", { status: "pass", quote: '=HYPERLINK("http://x","click")', reason: "+1 good" }, "m");
  const csv = P.exportCSV(p, 1, { now: NOW });
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x"",""click""\)"/);
  assert.match(csv, /,'\+1 good,/);
});

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("labelling more in rounds keeps earlier labels and the held-back set, and reopens labelling", () => {
  const p = labelled();
  const before = structuredClone(p.sample);
  const added = P.extendSample(p, 3);
  assert.equal(added.length, 3);
  assert.deepEqual(p.sample.ids.slice(0, 9), before.ids);
  assert.deepEqual(p.sample.heldBack.slice(0, before.heldBack.length), before.heldBack);
  assert.equal(p.labellingDone, false, "results hide again until the new items are labelled");
  assert.throws(() => P.calibration(p, 1, "accurate"), /hidden/);
  for (const id of added) for (const c of criteria) P.setLabel(p, id, c.id, "pass");
  P.finishLabelling(p);
  assert.equal(P.extendSample(p, 100).length, 0, "can't draw past the last row");
});

test("labels needed: estimated from the failure rate marked so far, rounded up to 10", () => {
  const rowsN = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, row: i + 2, input: "q", output: "a" }));
  const p = P.newProject({ rows: rowsN, criteria, seed: 3, now: NOW });
  P.drawLabelSample(p, 30);
  p.sample.ids.forEach((id, i) => { P.setLabel(p, id, "accurate", i % 5 === 0 ? "fail" : "pass"); P.setLabel(p, id, "tone", "pass"); });
  const held = p.sample.heldBack.filter((id) => P.labelOf(p, id, "accurate") === "fail").length;
  assert.equal(P.labelsNeeded(p, "accurate"), Math.ceil(((5 - held) * 3) / 0.2 / 10) * 10);
  assert.equal(P.labelsNeeded(p, "tone"), Infinity, "no failures marked: no estimate");
});

test("trusting a too-wide criterion marks it as thin evidence, in the page and in exports", () => {
  const p = labelled();
  judged(p, 1, () => "pass");
  assert.equal(P.trust(p, 1, "accurate", NOW).thin, true, "9 labels can't meet the rule");
  assert.equal(P.trustLabel(P.trustOf(p, 1, "accurate")), "trusted before the range narrowed");
  assert.equal(P.trustLabel(P.trustOf(p, 1, "tone")), "not trusted");
  assert.deepEqual(P.trustedIds(p, 1), ["accurate"]);
  const j = P.exportJSON(p, 1, { now: NOW });
  assert.equal(j.trust.accurate, "trusted before the range narrowed");
  assert.ok(j.verdicts.filter((v) => v.criterion === "accurate").every((v) => v.criterion_trust === "trusted before the range narrowed"));
  assert.match(P.exportCSV(p, 1, { now: NOW }), /trusted before the range narrowed/);
  P.untrust(p, 1, "accurate");
  assert.deepEqual(P.trustedIds(p, 1), []);
});
