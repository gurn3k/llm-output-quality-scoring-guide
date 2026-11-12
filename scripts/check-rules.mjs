// Rules that `npm run check` enforces. Each returns a list of problems; empty means it passed.
// Kept as pure functions so the tests can show each rule failing on a planted violation.

// Loaded text must never become HTML (ADR 0005). Ban the APIs that parse strings as HTML.
const UNSAFE_HTML = /\.(?:innerHTML|outerHTML)\s*[+]?=|\binsertAdjacentHTML\b|\bdocument\.write(?:ln)?\b|\bcreateContextualFragment\b/g;

export function unsafeHtml(file, source) {
  const out = [];
  for (const m of source.matchAll(UNSAFE_HTML)) out.push(`${file}:${lineOf(source, m.index)} uses ${m[0].trim()}`);
  return out;
}

// The page may only reach its own origin and the Anthropic API (ADR 0005). github.com appears only
// as a plain link to this repo's source (ADR 0015); the page never fetches from it.
const URL_RE = /\bhttps?:\/\/[^\s"'`)<>;,]+/g;
export const ALLOWED_HOSTS = new Set(["api.anthropic.com", "github.com"]);

export function externalUrls(file, source, allowed = ALLOWED_HOSTS) {
  const out = [];
  for (const m of source.matchAll(URL_RE)) {
    let host;
    try { host = new URL(m[0]).hostname; } catch { host = m[0]; }
    if (!allowed.has(host)) out.push(`${file}:${lineOf(source, m.index)} refers to ${m[0]}`);
  }
  return out;
}

// The prices table must say when it was checked (ADR 0010).
export function datedPrices(file, source) {
  return /PRICES_CHECKED\s*=\s*"\d{4}-\d{2}-\d{2}"/.test(source) ? [] : [`${file} has no PRICES_CHECKED = "YYYY-MM-DD"`];
}

// Terms that must never appear in files that leave this machine. The list itself is local-only.
export function forbiddenTerms(file, source, terms) {
  const out = [];
  const lower = source.toLowerCase();
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i !== -1) out.push(`${file}:${lineOf(source, i)} contains a local-only term`);
  }
  return out;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}
