// The whole flow in a real browser: the demo end to end in replay mode (no key, no cost), labelling
// by keyboard alone, loaded markup shown as text, and every screen fitting at phone and desktop widths
// in light and dark, with a normal and a wide font.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { serve } from "../scripts/server.mjs";
import { launch, SKIP } from "./harness.mjs";

const SITE = fileURLToPath(new URL("../site", import.meta.url));

test("the flow in a real browser", { skip: SKIP }, async (t) => {
  const server = await serve(SITE);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await launch();
  t.after(async () => { await b.close(); server.close(); });

  const click = async (k) => {
    await b.until(`!!document.querySelector('[data-k="${k}"]') && !document.querySelector('[data-k="${k}"]').disabled`, `button ${k}`);
    await b.js(`document.querySelector('[data-k="${k}"]').click()`);
  };
  const heading = () => b.js(`document.querySelector(".panel h2")?.textContent`);
  const project = () => b.js(`JSON.parse(localStorage.getItem("lqsg.project"))`);
  const press = async (key) => {
    const codes = { Enter: 13, Backspace: 8 };
    const base = { key, code: key.length === 1 ? (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`) : key, windowsVirtualKeyCode: codes[key] ?? key.toUpperCase().charCodeAt(0) };
    await b.cdp("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(key.length === 1 ? { text: key } : {}) });
    await b.cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await new Promise((ok) => setTimeout(ok, 30));
  };
  const fresh = async () => {
    await b.open(url);
    await b.js(`localStorage.clear()`);
    await b.open(url);
    await b.until(`!!document.querySelector('[data-k="start-demo"]')`, "the start screen");
  };
  // Every screen: nothing outside its container, at both widths, both themes, both fonts.
  const fits = async (name) => {
    for (const theme of ["light", "dark"]) {
      await b.scheme(theme);
      for (const width of [390, 1280]) {
        for (const wide of [false, true]) {
          await b.viewport(width);
          await b.wideFont(wide);
          assert.deepEqual(await b.overflow(), [], `${name} at ${width}px ${theme}${wide ? " wide font" : ""}`);
          if (!wide) await b.screenshot(`${name}-${width}-${theme}`);
        }
      }
    }
    await b.wideFont(false);
    await b.scheme("light");
    await b.viewport(1280);
  };

  await t.test("the demo runs end to end in replay mode, without a key", async () => {
    await fresh();
    await fits("start");
    await click("start-demo");
    await b.until(`document.querySelector("#mode-badge").textContent === "Demo"`, "the demo badge");
    assert.match(await b.js(`document.querySelector(".summary-line").textContent`), /^220 loaded, 0 refused$/);
    await fits("load");
    await click("load-next");
    assert.equal(await heading(), "Write your criteria");
    await click("demo-vague");
    assert.ok(await b.js(`[...document.querySelectorAll(".notice-tip")].every((n) => !n.hidden)`), "vague criteria say the judge has less to go on");
    await click("demo-good");
    await fits("criteria");
    await click("crit-save");
    assert.equal(await heading(), "Is this reply good?");
    assert.match(await b.js(`document.querySelector(".panel").textContent`), /Reply 1 of 40/);
    await fits("label");
    assert.equal(await b.js(`document.querySelectorAll(".panel kbd").length >= 8`), true, "the keys are shown");
    await click("fill-key");
    await click("lab-finish");
    assert.equal(await heading(), "Now the judge scores your labelled replies");
    assert.match(await b.js(`document.querySelector(".panel").textContent`), /placeholders/);
    await click("run-start");
    await b.until(`document.querySelector(".panel h2").textContent === "How far can you trust the judge?"`, "the trust screen");
    const panel = await b.js(`document.querySelector(".panel").textContent`);
    assert.match(panel, /held back/);
    assert.match(panel, /Too wide to decide yet/);
    assert.match(panel, /likely between \d+% and \d+%/);
    await fits("trust");
    // Rounds: label more keeps the first 40 and their labels.
    const before = (await project()).sample.ids;
    await b.js(`document.querySelector('[data-k^="more-"]').click()`);
    assert.equal(await heading(), "Is this reply good?");
    const after = await project();
    assert.deepEqual(after.sample.ids.slice(0, 40), before);
    assert.equal(after.labellingDone, false);
    await click("fill-key");
    await click("lab-finish");
    await click("run-start");
    await b.until(`document.querySelector(".panel h2").textContent === "How far can you trust the judge?"`, "the trust screen again");
    // Trust two criteria on thin evidence, then score the rest.
    await click("trust-accurate");
    await click("trust-tone");
    assert.match(await b.js(`document.querySelector(".panel").textContent`), /Trusted before the range narrowed/);
    await click("to-score");
    assert.equal(await heading(), "Score the rest");
    await fits("score");
    await click("run-start");
    await b.until(`!!document.querySelector('[data-k="to-results"]')`, "scoring to finish");
    await click("to-results");
    assert.equal(await heading(), "Results");
    const res = await b.js(`document.querySelector(".panel").textContent`);
    assert.match(res, /Withheld \d+ · Unclear \d+ · Errors 0/);
    assert.match(res, /Review pile: unclear \d+/);
    await fits("results");
    // Override an item from the list; the judge's verdict is kept.
    // Your own labels need no override; open the first item the judge decided.
    await b.js(`[...document.querySelectorAll("details.item")].find((d) => /decided by judge/.test(d.querySelector("summary").textContent)).open = true`);
    await b.until(`!!document.querySelector("details.item .item-body [data-k^='ov-f-']")`, "an opened item");
    await b.js(`document.querySelector("details.item .item-body [data-k^='ov-f-']").click()`);
    const p = await project();
    const ov = Object.values(Object.values(p.overrides)[0])[0];
    assert.ok(Object.values(ov)[0].verdict === "fail");
    assert.match(await b.js(`[...document.querySelectorAll("details.item")].map((d) => d.textContent).join(" ")`), /decided by you over the judge/);
    // Export: capture the CSV the button would download.
    await b.js(`window.__dl = []; URL.createObjectURL = (blob) => { window.__dl.push(blob); return "blob:x"; }; HTMLAnchorElement.prototype.click = function () {}`);
    await click("exp-csv");
    const csv = await b.js(`window.__dl[0].text()`);
    assert.match(csv.split("\r\n")[0], /^item,criterion,verdict,decided_by,judge_verdict,quote,reason/);
    assert.match(csv, /you over the judge/);
    assert.match(csv, /trusted before the range narrowed/);
    assert.deepEqual(b.errors, []);
  });

  await t.test("work survives a reload", async () => {
    await b.open(url);
    await b.until(`document.querySelector(".panel h2")?.textContent === "Results"`, "the results after reload");
    assert.equal(await b.js(`document.querySelector("#mode-badge").textContent`), "Demo");
  });

  await t.test("labelling works from the keyboard alone", async () => {
    await fresh();
    await click("start-demo");
    await click("load-next");
    await click("crit-save");
    await b.js(`document.activeElement.blur()`);
    await press("1"); await press("4"); await press("5"); await press("8");
    let p = await project();
    const first = p.sample.ids[0];
    assert.deepEqual(p.labels[first], { accurate: "pass", answers: "fail", escalates: "pass", tone: "fail" });
    await press("Enter");
    assert.match(await b.js(`document.querySelector(".panel").textContent`), /Reply 2 of 40/);
    await press("s");
    p = await project();
    assert.deepEqual(Object.values(p.labels[p.sample.ids[1]]), ["skip", "skip", "skip", "skip"]);
    assert.match(await b.js(`document.querySelector(".panel").textContent`), /Reply 3 of 40/);
    await press("Backspace"); await press("Backspace");
    assert.match(await b.js(`document.querySelector(".panel").textContent`), /Reply 1 of 40/);
    await press("2");
    assert.equal((await project()).labels[first].accurate, "fail", "a label can be changed");
    assert.equal(await b.js(`document.querySelector('[data-k="v-accurate-fail"]').getAttribute("aria-pressed")`), "true");
    assert.deepEqual(b.errors, []);
  });

  await t.test("a reply containing markup shows as text and never runs", async () => {
    await fresh();
    await click("start-own");
    const csv = 'input,output\n"Hi <b>there</b>","<img src=x onerror=""window.__pwned=1""> Your order ships <script>window.__pwned=2</script> today."\n"Second","Plain reply here."';
    await b.js(`document.getElementById("paste").value = ${JSON.stringify(csv)}`);
    await click("load-paste");
    assert.match(await b.js(`document.querySelector(".summary-line").textContent`), /^2 loaded, 0 refused$/);
    assert.equal(await b.js(`document.querySelectorAll("#app img, #app script, #app b").length`), 0);
    assert.match(await b.js(`document.querySelector(".data-wrap:nth-child(2) .data").textContent`), /<img src=x onerror="window.__pwned=1">/);
    await fits("load-own");
    await click("load-next");
    await b.js(`document.getElementById("c0-name").value = "Answers"; document.getElementById("c0-name").dispatchEvent(new Event("input"))`);
    await b.js(`document.getElementById("c0-pass").value = "Says when the order ships."; document.getElementById("c0-pass").dispatchEvent(new Event("input"))`);
    await click("crit-save");
    assert.equal(await heading(), "Is this reply good?");
    assert.equal(await b.js(`document.querySelectorAll("#app img, #app script").length`), 0);
    assert.equal(await b.js(`window.__pwned ?? null`), null);
    assert.deepEqual(b.errors, []);
  });

  await t.test("bad files are refused with row numbers, and unclear headers ask which column is which", async () => {
    await fresh();
    await click("start-own");
    await b.js(`document.getElementById("paste").value = "question,answer\\nq1,a1\\nq2,\\nq3,a3"`);
    await click("load-paste");
    assert.match(await b.js(`document.querySelector(".choose h3").textContent`), /Which columns/);
    await b.js(`document.getElementById("col-output").value = "answer"`);
    await click("use-cols");
    assert.match(await b.js(`document.querySelector(".summary-line").textContent`), /^2 loaded, 1 refused$/);
    assert.match(await b.js(`document.querySelector(".refused").textContent`), /Row 3: the reply is empty/);
  });

  await t.test("live mode asks for a key and an estimate before any paid call, and sends nothing without them", async () => {
    await fresh();
    await b.js(`window.__calls = []; const f = window.fetch; window.fetch = (u, o) => { window.__calls.push(String(u)); return f(u, o); }`);
    await click("start-own");
    await b.js(`document.getElementById("paste").value = "input,output\\nq1,a1 is the answer\\nq2,a2 is the answer"`);
    await click("load-paste");
    await click("load-next");
    await b.js(`for (const [id, v] of [["c0-name", "Answers"], ["c0-pass", "It answers."]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input")); }`);
    await click("crit-save");
    await b.js(`document.activeElement.blur()`);
    await press("1"); await press("Enter"); await press("2");
    await click("lab-finish");
    assert.equal(await b.js(`document.querySelector('[data-k="run-start"]').disabled`), true, "can't start before an estimate");
    await click("run-estimate");
    assert.match(await b.js(`document.querySelector(".notice-error").textContent`), /key/);
    assert.deepEqual(await b.js(`window.__calls.filter((u) => u.includes("anthropic"))`), []);
    await fits("score-live");
    assert.equal(await b.js(`document.getElementById("api-key").type`), "password");
  });

  await t.test("live mode with a fake API: estimate, pause at the cap, raise it, resume without repeats", async () => {
    await fresh();
    // A stand-in for api.anthropic.com inside the page: counts tokens, answers every judgment "unclear".
    await b.js(`window.__sent = []; window.fetch = async (u, o) => {
      window.__sent.push({ url: String(u), key: o.headers["x-api-key"], browser: o.headers["anthropic-dangerous-direct-browser-access"] });
      const json = (x) => new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });
      if (String(u).endsWith("/count_tokens")) return json({ input_tokens: 600 });
      return json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ verdict: "unclear", evidence_source: "output", quote: "", reason: "Can't tell." }) }], usage: { input_tokens: 1000, output_tokens: 200 } });
    }`);
    await click("start-own");
    const csv = ["input,output", ...[1, 2, 3, 4, 5, 6].map((n) => `q${n},answer number ${n}`)].join("\n");
    await b.js(`document.getElementById("paste").value = ${JSON.stringify(csv)}`);
    await click("load-paste");
    await click("load-next");
    await b.js(`for (const [id, v] of [["c0-name", "Answers"], ["c0-pass", "It answers."]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input")); }`);
    await click("crit-save");
    await b.js(`document.activeElement.blur()`);
    for (let i = 0; i < 6; i++) { await press("1"); await press("Enter"); }
    // Enter on the last reply, with everything labelled, finishes labelling.
    await b.until(`document.querySelector(".panel h2").textContent === "Now the judge scores your labelled replies"`, "labelling to finish by keyboard");
    await b.js(`{ const k = document.getElementById("api-key"); k.value = "sk-ant-test-key"; k.dispatchEvent(new Event("input")); }`);
    await b.js(`{ const c = document.getElementById("cap"); c.value = "0.09"; c.dispatchEvent(new Event("input")); }`);
    await click("run-estimate");
    await b.until(`/Estimated cost for 6 calls/.test(document.querySelector(".panel").textContent)`, "the estimate");
    await click("run-start");
    await b.until(`/Paused at the cap/.test(document.querySelector(".panel").textContent)`, "the cap pause");
    const firstRun = (await b.js(`window.__sent`)).filter((s) => s.url.endsWith("/v1/messages")).length;
    assert.ok(firstRun > 0 && firstRun < 6, `paused part-way: ${firstRun} calls`);
    assert.equal((await project()).runs[1] && Object.keys((await project()).runs[1].results).length, firstRun, "finished results are kept");
    await b.js(`{ const c = document.getElementById("cap"); c.value = "1"; c.dispatchEvent(new Event("input")); }`);
    await click("run-start");
    await b.until(`document.querySelector(".panel h2").textContent === "How far can you trust the judge?"`, "the trust screen");
    const sent = await b.js(`window.__sent`);
    assert.equal(sent.filter((s) => s.url.endsWith("/v1/messages")).length, 6, "every pair sent exactly once across the pause");
    assert.ok(sent.every((s) => s.url.startsWith("https://api.anthropic.com/v1/") && s.key === "sk-ant-test-key" && s.browser === "true"));
    assert.equal(await b.js(`localStorage.getItem("lqsg.apikey")`), null, "the key isn't stored unless asked");
    assert.doesNotMatch(await b.js(`localStorage.getItem("lqsg.project")`), /sk-ant/, "the key never goes into the project");
    assert.deepEqual(b.errors, []);
  });
});
