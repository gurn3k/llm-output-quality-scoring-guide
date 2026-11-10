// Is the judge's quote really in the text? (ADR 0008)
// Exact match after light normalising; "..." may join parts that must appear in order. No fuzzy matching.

export const MIN_WORDS = 3;

export function normalize(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const words = (s) => (s === "" ? 0 : s.split(" ").length);

// Returns { found: true } or { found: false, reason }.
export function checkQuote(text, quote) {
  const hay = normalize(text);
  const parts = normalize(quote).split(/\.{3,}/).map((p) => p.trim()).filter((p) => p !== "");
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
