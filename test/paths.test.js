import { test } from "node:test";
import assert from "node:assert/strict";
import { join, normalize } from "node:path";
import { isPublic, resolvePublic } from "../scripts/paths.mjs";
import { serve } from "../scripts/server.mjs";
import { fileURLToPath } from "node:url";

const ROOT = normalize("/srv/site");

test("only the page's own files are public", () => {
  for (const ok of ["/", "/index.html", "/style.css", "/icon.svg", "/src/app.js", "/src/quote-check.js", "/data/demo.json"]) assert.ok(isPublic(ok), ok);
  for (const no of ["/.git/config", "/.env.local", "/CLAUDE.md", "/docs/PRD.md", "/package.json", "/scripts/check.mjs",
    "/src/App.js", "/src/sub/x.js", "/data/x.csv", "/%2e%2e/secret", "/src/%2e%2e/.env.local",
    "/src/a.js%00.png", "/src\\..\\x.js", "/%E0%A4%A", "/index.html/"]) assert.equal(isPublic(no), false, no);
});

test("public paths resolve inside the root, and nothing else resolves", () => {
  assert.equal(resolvePublic(ROOT, "/"), join(ROOT, "index.html"));
  assert.equal(resolvePublic(ROOT, "/src/app.js?v=2"), join(ROOT, "src", "app.js"));
  assert.equal(resolvePublic(ROOT, "/../etc/passwd"), null);
  // Browsers and the URL parser remove dot segments first, so this is just the page itself.
  assert.equal(resolvePublic(ROOT, "/src/../index.html"), join(ROOT, "index.html"));
  assert.equal(resolvePublic(ROOT, "/%E0%A4%A"), null, "a malformed escape never throws");
});

test("the server returns 404 for everything outside the page's files", async (t) => {
  const site = fileURLToPath(new URL("../site", import.meta.url));
  const server = await serve(site);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.match((await fetch(`${base}/src/app.js`)).headers.get("content-type"), /^text\/javascript/);
  for (const p of ["/.git/config", "/package.json", "/../package.json", "/%2e%2e/package.json", "/src/missing.js"]) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
});
