# Can you trust an AI judge?

[![tests](https://github.com/gurn3k/llm-output-quality-scoring-guide/actions/workflows/tests.yml/badge.svg)](https://github.com/gurn3k/llm-output-quality-scoring-guide/actions/workflows/tests.yml)

Teams use an AI model to grade other AI output ("LLM-as-judge"), then report its scores as quality. This project checks how far those scores can be trusted: an AI judge graded 216 customer support replies against a written policy, and every grade was checked against a hand-written answer key and a person's blind labels.

**Findings report:** [gurn3k.com/judging-the-judge](https://gurn3k.com/judging-the-judge/). The source is [`report/index.html`](report/index.html): open it in a browser after cloning, or run `npm run report` to rebuild it.

## Three findings

1. **With clear criteria, the judge is good.** It caught 189 of 196 planted failures and agreed with the answer key on 95% of verdicts (kappa 0.86).
2. **Vague criteria hide their damage from the usual metric.** The catch rate stayed high (193 of 196), but agreement fell to 65% (kappa 0.35), because the judge failed 297 verdicts the key passes. Catch rate alone would have called the vague rubric better.
3. **A few dozen labels can't tell you whether to trust it.** With 40 labelled replies, no criterion had enough held-back failures to decide. It took 160 before three of the four could.

The report also covers a three-model comparison (the cheapest model obeyed an instruction hidden in a reply), how a person's labels compare, and the limits. All judge runs cost $5.05 in API fees.

## Limits

- One made-up shop and policy. I wrote the answer key, and my blind labels are the only independent check on it.
- Planted failures are clearer than real ones, so expect lower agreement on real data.
- One bar was replaced after it was missed. The replacement was fixed before the last replies were judged, and the original miss stays on record in `eval/REPORT.md`.
- Call timings weren't recorded, so nothing here claims anything about speed.

## Walkthrough

[`report/media/walkthrough.mp4`](report/media/walkthrough.mp4): 83 seconds, silent with captions. It shows the calibration tool built for this, in demo mode with stored results, so it makes no API calls.

## What's here

| Folder | What it holds |
|---|---|
| `site/` | The calibration tool: one static page, no dependencies. Load replies, write pass/fail criteria, label a sample, and check the judge on replies it never tuned on. |
| `eval/testset/` | The policy, the 216 replies plus 4 prompt-injection replies, both criteria sets, and the answer key. |
| `eval/runs/` | Every judge verdict, with the raw API replies. |
| `eval/` | The scripts that made the test set, ran the judge and derived the findings; `eval/REPORT.md` is the full technical write-up. |
| `report/` | The findings report. Every figure comes from `report/data/findings.json`, and a test fails if one is typed by hand. |
| `docs/` | The requirements, design, build log, decision records (`docs/adr/`) and review findings (`FINDINGS.md`). |

## Run it locally

Needs Node 22 or later. No dependencies to install.

```
npm start       # the calibration tool at http://127.0.0.1:4321/ ("Try the demo" needs no key)
npm run report  # rebuild the findings data and report/index.html
npm test        # unit tests, plus page tests in headless Chrome or Edge if one is installed
npm run check   # syntax and page-safety checks
```

Set `SCREENSHOT_DIR` to save the page tests' screenshots.

Re-running the judge needs your own Anthropic API key in `.env.local` (never committed); the run scripts in `eval/` stop at a spending cap.

## Licence

MIT. See [LICENSE](LICENSE). Built and measured by Gurnek Khaira ([LinkedIn](https://www.linkedin.com/in/gurnek-khaira)).
