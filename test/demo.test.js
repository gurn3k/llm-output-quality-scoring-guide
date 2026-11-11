// The demo file the page loads: built from the test set, honest about its placeholder results.
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
  assert.equal(demo.rows.length, 92);
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
