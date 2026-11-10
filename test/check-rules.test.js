// Each check is shown failing on a planted violation, so a passing check means something.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unsafeHtml, externalUrls, datedPrices, forbiddenTerms } from "../scripts/check-rules.mjs";

test("HTML-parsing APIs are caught", () => {
  for (const bad of ["el.innerHTML = x", "el.innerHTML += x", "el.outerHTML=x", "el.insertAdjacentHTML('beforeend', x)", "document.write(x)", "document.writeln(x)", "range.createContextualFragment(x)"]) {
    assert.equal(unsafeHtml("a.js", bad).length, 1, bad);
  }
  assert.deepEqual(unsafeHtml("a.js", "el.textContent = x; el.append(node)"), []);
  assert.match(unsafeHtml("a.js", "ok\nel.innerHTML = x")[0], /a\.js:2/);
});

test("only api.anthropic.com may appear as a URL in page files", () => {
  assert.deepEqual(externalUrls("a.js", 'fetch("https://api.anthropic.com/v1/messages")'), []);
  assert.equal(externalUrls("a.js", '<script src="https://cdn.example.com/x.js">').length, 1);
  assert.equal(externalUrls("a.js", "http://api.anthropic.com.evil.test/").length, 1);
  assert.deepEqual(externalUrls("a.html", "connect-src 'self' https://api.anthropic.com; base-uri"), [], "a CSP list separator is not part of the URL");
});

test("the prices table must carry its checked date", () => {
  assert.deepEqual(datedPrices("cost.js", 'export const PRICES_CHECKED = "2026-11-10";'), []);
  assert.equal(datedPrices("cost.js", "export const PRICES = {};").length, 1);
});

test("local-only terms are caught, whatever the case", () => {
  assert.equal(forbiddenTerms("README.md", "Built with the Secret Process.", ["secret process"]).length, 1);
  assert.deepEqual(forbiddenTerms("README.md", "Nothing to see.", ["secret process"]), []);
});
