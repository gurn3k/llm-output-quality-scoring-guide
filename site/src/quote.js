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

// Returns { found: true } or { found: false, reason }.
export function checkQuote(text, quote) {
  const hay = normalize(text);
  const parts = partsOf(quote);
  if (!parts.length) return { found: false, reason: "The quote is empty." };
  let from = 0;
  for (const part of parts) {
    if (words(part) < MIN_WORDS && part !== hay) return { found: false, reason: `"${part}" is too short to count as evidence (at least ${MIN_WORDS} words).` };
    const at = hay.indexOf(part, from);
    if (at === -1) {
      return { found: false, reason: hay.includes(part) ? "The quoted parts are out of order." : "The quote isn't in the text." };
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
  for (const part of partsOf(quote)) {
    const at = hay.indexOf(part, from);
    if (at === -1) return null;
    ranges.push([start[at], end[at + part.length - 1]]);
    from = at + part.length;
  }
  return ranges;
}
