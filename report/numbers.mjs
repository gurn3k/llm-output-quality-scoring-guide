// Finds numbers typed by hand into the report template's reading text. Every figure must come from
// findings.json through a {{placeholder}} or a {{block}}; fixed rules and dates are marked
// <span data-fixed>…</span> so they're visibly deliberate.
export function handTypedNumbers(template) {
  let t = template
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<span data-fixed>[^<]*<\/span>/g, " ")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/<[^>]*>/g, " ");
  const out = [];
  for (const m of t.matchAll(/[^\s]*\d[^\s]*/g)) out.push(t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10).replace(/\s+/g, " ").trim());
  return out;
}
