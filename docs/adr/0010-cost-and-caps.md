# 0010. Cost: estimate before, worst-case accounting during, hard stop at the cap

## Decision
- **Estimate:** before a run, the page counts tokens for one real request per criterion with the free `count_tokens` endpoint, then multiplies by the number of items, adding cache write and read prices and an output allowance measured on the sample run. It shows a range (typical to worst case) and asks to proceed.
- **Hard cap:** before each call, the code adds that call's worst case (its input tokens at the full input price, plus `max_tokens` at the output price) to the money already spent, read from each reply's `usage`. If the total would pass the cap, the call isn't sent and the run pauses with "cap reached". The default cap is $0.50 per run, and the user can change it.
- **Resume:** finished verdicts are kept. Resuming sends only the items still missing.
- **Prices** live in one table in the code, with the date they were checked, shown on the page.

## Alternatives
- Estimate only, no enforcement. Rejected: estimates miss, and the cap is a promise.
- Estimating from character counts. Rejected: `count_tokens` is exact and free.

## Why
Worst-case accounting means the cap can't be exceeded, even if every reply runs to its maximum length.

## Consequences
Runs may pause a little before the cap is truly reached, because each call reserves its worst case. Prices must be re-checked when models change, and the page shows the date.
