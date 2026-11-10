// Which request paths the page may serve, and where they live on disk.
// Only the page's own files are public, so the same rule is safe for a public host.
import { join, normalize, sep } from "node:path";

const PUBLIC = /^\/(?:index\.html|style\.css|icon\.svg|src\/[a-z][a-z0-9-]*\.js|data\/[a-z][a-z0-9-]*\.json)$/;

function pathOf(rawUrl) {
  try {
    const p = decodeURIComponent(new URL(rawUrl, "http://x").pathname);
    return p.includes("\0") || p.includes("\\") ? null : p;
  } catch {
    return null;
  }
}

export function isPublic(rawUrl) {
  const p = pathOf(rawUrl);
  return p !== null && (p === "/" || PUBLIC.test(p));
}

// Maps a public request path to a file inside root. Returns null for anything else. Never throws.
export function resolvePublic(root, rawUrl) {
  if (!isPublic(rawUrl)) return null;
  const p = pathOf(rawUrl);
  const file = normalize(join(root, p === "/" ? "index.html" : p));
  return file.startsWith(normalize(root) + sep) ? file : null;
}

export const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
