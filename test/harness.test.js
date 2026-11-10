// The page tests are only worth trusting if they can fail. This plants each problem they look
// for on a fixture page and checks the harness reports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { serve } from "../scripts/server.mjs";
import { launch, SKIP } from "./harness.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/broken-page", import.meta.url));

test("the harness catches a console error, an exception and an element wider than its container", { skip: SKIP }, async (t) => {
  const server = await serve(FIXTURE);
  const b = await launch();
  t.after(async () => { await b.close(); server.close(); });

  await b.open(`http://127.0.0.1:${server.address().port}/`);
  await b.until(`true`, "settle");
  assert.ok(b.errors.some((e) => e.includes("planted console error")), `console error not caught: ${JSON.stringify(b.errors)}`);
  assert.ok(b.errors.some((e) => e.includes("planted exception")), `exception not caught: ${JSON.stringify(b.errors)}`);
  await b.viewport(1280);
  assert.ok((await b.overflow()).some((p) => p.includes("#too-wide")), "overflow not caught");
});
