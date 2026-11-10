// npm run check: syntax-check every script, then apply the rules in check-rules.mjs.
// There's no linter or type checker, to keep the project free of dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unsafeHtml, externalUrls, datedPrices, forbiddenTerms } from "./check-rules.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Files git would publish: tracked plus untracked-but-not-ignored. Local-only files are ignored.
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter(Boolean).filter((f) => existsSync(join(ROOT, f)));

const problems = [];
const read = (f) => readFileSync(join(ROOT, f), "utf8");

for (const f of files.filter((f) => /\.m?js$/.test(f))) {
  try { execFileSync(process.execPath, ["--check", join(ROOT, f)], { stdio: "pipe" }); }
  catch (e) { problems.push(`${f}: syntax error\n${e.stderr}`); }
}

const siteFiles = files.filter((f) => f.startsWith("site/") && [".html", ".js", ".css", ".json"].includes(extname(f)));
for (const f of siteFiles) {
  const src = read(f);
  if (f.endsWith(".js") || f.endsWith(".html")) problems.push(...unsafeHtml(f, src));
  problems.push(...externalUrls(f, src));
}
if (files.includes("site/src/cost.js")) problems.push(...datedPrices("site/src/cost.js", read("site/src/cost.js")));

// The term list lives in a local-only file, so it never leaves this machine. CI has no copy.
const termsFile = join(ROOT, ".local", "terms.txt");
let termsNote = "local-only term scan skipped (no term list on this machine)";
if (existsSync(termsFile)) {
  const terms = readFileSync(termsFile, "utf8").split("\n").map((t) => t.trim()).filter((t) => t && !t.startsWith("#"));
  for (const f of files.filter((f) => !/\.(png|jpg|ico)$/.test(f))) problems.push(...forbiddenTerms(f, read(f), terms));
  termsNote = `local-only term scan: ${terms.length} terms over ${files.length} files`;
}

if (problems.length) {
  console.error(`check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`check: ${files.length} files OK (${siteFiles.length} page files); ${termsNote}`);
