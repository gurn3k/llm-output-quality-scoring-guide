// The answer key is the source of truth for every later measurement, so it's checked first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => JSON.parse(readFileSync(new URL(`../eval/testset/${f}`, import.meta.url), "utf8"));
const { items } = read("items.json");
const { criteria, key } = read("answer-key.json");
const specs = read("specs.json");
const good = read("criteria.json").good;

test("60 items with unique ids, each with a customer message and a reply", () => {
  assert.equal(items.length, 60);
  assert.equal(new Set(items.map((i) => i.id)).size, 60);
  for (const i of items) {
    assert.ok(i.input.trim().length > 20, `${i.id} input`);
    assert.ok(i.output.trim().length > 20, `${i.id} output`);
  }
});

test("the key covers every item and every criterion with pass or fail", () => {
  assert.deepEqual(criteria, good.map((c) => c.id));
  assert.deepEqual(Object.keys(key).sort(), items.map((i) => i.id).sort());
  for (const [id, k] of Object.entries(key)) {
    assert.deepEqual(Object.keys(k.labels).sort(), [...criteria].sort(), id);
    for (const v of Object.values(k.labels)) assert.ok(v === "pass" || v === "fail", id);
  }
});

test("clean items pass everything; flawed items fail exactly their named criterion", () => {
  for (const s of specs.items) {
    const fails = Object.entries(key[s.id].labels).filter(([, v]) => v === "fail").map(([c]) => c);
    assert.deepEqual(fails, s.kind === "clean" ? [] : [s.criterion], s.id);
  }
});

test("the mix: 20 clean (6 escalations, 2 non-English, 1 long), 9 failures per criterion, 4 injections", () => {
  const kinds = Object.values(key);
  assert.equal(kinds.filter((k) => k.kind === "clean").length, 20);
  assert.equal(kinds.filter((k) => k.kind === "clean" && k.escalation_required).length, 6);
  assert.equal(kinds.filter((k) => k.language !== "English").length, 2);
  for (const c of criteria) assert.equal(specs.items.filter((s) => s.criterion === c).length, 9, c);
  assert.equal(kinds.filter((k) => k.kind === "injection").length, 4);
});

test("each injection is its twin's reply plus the instruction, labelled the same as the twin", () => {
  for (const inj of specs.injections) {
    const item = items.find((i) => i.id === inj.id);
    const twin = items.find((i) => i.id === inj.twin);
    assert.equal(item.output, twin.output + inj.text, inj.id);
    assert.equal(item.input, twin.input, inj.id);
    assert.deepEqual(key[inj.id].labels, key[inj.twin].labels, inj.id);
    assert.ok(Object.values(key[inj.id].labels).includes("fail"), `${inj.id}: the twin must be a failure, so a flipped verdict is visible`);
  }
});

test("the fictional company is labelled as fictional", () => {
  const policy = readFileSync(new URL("../eval/testset/policy.md", import.meta.url), "utf8");
  assert.match(policy, /fictional online shop/);
});
