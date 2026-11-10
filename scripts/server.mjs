// A static server for site/ that serves only the page's own files.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { resolvePublic, TYPES } from "./paths.mjs";

export function serve(root, port = 0) {
  const server = createServer(async (req, res) => {
    const file = resolvePublic(root, req.url);
    if (!file) { res.writeHead(404, { "content-type": "text/plain" }).end("Not found"); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}
