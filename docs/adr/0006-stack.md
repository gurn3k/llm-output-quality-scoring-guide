# 0006. Static page, plain JavaScript modules, no dependencies

## Decision
- `site/` holds `index.html`, `style.css`, and ES modules under `site/src/`. No build step, no framework, no npm dependencies.
- Pure logic (parsing, sampling, statistics, quote checks, cost, shaping judge requests and replies) lives in modules with no DOM access, so Node can test them directly.
- Tests: Node's built-in test runner (`node --test`). Page tests drive headless Chrome over the DevTools protocol with Node's built-in WebSocket, with no dependency (an approach proved on an earlier private project). Screenshots at phone and desktop widths, light and dark, and layout checks with a wide fallback font.
- CI: GitHub Actions runs both suites on every push, from the first commit.
- Deploy: Vercel, from a staging folder holding only the files in `site/`. Afterwards every non-page path is requested and must return 404.

## Alternatives
- React or Svelte with a build step. Rejected: dependencies and a toolchain for a single page with modest state.
- Playwright for page tests. Rejected: a dependency, and the DevTools-protocol route already works without one.

## Why
Fewest moving parts, nothing to approve or audit, and a page anyone can read with "view source", which supports the "check where your key goes" promise.

## Consequences
We write our own small CSV parser, random-number generator, statistics and DOM helpers, each with its own tests. State is managed by hand, so it stays in one module with a single render path.
