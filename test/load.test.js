import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load, parseTable, toItems, MAX_ROWS } from "../site/src/load.js";

const DIR = new URL("./fixtures/loading/", import.meta.url);
const expected = JSON.parse(readFileSync(new URL("expected.json", DIR), "utf8"));
const read = (name) => readFileSync(new URL(name, DIR), "utf8");
const strip = (items) => items.map(({ input, output, reference }) => ({ input, output, reference }));

for (const [name, want] of Object.entries(expected)) {
  test(`loads ${name} as expected`, () => {
    let got = load(read(name), name);
    if (want.needsColumnChoice) {
      assert.equal(got.needsColumnChoice, true);
      assert.deepEqual(got.columns, want.columns);
      got = toItems(got.table, want.choose);
    }
    if (want.error) {
      assert.match(got.error ?? "", new RegExp(want.error, "i"));
      return;
    }
    assert.equal(got.error, null);
    if (want.loaded) assert.deepEqual(strip(got.items), want.loaded);
    if (want.loadedCount) assert.equal(got.items.length, want.loadedCount);
    assert.deepEqual(got.refused.map((r) => r.row), want.refused.map((r) => r.row), "refused rows");
    want.refused.forEach((r, i) => assert.match(got.refused[i].reason, new RegExp(r.reason, "i"), `row ${r.row}`));
  });
}

test("every row in a file is either loaded or refused (nothing disappears)", () => {
  // malformed.csv: rows 2-6 are counted one by one; the unclosed quote in row 7 takes 7 and 8 together.
  const got = load(read("malformed.csv"), "malformed.csv");
  assert.equal(got.items.length + got.refused.length, 6);
  const jsonl = load(read("items.jsonl"), "items.jsonl");
  assert.equal(jsonl.items.length + jsonl.refused.length, 7, "7 non-blank lines");
});

test("items get stable ids from their row numbers", () => {
  const got = load(read("malformed.csv"), "malformed.csv");
  assert.deepEqual(got.items.map((i) => i.id), ["row-2", "row-6"]);
});

test("a pasted table and its file give the same items", () => {
  const pasted = load(read("sheets-paste.tsv"));
  const file = load(read("sheets-paste.tsv"), "sheets-paste.tsv");
  assert.deepEqual(strip(pasted.items), strip(file.items));
});

test("delimiter detection ignores commas inside quotes", () => {
  assert.equal(parseTable('"a, b, c";x\n1;2\n').format, "csv;");
  assert.equal(parseTable('input,output\n"1; 2",3\n').format, "csv");
});

test("the limit is exactly 500 rows", () => {
  assert.equal(MAX_ROWS, 500);
  const exactly = "input,output\n" + Array.from({ length: 500 }, (_, i) => `Q${i},A${i}`).join("\n");
  const got = load(exactly);
  assert.equal(got.items.length, 500);
  assert.deepEqual(got.refused, []);
});

test("loaded text is kept as text, markup and all", () => {
  const got = load('input,output\nhi,"<img src=x onerror=alert(1)>"\n');
  assert.equal(got.items[0].output, "<img src=x onerror=alert(1)>");
});
