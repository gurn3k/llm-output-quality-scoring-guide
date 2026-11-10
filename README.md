# LLM Output Quality Scoring Guide

Check an AI judge against your own labels before you trust its scores. Free, no account, and your data stays in your browser.

Work in progress. The plan is in [docs/PLAN.md](docs/PLAN.md), the requirements in [docs/PRD.md](docs/PRD.md), and the decisions behind them in [docs/adr/](docs/adr/).

## Run it locally

Needs Node 22 or later. No dependencies to install.

```
npm start      # serves the page at http://127.0.0.1:4321/
npm test       # unit tests, plus page tests in headless Chrome or Edge if one is installed
npm run check  # syntax and page-safety checks
```

Set `SCREENSHOT_DIR` to save the page tests' screenshots.

## Licence

MIT. See [LICENSE](LICENSE).
