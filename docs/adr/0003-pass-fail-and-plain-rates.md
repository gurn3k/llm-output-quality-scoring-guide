# 0003. Pass/fail criteria only, trust shown as plain rates first

## Decision
- Version 1 scores each criterion pass or fail. The judge may answer `unclear`, which sends the item to a review pile rather than counting it.
- Trust in the judge is shown first as two plain rates with ranges, measured on held-back labels: how many of the failures you marked it caught, and how many of the replies you passed it passed. Kappa and raw agreement sit underneath for readers who want them.

## Alternatives
- Pass/fail plus 1-5 scales (the original plan). Rejected for v1: scales are vaguer, need a different agreement statistic, and are harder to explain. Possible later.
- Kappa as the headline. Rejected: most PMs can't act on "0.62".
- Raw agreement alone. Rejected: it hides a judge that passes everything when failures are rare.

## Why
Practitioner guidance (Husain, `docs/RESEARCH.md` section 5) recommends pass/fail verdicts and separate true-positive and true-negative rates. Plain rates match how a PM would explain the result to their team.

## Consequences
Users who want graded quality must split it into several pass/fail criteria. Each rate needs enough labelled passes and fails; with few failures labelled, the "caught" rate's range will be wide, and the page must say so and suggest labelling more failures.
