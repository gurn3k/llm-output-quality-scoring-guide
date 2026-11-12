// The page: one step at a time (docs/DESIGN.md). State lives in S; every change calls render().
// Loaded text is only ever inserted as text (ui.js builds the DOM without HTML strings).
import { h, button, pct, money, plural, rateBlock, pill, countRow, dataBox, evidence, notice, verdictWord, download } from "./ui.js";
import { load, toItems, summary, MAX_ROWS } from "./load.js";
import { newSeed } from "./random.js";
import * as P from "./project.js";
import { MODELS, DEFAULTS, liveJudge, replayJudge, criterionText, buildRequest } from "./judge.js";
import { PRICES_CHECKED, DEFAULT_CAP, estimate, worstCase, createBudget, missing, run } from "./cost.js";

const store = P.createStore();
const STEPS = [
  ["load", "Bring outputs"],
  ["criteria", "Write criteria"],
  ["label", "Label"],
  ["trust", "How far to trust it"],
  ["score", "Score the rest"],
  ["results", "Results"],
];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
const MAX_CRITERIA = 6;
const OUTPUT_TOKENS_GUESS = 120; // typical judge reply, measured on the sample run: 112 tokens on average (eval/runs)
const PAGE = 25;

let apiKey = "";
let S;
function fresh() {
  return {
    mode: null, // "demo" | "own"
    step: "start",
    draft: null, // before the project exists: { rows, refused, error, table, needsColumnChoice, choice, criteria, reference, sampleSize }
    edit: null, // criteria being edited once the project exists
    p: null,
    demo: null,
    ui: { labelIndex: null, run: null, estimate: null, model: DEFAULTS.model, cap: DEFAULT_CAP, filter: { criterion: "all", verdict: "all" }, shown: PAGE, open: new Set(), confirmClear: false, error: null, remember: false, focusHeading: false },
  };
}

// --- Saving ---

function persist() {
  if (S.p) store.save(S.p);
}

async function demoData() {
  if (!S.demo) {
    const res = await fetch("data/demo.json");
    if (!res.ok) throw new Error("The demo data didn't load. Reload the page to try again.");
    S.demo = await res.json();
  }
  return S.demo;
}

// --- Where you can go ---

const v = () => P.current(S.p).v;
const list = () => P.current(S.p).list;
const rowById = () => Object.fromEntries(S.p.rows.map((r) => [r.id, r]));

function scoredAny() {
  const sample = new Set(S.p.sample?.ids ?? []);
  const outside = S.p.rows.filter((r) => !sample.has(r.id));
  if (!outside.length) return true;
  const trusted = P.trustedIds(S.p, v());
  return outside.some((r) => trusted.some((c) => P.resultOf(S.p, v(), r.id, c)));
}

function blocked(step) {
  switch (step) {
    case "load": return S.mode ? null : "Start with the demo or your own outputs first.";
    case "criteria": return S.p || S.draft?.rows?.length ? null : "Load outputs first.";
    case "label": return S.p ? null : "Write criteria and start labelling first.";
    case "trust": return S.p?.labellingDone ? null : "Finish labelling first.";
    case "score": return S.p?.labellingDone && P.trustedIds(S.p, v()).length ? null : "Trust at least one criterion first.";
    case "results": return !blocked("score") && scoredAny() ? null : "Score the rest first.";
    default: return null;
  }
}

function furthest() {
  for (const [step] of [...STEPS].reverse()) if (!blocked(step)) return step;
  return "start";
}

function go(step) {
  if (step !== "start" && blocked(step)) return;
  S.step = step;
  S.ui.error = null;
  S.ui.confirmClear = false;
  if (step === "criteria" && S.p) S.edit = { list: structuredClone(list()) };
  if (step === "label") S.ui.labelIndex = null;
  if (step === "results") S.ui.shown = PAGE;
  S.ui.focusHeading = true;
  render();
  window.scrollTo(0, 0);
}

// --- Rendering ---

let queued = false;
function soon() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

function render() {
  const app = document.getElementById("app");
  const focusKey = document.activeElement?.dataset?.k;
  const badge = document.getElementById("mode-badge");
  badge.textContent = S.mode === "demo" ? "Demo" : S.mode === "own" ? "Your data" : "";
  badge.hidden = !S.mode;
  let panel;
  try {
    panel = SCREENS[S.step]();
  } catch (e) {
    console.error(e);
    panel = [h("h2", "Something went wrong"), h("p", e.message), h("p.help", "Your work is saved on this device. Download the project to keep a copy, then reload the page.")];
  }
  app.replaceChildren(h("div.shell", rail(), h("section.panel", { "aria-labelledby": "panel-heading" }, panel)), footer());
  const heading = app.querySelector("h2");
  if (heading) { heading.id = "panel-heading"; heading.tabIndex = -1; }
  if (S.ui.focusHeading) { S.ui.focusHeading = false; heading?.focus({ preventScroll: true }); }
  else if (focusKey) app.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function rail() {
  const items = STEPS.map(([step, name], i) => {
    const why = blocked(step);
    const next = STEPS[i + 1]?.[0];
    const done = next && !blocked(next) && step !== S.step;
    const label = h("span", done ? h("span.tick", { "aria-hidden": "true" }, "✓ ") : null, name, done ? h("span.sr", " (done)") : null);
    if (why) return h("li.rail-off", h("span", { "aria-disabled": "true", "aria-describedby": `why-${step}` }, name, h("span.sr", { id: `why-${step}` }, ` (${why})`)));
    return h(`li${step === S.step ? ".rail-on" : ""}`, h("a", { href: `#${step}`, "aria-current": step === S.step ? "step" : null, dataset: { k: `rail-${step}` }, onclick: (e) => { e.preventDefault(); go(step); } }, label));
  });
  return h("nav.rail", { "aria-label": "Steps" }, h("ol", items));
}

function panelTop() {
  const out = [];
  if (!store.available()) out.push(notice("This browser won't keep your work after a reload.", "Download the project to save it."));
  if (S.ui.error) out.push(h("div.notice.notice-error", { role: "alert" }, h("p", h("strong", "That didn't work. "), S.ui.error)));
  return out;
}

function footerRow(left, right) {
  return h("div.panel-foot", h("div.foot-left", left), h("div.foot-right", right));
}

function footer() {
  const fileInput = h("input.sr-file", { type: "file", accept: ".json,application/json", id: "open-project", onchange: (e) => openProject(e.target.files[0]) });
  const clear = S.ui.confirmClear
    ? h("span.confirm", h("span", "Erase the project and any saved key from this browser? "), button("Erase everything", clearAll, { kind: "danger", key: "clear-yes" }), " ", button("Keep it", () => { S.ui.confirmClear = false; render(); }, { key: "clear-no" }))
    : button("Clear everything", () => { S.ui.confirmClear = true; render(); }, { kind: "danger", key: "clear" });
  return h("footer.site-footer",
    h("div.foot-actions",
      button("Download project", downloadProject, { key: "dl-project", disabled: !S.p }),
      h("label.btn.btn-secondary.file-btn", { for: "open-project", tabindex: "0", dataset: { k: "open-project" }, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } } }, "Open project"), fileInput,
      clear),
    h("p.small", `Prices checked ${PRICES_CHECKED}. No analytics, no third-party scripts. Your key is sent only to api.anthropic.com. `,
      h("a", { href: "https://github.com/gurn3k/llm-output-quality-scoring-guide", rel: "noopener" }, "Source code on GitHub"), "."));
}

// --- Start ---

const SCREENS = {};

SCREENS.start = () => [
  h("h2", "Check your AI judge before you trust its scores"),
  h("p.help", "Load outputs, write pass/fail criteria, and label a sample yourself. The page measures how often a judge agrees with you on labels it never saw while you tuned it. Then it scores the rest, with the evidence for every score."),
  ...panelTop(),
  h("p", "The demo uses customer support replies from a made-up shop, with planted failures and an answer key. It needs no key and costs nothing."),
  footerRow([button("Bring your own outputs", startOwn, { key: "start-own" })], [button("Try the demo (no key needed)", startDemo, { kind: "primary", key: "start-demo" })]),
];

async function startDemo() {
  try {
    const d = await demoData();
    S.mode = "demo";
    S.draft = { rows: d.rows, refused: [], error: null, criteria: structuredClone(d.criteria.good), reference: d.reference, sampleSize: 40 };
    go("load");
  } catch (e) { S.ui.error = e.message; render(); }
}

function startOwn() {
  S.mode = "own";
  S.draft = { rows: [], refused: [], error: null, criteria: [blankCriterion()], reference: "", sampleSize: 40 };
  go("load");
}

// --- Bring outputs ---

function preview(rows) {
  if (!rows.length) return null;
  return h("div.preview", h("h3", "First rows"), rows.slice(0, 3).map((r) => h("div.preview-row", h("p.small", `Row ${r.row}`), h("div.two", dataBox("Customer wrote", r.input), dataBox("AI replied", r.output)))));
}

function refusedList(refused) {
  if (!refused.length) return null;
  const shown = refused.slice(0, 50);
  return h("details.refused", { open: refused.length <= 5 }, h("summary", `Refused rows (${refused.length})`), h("ul", shown.map((r) => h("li", r.reason))), refused.length > 50 ? h("p.small", `and ${refused.length - 50} more`) : null);
}

SCREENS.load = () => {
  if (S.p) {
    return [h("h2", "Your outputs"), h("p.help", "These outputs are part of the saved project."), ...panelTop(),
      h("p.summary-line", `${plural(S.p.rows.length, "reply", "replies")} loaded`),
      h("p.small", "To load different outputs, download this project if you want to keep it, then use Clear everything."),
      preview(S.p.rows),
      footerRow([], [button("Continue", () => go("criteria"), { kind: "primary", key: "load-next" })])];
  }
  const d = S.draft;
  if (S.mode === "demo") {
    return [h("h2", "The demo's outputs"), h("p.help", `${S.demo.about} Its support policy is used as reference material.`), ...panelTop(),
      h("p.summary-line", summary({ items: d.rows, refused: d.refused })),
      preview(d.rows),
      footerRow([], [button("Continue", () => go("criteria"), { kind: "primary", key: "load-next" })])];
  }
  const fileInput = h("input", { type: "file", id: "file", accept: ".csv,.tsv,.txt,.jsonl,.json,text/csv,text/plain", onchange: (e) => readFile(e.target.files[0]) });
  const paste = h("textarea.paste", { id: "paste", rows: 6, placeholder: "input,output\n\"Where is my order?\",\"It ships tomorrow.\"", "aria-describedby": "paste-help" });
  const drop = h("div.drop", {
    ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("drop-on"); },
    ondragleave: (e) => e.currentTarget.classList.remove("drop-on"),
    ondrop: (e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); },
  }, h("label", { for: "file" }, h("strong", "Choose a file"), " or drop it here: CSV, TSV or JSONL, up to ", String(MAX_ROWS), " rows."), fileInput);
  const out = [h("h2", "Bring your outputs"), h("p.help", "One row per output: the message that was sent, the AI's reply, and optionally a reference (for example the policy it should follow)."), ...panelTop(),
    drop,
    h("label.field-label", { for: "paste" }, "Or paste a table (from a spreadsheet, CSV or JSONL)"), paste,
    h("p.small", { id: "paste-help" }, "The first row names the columns, for example input and output."),
    h("div.row-actions", button("Load pasted text", () => loadText(paste.value, "pasted"), { key: "load-paste" }))];
  if (d.error) out.push(h("div.notice.notice-error", { role: "alert" }, h("p", h("strong", "Couldn't read that. "), d.error)));
  if (d.needsColumnChoice) out.push(columnChoice(d));
  if (d.rows.length || d.refused.length) out.push(h("p.summary-line", { role: "status" }, summary({ items: d.rows, refused: d.refused })), refusedList(d.refused));
  out.push(preview(d.rows), footerRow([], [button("Continue", () => go("criteria"), { kind: "primary", key: "load-next", disabled: !d.rows.length })]));
  return out;
};

function columnChoice(d) {
  const sel = (id, label, optional) => h("label.field", h("span.field-label", label), h("select", { id, dataset: { k: id } }, optional ? h("option", { value: "" }, "(none)") : null, d.table.columns.map((c) => h("option", { value: c }, c))));
  return h("div.choose", h("h3", "Which columns are which?"), h("p.help", "The headers don't say which column is the message and which is the reply."),
    h("div.fields", sel("col-input", "Message sent"), sel("col-output", "AI reply"), sel("col-ref", "Reference (optional)", true)),
    button("Use these columns", () => {
      const choice = { input: document.getElementById("col-input").value, output: document.getElementById("col-output").value, reference: document.getElementById("col-ref").value || null };
      if (choice.input === choice.output) { d.error = "The message and the reply must be different columns."; render(); return; }
      const r = toItems(d.table, choice);
      Object.assign(d, { rows: r.items, refused: r.refused, error: r.error, needsColumnChoice: false, choice });
      render();
    }, { kind: "primary", key: "use-cols" }));
}

async function readFile(file) {
  if (!file) return;
  try { loadText(await file.text(), file.name); } catch { S.draft.error = "That file couldn't be read."; render(); }
}

function loadText(text, filename) {
  const r = load(text, filename);
  Object.assign(S.draft, { rows: r.items, refused: r.refused, error: r.error, table: r.table, needsColumnChoice: r.needsColumnChoice, choice: r.choice ?? null });
  if (!r.error && !r.needsColumnChoice && !r.items.length && !r.refused.length) S.draft.error = "There were no rows under the header.";
  render();
}

// --- Write criteria ---

function blankCriterion() {
  return { id: "", name: "", pass: "", fail_examples: [] };
}

const weak = (c) => !c.fail_examples?.length || c.pass.trim().length < 40;

function slug(name, taken) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "criterion";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

SCREENS.criteria = () => {
  const editing = !!S.p;
  const crit = editing ? S.edit.list : S.draft.criteria;
  const hasResults = editing && !P.canReplaceCriteria(S.p);
  const out = [h("h2", editing && hasResults ? `Criteria, version ${v()}` : "Write your criteria"),
    h("p.help", "Each criterion is one pass/fail question about a reply. Say what passing means; examples of failure help the judge most."), ...panelTop()];
  if (hasResults) out.push(h("p.small", `Saving a change makes version ${v() + 1}. Results stay tied to the version that produced them.`));
  if (S.mode === "demo") {
    out.push(h("div.row-actions",
      button("Use the good criteria", () => { setCrit(structuredClone(S.demo.criteria.good)); }, { key: "demo-good" }),
      button("Use the deliberately vague criteria", () => { setCrit(structuredClone(S.demo.criteria.vague)); }, { key: "demo-vague" })),
      h("p.small", "The demo has stored verdicts for these two sets as written. Try the vague set to see agreement fall. An edited criterion gets no stored verdicts."));
  }
  crit.forEach((c, i) => out.push(criterionCard(c, i, crit)));
  if (crit.length < MAX_CRITERIA) out.push(h("div.row-actions", button("Add a criterion", () => { crit.push(blankCriterion()); render(); }, { key: "add-crit" })));
  const ref = editing ? S.p.reference : S.draft.reference;
  if (editing) {
    if (ref) out.push(h("details", h("summary", "Reference material"), dataBox("Reference", ref)));
  } else {
    out.push(h("label.field-label", { for: "reference" }, "Reference material (optional, sent with every judgment)"),
      h("textarea.paste", { id: "reference", rows: 5, value: ref, oninput: (e) => { S.draft.reference = e.target.value; } }));
    const max = S.draft.rows.length;
    out.push(h("label.field.field-inline", h("span.field-label", "Replies to label first"),
      h("input", { type: "number", id: "sample-size", min: Math.min(10, max), max, step: 1, value: Math.min(S.draft.sampleSize, max), oninput: (e) => { S.draft.sampleSize = Number(e.target.value); } })),
      h("p.small", `30 to 40 is a good start; you can label more later. There are ${max} loaded.`));
  }
  out.push(footerRow(editing ? [button("Back without saving", () => go(S.p.labellingDone ? "trust" : "label"), { key: "crit-back" })] : [],
    [button(editing ? "Save criteria" : "Start labelling", saveCriteria, { kind: "primary", key: "crit-save" })]));
  return out;
};

function setCrit(listNew) {
  if (S.p) S.edit.list = listNew; else S.draft.criteria = listNew;
  render();
}

function criterionCard(c, i, crit) {
  const tip = h("div.notice.notice-tip", { hidden: !weak(c) }, h("p", h("strong", "The judge will have less to go on."), " Add examples of failure, or describe passing in more detail (a sentence or two)."));
  const refresh = () => { tip.hidden = !weak(c); };
  const id = `c${i}`;
  return h("div.card.crit-card",
    h("div.card-head", h("h3", `Criterion ${i + 1}`), crit.length > 1 ? button("Remove", () => { crit.splice(i, 1); render(); }, { key: `rm-${i}`, "aria-label": `Remove criterion ${i + 1}` }) : null),
    h("label.field", h("span.field-label", "Name"), h("input", { id: `${id}-name`, type: "text", value: c.name, maxlength: 80, oninput: (e) => { c.name = e.target.value; } })),
    h("label.field", h("span.field-label", "Passes when"), h("textarea", { id: `${id}-pass`, rows: 2, value: c.pass, oninput: (e) => { c.pass = e.target.value; refresh(); } })),
    h("label.field", h("span.field-label", "Examples of failure (optional, one per line)"), h("textarea", { id: `${id}-fail`, rows: 3, value: (c.fail_examples ?? []).join("\n"), oninput: (e) => { c.fail_examples = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean); refresh(); } })),
    tip);
}

function saveCriteria() {
  const crit = S.p ? S.edit.list : S.draft.criteria;
  const bad = crit.findIndex((c) => !c.name.trim() || !c.pass.trim());
  if (bad !== -1) { S.ui.error = `Criterion ${bad + 1} needs a name and a description of passing.`; render(); return; }
  const taken = new Set(crit.filter((c) => c.id).map((c) => c.id));
  const clean = crit.map((c) => {
    const id = c.id || slug(c.name, taken);
    taken.add(id);
    return { id, name: c.name.trim(), pass: c.pass.trim(), fail_examples: (c.fail_examples ?? []).map((x) => x.trim()).filter(Boolean) };
  });
  if (!S.p) {
    const d = S.draft;
    const size = Math.max(1, Math.min(Number(d.sampleSize) || 40, d.rows.length));
    S.p = P.newProject({ rows: d.rows, criteria: clean, reference: d.reference.trim(), seed: S.mode === "demo" ? S.demo.sample_seed : newSeed() });
    S.p.mode = S.mode;
    P.drawLabelSample(S.p, size);
    S.draft = null;
    persist();
    go("label");
    return;
  }
  if (JSON.stringify(clean) !== JSON.stringify(list())) {
    if (P.canReplaceCriteria(S.p)) P.replaceCriteria(S.p, clean);
    else P.editCriteria(S.p, clean);
  }
  if (!P.labellingComplete(S.p)) S.p.labellingDone = false;
  persist();
  go(S.p.labellingDone ? "trust" : "label");
}

// --- Label ---

function labelIndex() {
  const ids = S.p.sample.ids;
  if (S.ui.labelIndex == null) {
    const first = ids.findIndex((id) => list().some((c) => !P.labelOf(S.p, id, c.id)));
    S.ui.labelIndex = first === -1 ? 0 : first;
  }
  return Math.max(0, Math.min(S.ui.labelIndex, ids.length - 1));
}

const unlabelled = () => S.p.sample.ids.filter((id) => list().some((c) => !P.labelOf(S.p, id, c.id)));

SCREENS.label = () => {
  const ids = S.p.sample.ids;
  const i = labelIndex();
  const id = ids[i];
  const row = rowById()[id];
  const left = unlabelled();
  const done = ids.length - left.length;
  const last = i === ids.length - 1;
  const bar = h("i");
  bar.style.width = `${Math.round((done / ids.length) * 100)}%`;
  const out = [h("h2", "Is this reply good?"),
    h("p.help", "You're the expert. Mark each criterion pass or fail. The judge's answers stay hidden until you finish, so they can't sway you."), ...panelTop(),
    h("p.small", { "aria-live": "polite" }, `Reply ${i + 1} of ${ids.length} · ${done} labelled · row ${row.row}`),
    h("div.progress", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": ids.length, "aria-valuenow": done, "aria-label": "Labelled" }, bar)];
  if (S.mode === "demo" && left.length) out.push(h("div.row-actions", button(`Fill in the answer key's labels (${left.length} left)`, fillAnswerKey, { key: "fill-key" })), h("p.small", "In the demo you can use the answer key instead of labelling by hand."));
  out.push(h("div.two", dataBox("Customer wrote", row.input), dataBox("AI replied", row.output)));
  if (row.reference) out.push(dataBox("Reference", row.reference));
  out.push(h("div.verdicts", list().map((c, n) => verdictChoice(id, c, n))));
  out.push(h("p.small.keys", h("kbd", "Enter"), " next · ", h("kbd", "Backspace"), " back · ", h("kbd", "S"), " skip"));
  const finish = last || !left.length;
  out.push(footerRow(
    [button("Back", () => moveLabel(-1), { key: "lab-back", disabled: i === 0 }), button("Skip", skipItem, { key: "lab-skip" })],
    [finish && left.length ? h("span.small", `${plural(left.length, "reply", "replies")} still need a label. `) : null,
      finish && left.length ? button("Go to the next unlabelled", () => { S.ui.labelIndex = ids.indexOf(left[0]); render(); }, { key: "lab-next-open" }) : null,
      finish ? button("Finish labelling", finishLabels, { kind: "primary", key: "lab-finish", disabled: !!left.length }) : button("Next reply", () => moveLabel(1), { kind: "primary", key: "lab-next" })]));
  return out;
};

function verdictChoice(id, c, n) {
  const value = P.labelOf(S.p, id, c.id);
  const opt = (verdict, key) => h(`button.choice.choice-${verdict}`, { type: "button", "aria-pressed": String(value === verdict), dataset: { k: `v-${c.id}-${verdict}` }, onclick: () => setLabel(id, c, verdict) },
    verdict === "pass" ? "Pass" : "Fail", key ? h("kbd", key) : null);
  return h("div.verdict-row", h("span.verdict-name", c.name, value === "skip" ? h("span.muted", " · Skipped") : null),
    h("span.choices", { role: "group", "aria-label": c.name }, opt("pass", KEYS[n * 2]), opt("fail", KEYS[n * 2 + 1])));
}

function announce(text) {
  const s = document.getElementById("status");
  s.textContent = "";
  setTimeout(() => { s.textContent = text; }, 20);
}

function setLabel(id, c, verdict) {
  P.setLabel(S.p, id, c.id, verdict);
  persist();
  announce(`${c.name}: ${verdict}`);
  render();
}

function moveLabel(step) {
  const n = S.p.sample.ids.length;
  S.ui.labelIndex = Math.max(0, Math.min(n - 1, labelIndex() + step));
  render();
}

function skipItem() {
  const id = S.p.sample.ids[labelIndex()];
  for (const c of list()) if (!P.labelOf(S.p, id, c.id)) P.setLabel(S.p, id, c.id, "skip");
  persist();
  announce("Skipped");
  if (labelIndex() < S.p.sample.ids.length - 1) moveLabel(1); else render();
}

function fillAnswerKey() {
  for (const id of unlabelled()) for (const c of list()) {
    if (!P.labelOf(S.p, id, c.id)) P.setLabel(S.p, id, c.id, S.demo.labels[id]?.[c.id] ?? "skip");
  }
  persist();
  S.ui.labelIndex = S.p.sample.ids.length - 1;
  render();
}

function finishLabels() {
  P.finishLabelling(S.p);
  persist();
  go("trust");
}

document.addEventListener("keydown", (e) => {
  if (S?.step !== "label" || !S.p || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return;
  const id = S.p.sample.ids[labelIndex()];
  const k = KEYS.indexOf(e.key);
  if (k !== -1 && Math.floor(k / 2) < list().length) {
    e.preventDefault();
    setLabel(id, list()[Math.floor(k / 2)], k % 2 ? "fail" : "pass");
  } else if (e.key === "Enter" && !(t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement || t instanceof HTMLLabelElement)) {
    e.preventDefault();
    if (labelIndex() < S.p.sample.ids.length - 1) moveLabel(1);
    else if (!unlabelled().length) finishLabels();
  } else if (e.key === "Backspace") {
    e.preventDefault();
    moveLabel(-1);
  } else if (e.key === "s" || e.key === "S") {
    e.preventDefault();
    skipItem();
  }
});

// --- Running the judge (calibration and scoring share this) ---

function modelName(id) {
  if (id === "placeholder") return "stored placeholder results";
  return Object.values(MODELS).find((m) => m.id === id)?.name ?? id;
}

function fixedModel() {
  return S.p.runs[v()]?.model ?? null;
}

function demoJudge() {
  const sets = S.demo.replays.map((r) => ({ r, j: replayJudge(r) }));
  return { judge: (item, c) => (sets.find((x) => x.r.criteria[c.id] === criterionText(c)) ?? sets[0]).j.judge(item, c) };
}

const bytes = (s) => new TextEncoder().encode(s ?? "").length;

// The most one call can cost: the counted fixed part, plus at most one token per byte of the item.
function reserveFor(est, rows) {
  return ([itemId, cid]) => {
    const r = rows[itemId];
    return worstCase(est.model, est.base[cid] + bytes(r.input) + bytes(r.output) + bytes(r.reference), DEFAULTS.maxTokens);
  };
}

// An estimate holds while the model and criteria version are the same and it counted every criterion
// still to do. The per-criterion token counts don't change when fewer items are left.
function estimateFits(est, todo) {
  const model = fixedModel() ?? MODELS[S.ui.model].id;
  return !!est && !est.working && est.model === model && est.v === v() && todo.length > 0 && todo.every(([, c]) => c in est.base);
}

async function estimateNow(pairs) {
  S.ui.error = null;
  if (!apiKey) { S.ui.error = "Enter your Anthropic API key first."; render(); return; }
  const model = fixedModel() ?? MODELS[S.ui.model].id;
  const todo = missing(pairs, P.resultsFor(S.p, v()));
  const rows = rowById();
  const crit = Object.fromEntries(list().map((c) => [c.id, c]));
  S.ui.estimate = { working: true };
  render();
  try {
    const judge = liveJudge({ apiKey });
    const base = {}, typical = {};
    for (const cid of [...new Set(todo.map(([, c]) => c))]) {
      const c = crit[cid];
      const mine = todo.filter(([, x]) => x === cid).map(([id]) => rows[id]);
      const median = [...mine].sort((a, b) => (a.input.length + a.output.length) - (b.input.length + b.output.length))[Math.floor(mine.length / 2)];
      const ref = (r) => r.reference || S.p.reference;
      base[cid] = await judge.countTokens(buildRequest({ id: "x", input: "", output: "" }, c, { model, reference: S.p.reference }));
      const real = await judge.countTokens(buildRequest(median, c, { model, reference: ref(median) }));
      typical[cid] = estimate({ model, criteria: [{ systemTokens: base[cid], itemTokens: Math.max(0, real - base[cid]) }], items: mine.length, outputTokens: OUTPUT_TOKENS_GUESS, maxTokens: DEFAULTS.maxTokens }).typical;
    }
    const est = { model, base, calls: todo.length, v: v() };
    est.typical = Object.values(typical).reduce((a, b) => a + b, 0);
    est.worst = todo.reduce((sum, pair) => sum + reserveFor(est, rows)(pair), 0);
    S.ui.estimate = est;
  } catch (e) {
    S.ui.estimate = null;
    S.ui.error = e.message;
  }
  render();
}

async function runNow(pairs, resume = false) {
  S.ui.error = null;
  const demo = S.mode === "demo";
  const model = demo ? S.demo.replays[0].model : fixedModel() ?? MODELS[S.ui.model].id;
  const est = S.ui.estimate;
  const results = structuredClone(P.resultsFor(S.p, v()));
  const todo = missing(pairs, results);
  if (!demo && (!apiKey || !estimateFits(est, todo))) { S.ui.error = "Estimate the cost first."; render(); return; }
  const rows = rowById();
  const crit = Object.fromEntries(list().map((c) => [c.id, c]));
  const spentBefore = resume ? S.ui.run?.spent ?? 0 : 0;
  const budget = createBudget(demo ? 0 : S.ui.cap, spentBefore);
  const controller = new AbortController();
  const judge = demo ? demoJudge() : liveJudge({ apiKey });
  const ver = v();
  S.ui.run = { active: true, done: 0, total: todo.length, spent: spentBefore, cap: budget.cap, controller, paused: null, reason: null };
  render();
  try {
    const out = await run({
      pairs, results, budget, model, signal: controller.signal,
      reserveFor: demo ? () => 0 : reserveFor(est, rows),
      costOfResult: demo ? () => 0 : undefined,
      judgeOne: ([itemId, cid]) => {
        const r = rows[itemId];
        return demo ? judge.judge(r, crit[cid]) : judge.judge(r, crit[cid], { model, reference: r.reference || S.p.reference, signal: controller.signal });
      },
      onResult: ([itemId, cid], r) => {
        P.recordResult(S.p, ver, itemId, cid, r, model);
        S.ui.run.done++;
        S.ui.run.spent = budget.spent;
        persist();
        soon();
      },
    });
    Object.assign(S.ui.run, { active: false, paused: out.paused, reason: out.reason ?? null, spent: budget.spent });
  } catch (e) {
    Object.assign(S.ui.run, { active: false, paused: "fatal", reason: e.message });
  }
  persist();
  render();
}

function keyBox() {
  const input = h("input", { type: "password", id: "api-key", autocomplete: "off", spellcheck: "false", value: apiKey, placeholder: "sk-ant-...", oninput: (e) => { apiKey = e.target.value.trim(); if (S.ui.remember) store.saveKey(apiKey); } });
  return h("div.card.key-box",
    h("label.field", h("span.field-label", "Your Anthropic API key"), input),
    h("p.small", "Sent only to api.anthropic.com, straight from this browser. Kept in memory unless you tick below."),
    h("div.row-actions",
      h("label.check", h("input", { type: "checkbox", id: "remember", checked: S.ui.remember, onchange: (e) => { S.ui.remember = e.target.checked; if (e.target.checked && apiKey) store.saveKey(apiKey); if (!e.target.checked) store.forgetKey(); } }), " Remember on this device"),
      button("Forget key", () => { apiKey = ""; S.ui.remember = false; store.forgetKey(); S.ui.estimate = null; render(); }, { kind: "danger", key: "forget-key" })));
}

// purpose: "calibrate" | "score". Returns the panel content for starting, running or resuming a run.
function runPanel(pairs, purpose) {
  const r = S.ui.run;
  const results = P.resultsFor(S.p, v());
  const todo = missing(pairs, results);
  const verb = purpose === "calibrate" ? "Run the judge on your labelled replies" : "Start scoring";
  const out = [];
  if (r?.active) {
    const bar = h("i");
    bar.style.width = `${r.total ? Math.round((r.done / r.total) * 100) : 100}%`;
    out.push(h("p", { "aria-live": "polite" }, `Judged ${r.done} of ${r.total}`, S.mode === "demo" ? "" : ` · spent ${money(r.spent)} of the ${money(r.cap)} cap`),
      h("div.progress", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": r.total, "aria-valuenow": r.done, "aria-label": "Judged" }, bar),
      footerRow([], [button("Stop", () => r.controller.abort(), { kind: "danger", key: "run-stop" })]));
    return out;
  }
  if (r?.paused && todo.length) {
    const lead = { cap: "Paused at the cap.", stopped: "Stopped.", fatal: "The run stopped." }[r.paused];
    const more = r.paused === "cap" ? " Raise the cap to continue; finished results are kept." : " Finished results are kept; resuming sends only what's missing.";
    out.push(notice(lead, r.reason ?? "", more));
  }
  if (S.mode === "demo") {
    out.push(h("p", `${plural(todo.length, "verdict")} to fetch. In the demo they're stored in the page, so this is free and needs no key.`),
      footerRow([], [button(r?.paused ? "Resume" : verb, () => runNow(pairs, !!r?.paused), { kind: "primary", key: "run-start" })]));
    return out;
  }
  const fixed = fixedModel();
  out.push(fixed
    ? h("p", `Judge: ${modelName(fixed)} (fixed for criteria version ${v()}, so its trust measurement holds).`)
    : h("label.field.field-inline", h("span.field-label", "Judge model"), h("select", { id: "model", dataset: { k: "model" }, onchange: (e) => { S.ui.model = e.target.value; S.ui.estimate = null; render(); } },
      Object.entries(MODELS).map(([k, m]) => h("option", { value: k, selected: k === S.ui.model }, m.name)))));
  out.push(keyBox());
  out.push(h("label.field.field-inline", h("span.field-label", "Stop the run at"), h("span.money-input", "$", h("input", { type: "number", id: "cap", min: 0.05, step: 0.05, value: S.ui.cap, oninput: (e) => { S.ui.cap = Math.max(0, Number(e.target.value) || 0); } }))));
  const est = S.ui.estimate;
  const fresh = estimateFits(est, todo);
  if (est?.working) out.push(h("p", { role: "status" }, "Counting tokens (free)..."));
  else if (fresh) {
    // After a pause fewer calls are left: the worst case is recomputed per call, the typical scaled.
    const worst = todo.reduce((sum, pair) => sum + reserveFor(est, rowById())(pair), 0);
    const typical = est.typical * (todo.length / est.calls);
    out.push(h("p.estimate", `Estimated cost for ${plural(todo.length, "call")}: typical ${money(typical)}, at most ${money(worst)}.`),
      h("p.small", `Typical assumes about ${OUTPUT_TOKENS_GUESS} output tokens per call. "At most" assumes every reply runs to its limit. Prices checked ${PRICES_CHECKED}.`));
    if (worst > S.ui.cap) out.push(h("p.small", "The worst case is above the cap, so the run may pause before it finishes. Finished results are kept and you can resume."));
  }
  out.push(footerRow([button("Estimate cost", () => estimateNow(pairs), { key: "run-estimate", disabled: !todo.length })],
    [button(r?.paused ? "Resume" : verb, () => runNow(pairs, !!r?.paused), { kind: "primary", key: "run-start", disabled: !fresh || !todo.length })]));
  return out;
}

// --- How far to trust it ---

function demoNotice() {
  if (S.mode !== "demo") return null;
  if (!S.demo.placeholder) return notice("These are stored results from a real run.", `${modelName(S.demo.replays[0].model)} judged every reply on ${S.demo.replays[0].ran}. The demo replays its answers, so nothing is sent and nothing is paid. Your labels here come from the test set's answer key.`);
  return notice("These stored results are placeholders.", "Until the real judge run, they follow the answer key, with a few planted disagreements, unclear verdicts and withheld quotes, so every screen has something to show. The figures below are not a measurement of any model.");
}

const kappaLine = (k) => {
  if (!k || k.kappa == null) return "Agreement beyond chance (kappa) can't be computed yet: there's no variety in the answers to compare.";
  const lo = Math.max(-1, k.low), hi = Math.min(1, k.high);
  // When every answer agrees, the usual formula gives a zero-width range: that isn't certainty.
  if (hi - lo < 0.005) return `Agreement beyond chance (kappa): ${k.kappa.toFixed(2)}. Its range can't be computed when every answer agrees, so treat it as unmeasured. 1 is perfect agreement, 0 is no better than chance.`;
  return `Agreement beyond chance (kappa): ${k.kappa.toFixed(2)}, likely between ${lo.toFixed(2)} and ${hi.toFixed(2)}. 1 is perfect agreement, 0 is no better than chance.`;
};

function tuningLine(name, r) {
  return r ? `${name} ${r.k} of ${r.n} (likely between ${pct(r.low)} and ${pct(r.high)})` : `${name}: none labelled`;
}

function moreLabels(cid, a) {
  const left = S.p.rows.length - S.p.sample.ids.length;
  if (!left) return [h("p", "Every loaded reply is labelled, so narrowing this needs more outputs.")];
  const need = P.labelsNeeded(S.p, cid);
  const n = need == null || need === Infinity ? Math.min(20, left) : need;
  const text = need === Infinity ? "No failures are marked yet, so there's no estimate; labelling more is the way to find some." : need == null ? `Label about ${n} more to narrow it.` : `Label about ${n} more to hold back ${P.MIN_HELD_FAILS} failures.`;
  return [h("p", text), button(`Label ${n} more`, () => { const added = P.extendSample(S.p, n); persist(); S.ui.labelIndex = S.p.sample.ids.indexOf(added[0]); S.step = "label"; S.ui.focusHeading = true; render(); }, { key: `more-${cid}` })];
}

// The reasons in one sentence. "No failures labelled" repeats "only 0 failures labelled", so it's dropped.
function whyWide(reasons) {
  const list = reasons.filter((x) => !(x === "no failures labelled" && reasons.some((r) => r.startsWith("only 0 "))));
  const text = list.join("; ").replace("failures labelled", "failures held back");
  return text[0].toUpperCase() + text.slice(1);
}

function trustCard(c) {
  const cal = P.calibration(S.p, v(), c.id);
  const a = cal.heldBack;
  const t = P.trustOf(S.p, v(), c.id);
  const excluded = a.tally.excluded;
  const rows = rowById();
  return h("div.card.trust-card",
    h("div.card-head", h("h3", c.name), h("span.pills", a.tooWide ? pill("too wide") : null, pill(P.trustLabel(t)))),
    rateBlock("Caught", a.caught, "failures you marked", "No failures marked in the held-back set yet."),
    rateBlock("Passed", a.passed, "replies you passed", "No passes marked in the held-back set yet."),
    excluded ? h("p.small", `Not counted: ${excluded} (skipped, unclear, withheld or errors).`) : null,
    h("p.small", kappaLine(a.kappa)),
    h("details", h("summary", "Show tuning figures"), h("p.small", `On the ${cal.tuning.tally.bothPass + cal.tuning.tally.bothFail + cal.tuning.tally.humanFailJudgePass + cal.tuning.tally.humanPassJudgeFail} tuning labels (you may have tuned the criterion on these, so they flatter it): ${tuningLine("caught", cal.tuning.caught)}; ${tuningLine("passed", cal.tuning.passed)}.`)),
    a.tooWide ? h("div.notice", h("p", h("strong", "Why too wide? "), whyWide(a.reasons), "."), ...moreLabels(c.id, a)) : null,
    cal.disagreements.length
      ? h("details.disagreements", { open: S.ui.open.has(`dis-${c.id}`), ontoggle: (e) => toggleOpen(`dis-${c.id}`, e.target.open) }, h("summary", `Disagreements (${cal.disagreements.length})`),
        cal.disagreements.map((d) => h("div.disagreement", h("p", "You: ", verdictWord(d.you), " · Judge: ", verdictWord(d.status), h("span.muted", ` · ${d.set} · row ${rows[d.itemId].row}`)), evidence(rows[d.itemId], d))))
      : h("p.small", "No disagreements."),
    h("div.row-actions", t
      ? button("Stop trusting", () => { P.untrust(S.p, v(), c.id); persist(); render(); }, { key: `trust-${c.id}` })
      : button(a.tooWide ? "Trust anyway (marked as thin evidence)" : "Trust this criterion", () => { P.trust(S.p, v(), c.id); persist(); render(); }, { key: `trust-${c.id}` })));
}

function toggleOpen(k, open) {
  if (open) S.ui.open.add(k); else S.ui.open.delete(k);
}

SCREENS.trust = () => {
  const pairs = S.p.sample.ids.flatMap((id) => list().map((c) => [id, c.id]));
  const todo = missing(pairs, P.resultsFor(S.p, v()));
  const running = S.ui.run?.active;
  if (todo.length || running) {
    return [h("h2", "Now the judge scores your labelled replies"),
      h("p.help", `It judges the ${plural(S.p.sample.ids.length, "reply", "replies")} you labelled, on criteria version ${v()}. Then you'll see how often it agreed with you.`), ...panelTop(), demoNotice(),
      ...runPanel(pairs, "calibrate")];
  }
  P.markHeldBackSeen(S.p, v());
  persist();
  const ver = P.versionOf(S.p, v());
  const held = S.p.sample.heldBack.length;
  const trusted = P.trustedIds(S.p, v()).length;
  return [h("h2", "How far can you trust the judge?"),
    h("p.help", `Measured on the ${held} of your labels the judge never saw while you tuned it (held back, every third reply in the random draw). The shaded band is where the true rate likely sits.`), ...panelTop(), demoNotice(),
    h("p.small", `Judge: ${modelName(fixedModel())} · criteria version ${v()} · sample seed ${S.p.seed} · ${S.p.sample.ids.length} labelled`, ver.measuredAfterSeeing ? [" ", pill("after seeing")] : null),
    h("div.cards", list().map(trustCard)),
    footerRow([button(`Edit criteria (makes version ${v() + 1})`, () => go("criteria"), { key: "edit-crit" })],
      [trusted ? null : h("span.small", "Trust at least one criterion to score the rest. "), button("Score the rest", () => go("score"), { kind: "primary", key: "to-score", disabled: !trusted })])];
};

// --- Score the rest ---

function scorePairs() {
  const trusted = P.trustedIds(S.p, v());
  return S.p.rows.flatMap((r) => list().filter((c) => trusted.includes(c.id)).map((c) => [r.id, c.id]));
}

SCREENS.score = () => {
  const pairs = scorePairs();
  const todo = missing(pairs, P.resultsFor(S.p, v()));
  const names = list().filter((c) => P.trustedIds(S.p, v()).includes(c.id)).map((c) => c.name);
  const out = [h("h2", "Score the rest"),
    h("p.help", `${plural(S.p.rows.length, "reply", "replies")} × ${plural(names.length, "trusted criterion", "trusted criteria")} (${names.join(", ")}). Replies already judged aren't sent again.`), ...panelTop(), demoNotice()];
  if (!todo.length && !S.ui.run?.active) {
    out.push(h("p", "Everything is scored."), footerRow([], [button("See results", () => go("results"), { kind: "primary", key: "to-results" })]));
    return out;
  }
  out.push(...runPanel(pairs, "score"));
  return out;
};

// --- Results ---

const VERDICT_FILTERS = [["all", "All"], ["pass", "Pass"], ["fail", "Fail"], ["unclear", "Unclear"], ["withheld", "Withheld"], ["error", "Errors"], ["overridden", "You over the judge"], ["you", "Your labels"]];

function overrideControls(row, c, f) {
  const k = `${row.id}-${c.id}`;
  return h("div.row-actions",
    h("span.small", f.decidedBy === "you over the judge" ? `You overrode the judge (it said ${f.judge?.status ?? "nothing"}). ` : "Override: "),
    button("Mark pass", () => { P.override(S.p, v(), row.id, c.id, "pass"); persist(); render(); }, { key: `ov-p-${k}`, "aria-pressed": String(f.decidedBy === "you over the judge" && f.verdict === "pass") }),
    button("Mark fail", () => { P.override(S.p, v(), row.id, c.id, "fail"); persist(); render(); }, { key: `ov-f-${k}`, "aria-pressed": String(f.decidedBy === "you over the judge" && f.verdict === "fail") }),
    f.decidedBy === "you over the judge" ? button("Undo override", () => { P.clearOverride(S.p, v(), row.id, c.id); persist(); render(); }, { key: `ov-u-${k}` }) : null);
}

function itemDetails(row, c) {
  const f = P.finalVerdict(S.p, v(), row.id, c.id);
  const k = `item-${row.id}-${c.id}`;
  const open = S.ui.open.has(k);
  // The body is built only when open (hundreds of items); toggling open renders it once.
  return h("details.item", { open, ontoggle: (e) => { toggleOpen(k, e.target.open); if (e.target.open && !e.target.querySelector(".item-body")) render(); } },
    h("summary", h("span", `Row ${row.row} · ${c.name} · `), verdictWord(f.verdict), h("span.muted", ` · ${f.decidedBy === "none" ? "not scored" : `decided by ${f.decidedBy}`}`)),
    open ? h("div.item-body", f.judge ? evidence(row, f.judge) : [dataBox("Customer wrote", row.input), dataBox("AI replied", row.output)], f.judge && f.decidedBy !== "you" ? overrideControls(row, c, f) : null) : null);
}

function matches(f, want) {
  if (want === "all") return true;
  if (want === "overridden") return f.decidedBy === "you over the judge";
  if (want === "you") return f.decidedBy === "you";
  if (want === "withheld" || want === "error") return f.verdict === want;
  return f.verdict === want;
}

SCREENS.results = () => {
  const trusted = list().filter((c) => P.trustedIds(S.p, v()).includes(c.id));
  const rates = P.passRates(S.p, v());
  const rows = S.p.rows;
  const out = [h("h2", "Results"),
    h("p.help", "Pass rates over the replies with a verdict you can check. Withheld, unclear and errored replies are counted beside each rate, never inside it."), ...panelTop(), demoNotice()];
  out.push(h("div.cards", trusted.map((c) => {
    const r = rates[c.id];
    const t = P.trustOf(S.p, v(), c.id);
    return h("div.card", h("div.card-head", h("h3", c.name), pill(P.trustLabel(t))),
      rateBlock("Passed", r.rate, "replies with a checked verdict", "No checked verdicts yet."), countRow(r));
  })));
  // Review pile: the judge said unclear, and nobody has decided.
  const pile = rows.flatMap((r) => trusted.map((c) => [r, c])).filter(([r, c]) => P.finalVerdict(S.p, v(), r.id, c.id).verdict === "unclear");
  out.push(h("h3.section", `Review pile: unclear ${pile.length}`));
  if (pile.length) {
    out.push(h("p.small", "The judge couldn't tell. Decide these yourself; your verdict is recorded as yours, with the judge's reason kept."),
      h("div.pile", pile.slice(0, PAGE).map(([r, c]) => {
        const f = P.finalVerdict(S.p, v(), r.id, c.id);
        return h("div.card.pile-item", h("p", h("strong", `Row ${r.row} · ${c.name}`)), evidence(r, f.judge), overrideControls(r, c, f));
      })), pile.length > PAGE ? h("p.small", `Showing ${PAGE} of ${pile.length}. Filter by "Unclear" below to see them all.`) : null);
  } else out.push(h("p.small", "Nothing to review."));
  // Every verdict, filterable.
  const fc = S.ui.filter;
  const all = rows.flatMap((r) => trusted.filter((c) => fc.criterion === "all" || fc.criterion === c.id).map((c) => [r, c])).filter(([r, c]) => matches(P.finalVerdict(S.p, v(), r.id, c.id), fc.verdict));
  out.push(h("h3.section", "Every verdict"),
    h("div.fields",
      h("label.field", h("span.field-label", "Criterion"), h("select", { id: "f-crit", dataset: { k: "f-crit" }, onchange: (e) => { fc.criterion = e.target.value; S.ui.shown = PAGE; render(); } },
        h("option", { value: "all" }, "All trusted criteria"), trusted.map((c) => h("option", { value: c.id, selected: fc.criterion === c.id }, c.name)))),
      h("label.field", h("span.field-label", "Verdict"), h("select", { id: "f-verdict", dataset: { k: "f-verdict" }, onchange: (e) => { fc.verdict = e.target.value; S.ui.shown = PAGE; render(); } },
        VERDICT_FILTERS.map(([k, name]) => h("option", { value: k, selected: fc.verdict === k }, name))))),
    h("p.small", { role: "status" }, `${all.length} shown`),
    h("div.items", all.slice(0, S.ui.shown).map(([r, c]) => itemDetails(r, c))),
    all.length > S.ui.shown ? h("div.row-actions", button(`Show ${Math.min(PAGE, all.length - S.ui.shown)} more`, () => { S.ui.shown += PAGE; render(); }, { key: "more-items" })) : null);
  out.push(footerRow([button("Export JSON", () => download(`quality-results-v${v()}.json`, JSON.stringify(P.exportJSON(S.p, v()), null, 2), "application/json"), { key: "exp-json" })],
    [button("Export CSV", () => download(`quality-results-v${v()}.csv`, P.exportCSV(S.p, v()), "text/csv"), { kind: "primary", key: "exp-csv" })]));
  return out;
};

// --- Project file and clearing ---

function downloadProject() {
  if (S.p) download("quality-project.json", P.serialize(S.p), "application/json");
}

async function openProject(file) {
  if (!file) return;
  try {
    const p = P.parseProject(await file.text());
    const mode = p.mode === "demo" ? "demo" : "own";
    if (mode === "demo") await demoData();
    S = { ...fresh(), mode, p, demo: S.demo };
    persist();
    go(furthest());
  } catch (e) {
    S.ui.error = e.message;
    render();
  }
}

function clearAll() {
  store.clear();
  apiKey = "";
  const demo = S.demo;
  S = fresh();
  S.demo = demo;
  render();
}

// --- Start up ---

async function boot() {
  S = fresh();
  const saved = store.load();
  const key = store.loadKey();
  if (key) { apiKey = key; S.ui.remember = true; }
  if (saved) {
    S.p = saved;
    S.mode = saved.mode === "demo" ? "demo" : "own";
    try {
      if (S.mode === "demo") await demoData();
      S.step = furthest();
    } catch (e) {
      S.ui.error = e.message;
    }
  }
  render();
}

boot();
