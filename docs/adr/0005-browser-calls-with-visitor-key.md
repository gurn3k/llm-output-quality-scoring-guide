# 0005. The browser calls Anthropic directly with the visitor's own key

## Decision
- The page calls `https://api.anthropic.com/v1/messages` (and `/v1/messages/count_tokens`) from the browser with plain `fetch`. It sends the visitor's key in `x-api-key`, plus the `anthropic-version` header and `anthropic-dangerous-direct-browser-access: true`.
- The key is held in memory. It's saved to this device's storage only if the visitor ticks "remember on this device", and a "forget key" button clears it.
- A Content-Security-Policy allows network requests only to `api.anthropic.com`, and scripts only from the page's own origin. No third-party scripts, fonts or analytics.
- All loaded text is inserted as text (`textContent`), never as HTML.
- The page states where the key goes and links to the source code so anyone can check.

## Alternatives
- A server proxy holding our key. Rejected: it costs us money per visitor, needs abuse controls, and sends visitors' data through our server.
- A server proxy forwarding the visitor's key. Rejected: visitors would have to trust our server with their key and data, which breaks the "stays in your browser" promise (ADR 0001).
- The official Anthropic SDK in the browser. Rejected for now: it adds a dependency and needs a bundler or a CDN script, which conflicts with "no third-party scripts". The surface we use (two endpoints, one JSON shape) is small enough for `fetch`. Revisit if the surface grows.

## Why
It's the only design where the visitor's data and key touch nothing but their browser and Anthropic. The browser-access header exists for exactly this use ([announcement](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access)). Anthropic's Commercial Terms make the key holder responsible for their own usage (`docs/RESEARCH.md` section 4).

## Consequences
- A key typed into a page is exposed to anything that runs in that page. The CSP, no third-party code and text-only rendering are the defences, and the security review must test them.
- We hand-write request and error handling the SDK would provide: retries with backoff on 429 and 5xx, and errors by status code. Tests cover each status.
- Visitors without an Anthropic API account can use the demo, but not their own data.
