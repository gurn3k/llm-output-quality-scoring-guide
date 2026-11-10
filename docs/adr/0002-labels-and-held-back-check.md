# 0002. Ask for 30-40 labels and hold back a third for the final check

## Decision
- The scorer asks for 30-40 hand labels by default. It accepts fewer, but shows a range on every agreement figure and says plainly when the range is too wide to decide.
- Labels are split: about two-thirds for tuning the rubric, one-third held back. The headline agreement comes only from the held-back labels, which rubric edits never saw.
- The demo ships pre-labelled, so visitors can try it without labelling.

## Alternatives
- 15-20 labels. Rejected: at 20 labels the kappa range is about ±0.31 (`docs/RESEARCH.md`, section 2), too wide to act on.
- Measure on all labels and warn about overfitting. Rejected: it reports a figure we know runs high.

## Why
An agreement figure is only useful if it can tell a usable judge from an unusable one. Tuning and measuring on the same labels overstates agreement (LangSmith's own guidance says the same).

## Consequences
More labelling work for users (30-40 instead of 15-20). With about 13 held-back labels from 40, the held-back figure is still imprecise, so the range must always be shown, and the page should suggest labelling more when it's too wide. The "stranger finishes in 2 minutes" bar depends on the pre-labelled demo.
