// The demo file the page loads: built from the test set and a real judge run, and honest about which.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FILE = new URL("../site/data/demo.json", import.meta.url);
const demo = JSON.parse(readFileSync(FILE, "utf8"));

test("the demo file is exactly what the build script makes from the test set", () => {
  const before = readFileSync(FILE, "utf8");
  execFileSync(process.execPath, [fileURLToPath(new URL("../eval/build-demo.mjs", import.meta.url))], { stdio: "pipe" });
  assert.equal(readFileSync(FILE, "utf8"), before, "rebuild the demo: node eval/build-demo.mjs");
});

test("the demo has every reply, a label per criterion, and ids that don't hint at the planted flaw", () => {
  assert.equal(demo.rows.length, 220);
  for (const r of demo.rows) {
    assert.match(r.id, /^row-\d+$/);
    assert.deepEqual(Object.keys(demo.labels[r.id]).sort(), demo.criteria.good.map((c) => c.id).sort());
  }
});

test("while the stored results are placeholders, the file and every reason say so", () => {
  if (!demo.placeholder) return;
  for (const rep of demo.replays) {
    assert.equal(rep.model, "placeholder");
    for (const byCrit of Object.values(rep.results)) for (const body of Object.values(byCrit)) {
      assert.match(JSON.parse(body.content[0].text).reason, /^Placeholder result/);
    }
  }
});

test("real stored results are the judge run's own replies, one per reply and criterion, none a placeholder", () => {
  if (demo.placeholder) return;
  for (const rep of demo.replays) {
    assert.match(rep.model, /^claude-/);
    assert.match(rep.ran, /^\d{4}-\d{2}-\d{2}$/);
    const run = JSON.parse(readFileSync(new URL(`../eval/runs/full-sonnet-${rep.set}-all.json`, import.meta.url), "utf8"));
    assert.equal(run.model, rep.model);
    assert.equal(Object.keys(rep.results).length, demo.rows.length);
    for (const r of demo.rows) {
      for (const c of demo.criteria[rep.set]) {
        const body = rep.results[r.id][c.id];
        assert.ok(body, `${r.id} ${c.id}`);
        assert.doesNotMatch(body.content[0].text, /Placeholder result/);
      }
    }
  }
});
