# 0009. Statistics: Wilson ranges for rates, kappa with a range, seeded sampling

## Decision
- **Rates** ("caught X of Y failures", "passed X of Y", and the pass rate over scored items) get a 95% Wilson score interval. It behaves sensibly at small counts and at 0% or 100%, unlike the simple normal interval.
- **Kappa:** Cohen's kappa on items both you and the judge decided (unclear and skipped items are excluded and counted), with a 95% range from the standard large-sample formula and a note that it's approximate at small sizes.
- **Too wide to decide:** any shown range wider than 30 points, or fewer than 5 failures you marked in the held-back set (PRD P11).
- **Randomness:** a seeded random-number generator (mulberry32), with the seed shown. Sampling uses a Fisher-Yates shuffle of all rows; the labelling sample is the first N of that order. Every third item in that order is held back, so about a third is held back. Because both come from one fixed order, labelling more in rounds (ADR 0013) extends the sample and the held-back set without moving any item already labelled. (Changed 2026-11-10 from "every third item of a second shuffle", which would reshuffle on each round.)
- **The pass rate over scored items** counts only verdicts shown (pass or fail with a found quote). Withheld, unclear and errored items are listed beside it, never folded in.

## Alternatives
- Bootstrap intervals. Rejected for v1: slower and harder to explain, with little benefit at these sizes.
- Correcting the pass rate for the judge's measured error rates (prediction-powered inference, as one hosted calculator does). Deferred: valuable, but a second figure to explain. A candidate for version 2.

## Why
These are standard, short, testable formulas, and the tests check each against hand-worked examples.

## Consequences
Results repeat exactly from the seed. The kappa range is approximate, so the plain rates carry the headline (ADR 0003).
