// The real page in headless Chrome: it loads without errors, keeps its security policy, and fits
// at phone and desktop widths, in light and dark, with a normal and a wide font.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { serve } from "../scripts/server.mjs";
import { launch, SKIP, WIDTHS, SHOT_WIDTHS } from "./harness.mjs";

const SITE = fileURLToPath(new URL("../site", import.meta.url));

test("the page in a real browser", { skip: SKIP }, async (t) => {
  const server = await serve(SITE);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await launch();
  t.after(async () => { await b.close(); server.close(); });
  await b.open(url);

  await t.test("loads its script with no errors", async () => {
    await b.until(`document.querySelector("#app p") !== null`, "the app to render");
    assert.deepEqual(b.errors, []);
  });

  await t.test("allows network requests only to itself and api.anthropic.com", async () => {
    const csp = await b.js(`document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? ""`);
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /connect-src 'self' https:\/\/api\.anthropic\.com(;|$)/);
    assert.match(csp, /script-src 'self'(;|$)/);
  });

  await t.test("fits from 320 to 1280 wide and either side of the 760 breakpoint, light and dark, normal and wide font", async () => {
    for (const theme of ["light", "dark"]) {
      await b.scheme(theme);
      for (const width of WIDTHS) {
        for (const wide of [false, true]) {
          await b.viewport(width);
          await b.wideFont(wide);
          const font = await b.js(`getComputedStyle(document.querySelector("h1")).fontFamily`);
          assert.equal(/Verdana/.test(font), wide, `wide font ${wide ? "not applied" : "left on"}: ${font}`);
          assert.deepEqual(await b.overflow(), [], `${width}px ${theme}${wide ? " wide font" : ""}`);
          if (!wide && SHOT_WIDTHS.includes(width)) await b.screenshot(`page-${width}-${theme}`);
        }
      }
    }
    await b.wideFont(false);
    assert.deepEqual(b.errors, []);
  });

  await t.test("dark mode really changes the colours", async () => {
    await b.scheme("light");
    const light = await b.js(`getComputedStyle(document.body).backgroundColor`);
    await b.scheme("dark");
    const dark = await b.js(`getComputedStyle(document.body).backgroundColor`);
    assert.notEqual(light, dark);
  });
});
