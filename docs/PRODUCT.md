# Who visits, and what each screen is for

2026-11-10. The flow and promises are in `docs/PRD.md`; this says who the page is for and what each screen has to do first.

## Who visits

1. **A PM who owns quality for an AI feature.** They've been told to "own evals", they have a spreadsheet of model outputs, and they need a number they can defend in a review. They're not an ML engineer. They have 20 minutes, not a day.
   - **First 30 seconds:** what this does, that their data and key stay in their browser, and that they can try it without a key. One obvious first action: "Try the demo" or "Bring your outputs".
2. **Someone judging the person who built it** (a hiring manager or a peer, arriving from a link). They'll spend about two minutes.
   - **First 30 seconds:** the demo running end to end, and the honesty on show: ranges, withheld counts, "too few labels to decide". The one thing to remember: it refuses to overstate.

Both need the same thing from the first screen: what it is in one sentence, the privacy promise, and the demo one click away.

## Screens, and the one job of each

| Screen | Its job | What must be visible without scrolling |
|---|---|---|
| Start | Explain in one sentence; start the demo or load your own | The sentence, "your data and key stay in this browser", two buttons |
| Load | Get rows in, show what was refused | "N loaded, M refused" with each refused row's number and reason; column choice when headers are unclear |
| Criteria | Write 1-6 pass/fail criteria and optional reference | Each criterion's name and pass description; the "judge will have less to go on" notice when examples are missing |
| Label | Label 30-40 items fast, by keyboard | The customer message, the reply, one pass/fail control per criterion, progress ("12 of 40"), the keys |
| Calibrate | Show how far to trust the judge, per criterion | Plain rates first ("caught X of Y failures you marked"), each range drawn, "too wide to decide" in words, held-back vs tuning kept apart |
| Disagreements | Show every case where you and the judge differ | Your label, the judge's verdict, its quote (marked in the reply) and reason |
| Trust | Mark criteria trusted, or edit (new version) | Each criterion's held-back result beside its trust switch; the "measured after you saw earlier results" mark |
| Score | Estimate and run, under a cap | Estimated cost (typical to worst), the cap, a stop button, progress, money spent |
| Results | Pass rates with evidence, review pile, overrides, export | Per-criterion pass rate with range and the withheld, unclear and error counts beside it; the review pile count |

## What the design must get right

- **Ranges are the main figure, not decoration.** A rate is always drawn with its range, and a wide range must look uncertain at a glance.
- **Withheld and unclear counts sit beside the rate they affect, at the same size.** A high withholding rate can't hide.
- **Evidence is shown in place.** The quote is highlighted inside the reply, so a reader can check it in one look.
- **The reply text is the user's data, shown as plain text,** and is visually distinct from the page's own words.
- **Keyboard labelling is the fastest path,** with the keys shown on screen.
