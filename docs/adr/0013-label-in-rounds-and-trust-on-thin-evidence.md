# 0013. Label in rounds; allow trust on thin evidence, marked as such

Decided by the owner, 2026-11-10.

## Context
The "too wide to decide" rule (ADR 0009) needs at least 5 failures in the held-back third. When about 15% of replies fail a criterion, 40 labels give about 6 failures, and the held-back third about 2. Even 60 labels hold back about 3. Meeting the rule takes roughly 100 labels at that failure rate, so with 40 labels nearly every criterion would say "too wide to decide", and the demo could never show a criterion earn trust.

## Decision
- **Rounds.** After the first sample, the page offers "label 20 more". New items come from the same fixed random order, so earlier labels and the held-back set never move; every third new item is held back. The judge's verdicts on new items stay hidden until they're labelled.
- **How many more.** For each criterion still too wide, the page estimates the labels needed from the failure rate you've marked so far ("about 40 more to hold back 5 failures"), rounded up to the next 10.
- **Trust on thin evidence.** You may mark a criterion trusted while it's still too wide. It's then marked "trusted before the range narrowed" on the trust screen, beside every score it produces, and in both exports.
- **Demo.** The demo's test set gets enough planted failures per criterion for the held-back third to reach 5, so it can show a real trust decision as well as a too-wide one.
  - *Correction, 2026-11-10 (found while building the page):* with all 92 replies labelled, the held-back third holds 4 to 7 failures per criterion. That can meet the 5-failure rule, but the "caught" range stays wider than 30 points: even 7 of 7 caught gives 65% to 100%. A range under 30 points needs about 10 held-back failures. So the demo can show trust on thin evidence, but not plain "trusted". Open for the owner: accept this, or change the demo or the rule.
  - *Resolved, 2026-11-11:* the owner chose a bigger test set over thin evidence. It now has 220 replies, with 49 planted failures per criterion: Escalates includes 8 over-escalations, where a simple request is handed to a specialist. With every reply labelled, the demo's held-back third holds 16 (Accurate), 20 (Answers), 17 (Escalates) and 12 (Tone) failures. The first three stay under 30 points with one miss; Tone does so only if every held-back failure is caught (12 of 12 gives 76% to 100%). Plain "trusted" is reachable; whether each criterion gets there depends on the real judge results.

## Alternatives
- Rounds only, no trust until the rule is met. Strictest, but most users would need about 100 labels before scoring anything.
- Lower the bar (3 failures, 40-point ranges). Faster, but the verdict says less than it appears to.
- Keep as is. Honest, but the product would rarely reach a decision.

## Consequences
Scores from a thin-evidence criterion carry a visible mark, so a reader can tell the two kinds of trust apart. The held-back split rule changes from a second shuffle to every third item in draw order (ADR 0009 updated); it's still random, and now stable under rounds.
