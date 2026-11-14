// Is the judge's quote really in the text? (ADR 0008)
// Exact match after light normalising; "..." may join parts that must appear in order. No fuzzy matching.

export const MIN_WORDS = 3;

// Quote marks, dashes and the ellipsis character folded to plain ASCII, then lowercased.
const fold = (s) => s
  .replace(/[‘’‚‛′`´]/g, "'")
  .replace(/[“”„‟″«»]/g, '"')
  .replace(/[‐‑‒–—―−]/g, "-")
  .replace(/…/g, "...")
  .toLowerCase();

export function normalize(s) {
  return fold(String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim());
}

const partsOf = (quote) => normalize(quote).split(/\.{3,}/).map((p) => p.trim()).filter((p) => p !== "");

const words = (s) => (s === "" ? 0 : s.split(" ").length);

// Finds part in hay from a position, only where it starts and ends on a word boundary, so a fragment
// cut from the middle of words ("und you in fu") doesn't count as a quote.
const wordChar = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
function findWhole(hay, part, from = 0) {
  for (let at = hay.indexOf(part, from); at !== -1; at = hay.indexOf(part, at + 1)) {
    const startsOk = !wordChar(part[0]) || !wordChar(hay[at - 1]);
    const endsOk = !wordChar(part.at(-1)) || !wordChar(hay[at + part.length]);
    if (startsOk && endsOk) return at;
  }
  return -1;
}

// The quote's parts: the whole quote when it's in the text word for word (the reply itself may contain
// "..."), otherwise the passages "..." joins.
function partsIn(hay, quote) {
  const whole = normalize(quote);
  return whole && findWhole(hay, whole) !== -1 ? [whole] : partsOf(quote);
}

// Returns { found: true } or { found: false, reason }.
export function checkQuote(text, quote) {
  const hay = normalize(text);
  const parts = partsIn(hay, quote);
  if (!parts.length) return { found: false, reason: "The quote is empty." };
  let from = 0;
  for (const part of parts) {
    if (words(part) < MIN_WORDS && part !== hay) return { found: false, reason: `"${part}" is too short to count as evidence (at least ${MIN_WORDS} words).` };
    const at = findWhole(hay, part, from);
    if (at === -1) {
      return { found: false, reason: findWhole(hay, part) !== -1 ? "The quoted parts are out of order." : "The quote isn't in the text." };
    }
    from = at + part.length;
  }
  return { found: true };
}

// Where a found quote sits in the original text, so the page can mark it in place: a list of
// [start, end) ranges, one per "..." part, or null if it can't be placed. Folds the text one character
// at a time, keeping each folded character's position in the original. Text whose NFC form differs
// (combining accents) may not be placed; the page then shows the quote beside the text instead.
export function locate(text, quote) {
  const src = String(text ?? "");
  if (!checkQuote(src, quote).found) return null;
  let hay = "";
  const start = [], end = [];
  let space = true; // drops leading whitespace and collapses runs, as normalize does
  for (let i = 0; i < src.length;) {
    const ch = String.fromCodePoint(src.codePointAt(i));
    if (/\s/.test(ch)) {
      if (!space) { hay += " "; start.push(i); end.push(i + ch.length); }
      space = true;
    } else {
      const out = fold(ch);
      for (let k = 0; k < out.length; k++) { hay += out[k]; start.push(i); end.push(i + ch.length); }
      space = false;
    }
    i += ch.length;
  }
  const ranges = [];
  let from = 0;
  for (const part of partsIn(hay, quote)) {
    const at = findWhole(hay, part, from);
    if (at === -1) return null;
    ranges.push([start[at], end[at + part.length - 1]]);
    from = at + part.length;
  }
  return ranges;
}
