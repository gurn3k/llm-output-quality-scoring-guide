# 0014. Publish the findings, not the tool

Decided by the owner, 2026-11-11, after looking at the working page.

## Context
The calibration page works end to end: bring outputs, write criteria, label, check the judge, score the rest. The measurement work behind it produced findings worth more than the page itself: how well an AI judge agrees with a written answer key, what vague criteria do, how the three model sizes compare, how many labels a trust decision needs, and where a person and the judge both find the criteria ambiguous. The owner doesn't want to publish a tool that lets others repeat the method; they want to publish what it found.

## Decision
- **The public product is a findings report:** one static page on its own Vercel address. Readers don't bring outputs, write criteria or label anything.
- **Depth:** headline findings, a few charts and tables, and a handful of real replies with the judge's verdict, quote and reason. It should be readable in about 5 minutes.
- **Public repo, report only:** the report page, plus the data a reader needs to check the numbers: the fictional policy, both criteria sets, the test set, the answer key, every verdict with its quote and reason, and the owner's blind labels.
- **Kept private:** the calibration page, the judge client and its instructions, the cost and statistics code, the run scripts, and raw API replies. They stay in this project and are backed up privately.

## Alternatives
- **Ship the tool as planned.** Useful to others, but it gives the method away, which the owner doesn't want.
- **Report with the full code public.** Most checkable, but the same objection.
- **Report with no data.** Simplest, but a reader would have to take every number on trust, which undercuts a report about checking AI judges.

## Consequences
- The PRD's demo bar (two new people finish the demo in under 2 minutes) no longer applies. It's replaced by a report bar: a reader new to the subject can state the three main findings after reading it.
- The measurement bars stay as measured in `eval/REPORT.md`, which becomes the report's source.
- The tool's tests keep running here, so the numbers stay reproducible privately.
- Publishing needs the owner's approval of the repo name and the deploy.
