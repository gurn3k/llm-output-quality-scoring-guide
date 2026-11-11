// Small DOM helpers and the page's shared pieces (docs/DESIGN.md, Components).
// Everything is built with createElement and text nodes: loaded text can never become HTML (ADR 0005).
import { locate } from "./quote.js";

// h("p.help", { id: "x", onclick }, "text", child, ...). Strings become text nodes, never markup.
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "open" || k === "selected") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const pct = (x) => `${Math.round(x * 100)}%`;
export const money = (x) => `$${x < 0.01 && x > 0 ? x.toFixed(4) : x.toFixed(2)}`;
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function button(label, onclick, { kind = "secondary", key, disabled, ...rest } = {}) {
  return h(`button.btn.btn-${kind}`, { type: "button", onclick, disabled, dataset: key ? { k: key } : undefined, ...rest }, label);
}

// The range bar: the band is the 95% range, the marker the point estimate. Words below say the same.
export function rangeBar(r, label) {
  const words = `likely between ${pct(r.low)} and ${pct(r.high)}`;
  const left = Math.max(0, Math.min(100, r.low * 100));
  const right = Math.max(0, Math.min(100, 100 - r.high * 100));
  const at = Math.max(0, Math.min(100, r.p * 100));
  const marker = h("b.range-point");
  marker.style.left = `calc(${at}% - ${at / 100 * 3}px)`;
  const band = h("i.range-band");
  band.style.left = `${left}%`;
  band.style.right = `${right}%`;
  return h("div.range", h("div.range-track", { role: "img", "aria-label": `${label}: ${Math.round(r.p * 100)}%, ${words}` }, band, marker), h("p.range-words", words));
}

// "Caught 4 of 5 failures you marked", then its range. Null range: says what's missing instead.
export function rateBlock(lead, r, tail, empty) {
  if (!r) return h("div.rate", h("p.rate-line", empty));
  return h("div.rate", h("p.rate-line", `${lead} `, h("strong.rate-big", `${r.k} of ${r.n}`), ` ${tail}`), rangeBar(r, `${lead} ${r.k} of ${r.n} ${tail}`));
}

const PILL = {
  "too wide": ["warn", "Too wide to decide yet"],
  trusted: ["pass", "Trusted"],
  "trusted before the range narrowed": ["warn", "Trusted before the range narrowed"],
  "not trusted": ["muted", "Not trusted"],
  "after seeing": ["warn", "Measured after you saw earlier results"],
  placeholder: ["warn", "Placeholder results"],
};
export function pill(kind, text) {
  const [tone, label] = PILL[kind] ?? ["muted", kind];
  return h(`span.pill.pill-${tone}`, text ?? label);
}

// Withheld, unclear and error counts, at the same size as the rate they qualify.
export function countRow(r) {
  const part = (label, n) => h(`span.count${n ? ".count-on" : ""}`, `${label} ${n}`);
  return h("p.count-row", part("Withheld", r.withheld), " · ", part("Unclear", r.unclear), " · ", part("Errors", r.error));
}

// A box of the user's data, with an optional passage marked: ranges from locate().
export function dataBox(label, text, ranges) {
  const box = h("div.data");
  const s = String(text ?? "");
  if (ranges?.length) {
    let at = 0;
    for (const [a, b] of ranges) {
      if (a > at) box.append(document.createTextNode(s.slice(at, a)));
      box.append(h("mark", s.slice(a, b)));
      at = b;
    }
    if (at < s.length) box.append(document.createTextNode(s.slice(at)));
  } else {
    box.textContent = s;
  }
  return h("div.data-wrap", h("p.data-label", label), box);
}

// The judge's evidence in place: the quote marked in the reply or, for something missing, in the
// customer's message. If it can't be placed, the quote is shown beside the text, never dropped.
export function evidence(row, result) {
  if (!result) return [];
  const inInput = result.evidence_source === "input";
  const ranges = result.quote ? locate(inInput ? row.input : row.output, result.quote) : null;
  const boxes = [
    dataBox("Customer wrote", row.input, inInput ? ranges : null),
    dataBox("AI replied", row.output, inInput ? null : ranges),
  ];
  const notes = [];
  if (result.quote && !ranges) notes.push(h("p.small", "The judge quoted: ", h("q.quote-text", result.quote), result.status === "withheld" ? " (not found in the text, so the verdict is withheld)" : ""));
  if (inInput && ranges) notes.push(h("p.small", "The quote is from the customer's message: it shows what the reply left out."));
  return [h("div.two", boxes), ...notes, result.reason ? h("p.reason", h("span.muted", "Judge's reason: "), result.reason) : null, result.why ? h("p.small.warn-text", `Withheld: ${result.why}`) : null];
}

export function notice(lead, ...body) {
  return h("div.notice", h("p", h("strong", lead), " ", ...body));
}

export function verdictWord(v) {
  return h(`span.verdict.verdict-${v === "pass" || v === "fail" ? v : "other"}`, v);
}

// A file download without a server: a Blob and a temporary link.
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
