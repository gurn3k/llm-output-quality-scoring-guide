# 0015. Make this repo public, tool included

Decided by the owner, 2026-11-12. A deliberate choice, made knowing it reverses part of ADR 0014.

## Decision
- **This repository becomes public as a whole:** the calibration page, the judge client and its instructions, the cost and statistics code, the run scripts, the run files with raw API replies, the test set, the answer key, the blind labels, and the docs.
- **The hosted product is still the findings report** (ADR 0014), with the walkthrough video (ADR 0014 amendment). Anyone can run the tool locally from the code; no hosted page calls a paid API on the owner's key.
- **Before the switch:** no secrets in any commit (checked 2026-11-12: all 21 commits and every tracked file, none found; `.env*` is ignored); internal notes in tracked files rewritten for a public reader (ticket 12's leak scan).

## Supersedes
ADR 0014's "Kept private" list and its "Public repo, report only" line. The rest of ADR 0014 stands.

## Alternatives
- **A separate public repo holding only the report and its data** (the old ticket 15). Keeps the method private, but readers can't check how the numbers were made, and the strongest proof of the work stays hidden.

## Why
The method (calibrating a judge against human labels) is already offered by paid platforms (ADR 0001), so keeping it private protects little. Public code lets a reader verify every figure and shows the build itself.

## Consequences
- Ticket 15 becomes: prepare this repo for public view, rather than build a staging repo.
- The page's footer line "The source code link is added when the code is published" can now point to this repo.
- Making the repo public and the deploy still need the owner's go-ahead at the time.
