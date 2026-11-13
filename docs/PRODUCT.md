# Product

<!-- impeccable:product-schema 1 -->

Updated 2026-11-13. The public product is the **findings report** (ADR 0014, ADR 0015). The calibration tool, described in the second half of this file, stays in the repo and runs locally.

## Platform

web

## Users

Two readers, served equally:
- **Someone judging the author** (a hiring manager, recruiter or peer, arriving from a link or gurn3k.com). Two to five minutes. They should leave knowing the work was measured honestly, misses included.
- **A PM or AI builder who runs an LLM judge themselves.** They read further, and want lessons they can apply to their own judge.

The top of the page serves the short visit; the body serves the practitioner.

## Product Purpose

Show how far an AI judge's scores can be trusted, using real runs: an AI judge graded 216 support replies against a written policy, and every verdict was checked against an answer key and a person's blind labels. Success: a reader new to the subject can state the three main findings after reading (ADR 0014's report bar).

## Positioning

Most writing on LLM-as-judge reports a single score or a vendor's claim. This report shows the checking itself: every figure is derived by code from published run files, misses and replaced bars are on the record, and a reader can verify any number in the repo.

## Operating Context

- Read in a browser, often from a link on a phone or a laptop, sometimes alongside the GitHub repo.
- Static page, no dependencies, one script of its own; nothing loaded from other sites. Hosting is still to be decided.
- Every figure comes from `report/data/findings.json` through placeholders; a test fails on a hand-typed number.

## Capabilities and Constraints

- Sections: three findings, the walkthrough video, what was tested, a you-be-the-judge quiz, the three findings in depth with charts and real examples, models and injection, blind labels, the quote check, what to take away (with a judge-model picker), limits, cost.
- Interactive pieces must work by keyboard and screen reader, and the page must read in full with scripts off.
- When the reader finishes, they should be able to: contact the author (gurn3k.com, LinkedIn), check the data (GitHub), apply the lessons, and see the author's other builds (gurn3k.com).

## Brand Commitments

- The gurn3k wordmark (`report/media/gurn3k-*.svg`) appears in the byline and footer and always links to https://gurn3k.com.
- The report has its own look, with a visible nod to gurn3k.com. This build has no colour of its own on gurn3k.com yet.
- Voice: plain, specific, first person, no hype. It must not read as marketing, and must not look like a generic AI-made page.

## Evidence on Hand

- `report/data/findings.json` (every figure), `eval/runs/` (every verdict with raw API replies), `eval/testset/`, `eval/blind/`, `eval/REPORT.md`.
- `report/media/walkthrough.mp4` with `poster.jpg`; real example replies with the judge's quote and reason.
- No testimonials, users or press exist; none may be invented.

## Product Principles

1. The figure carries its uncertainty: ranges and counts out of counts, never a bare percentage.
2. Misses are shown at the same weight as wins.
3. Every claim can be checked against published data.
4. Plain words over jargon; a term like kappa is explained where it first appears.

## Accessibility & Inclusion

Pass and fail are never shown by colour alone. Everything works by keyboard, with visible focus, in light and dark, at phone width, with a wide fallback font, and with reduced motion.

---

# The calibration tool (runs locally)

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
