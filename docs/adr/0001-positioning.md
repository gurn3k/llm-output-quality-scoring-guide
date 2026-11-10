# 0001. Position as the free, no-account way to check a judge

## Decision
Describe the product as: check your judge before you trust it, with no account, nothing to install, and data that stays in your browser. The README credits LangSmith and Braintrust, which already calibrate judges against human labels, and says how this differs.

## Alternatives
- Claim calibration itself as the new idea. Rejected: research (`docs/RESEARCH.md`, section 1) shows paid platforms already offer it.
- Pause and look for a sharper angle. Rejected by the owner, 2026-11-10.

## Why
No tool found runs the whole loop (load outputs, rubric, labels, chance-corrected agreement with a range, scoring with checked quotes) in a free hosted page without sign-up. That gap is about access and honesty, so the positioning says so.

## Consequences
The pitch is narrower and must stay accurate as competitors change. Re-check LangSmith and Braintrust before launch. The product has to earn trust through what it shows (ranges, checked quotes), because "first to do this" isn't available.
