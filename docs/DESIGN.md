# Design spec

2026-11-10. Direction **C, Guided**, chosen by the owner from three mockups (`docs/design/mockups/`). Who the page is for and each screen's job: `docs/PRODUCT.md`.

## Principles

1. **One step, one decision.** Each screen asks one thing, says why in one line of help text, and has one primary button.
2. **The range is the figure.** Every rate is drawn with its 95% range. A wide range looks wide.
3. **Counts that qualify a figure sit beside it, at the same size.** Withheld, unclear and error counts are never footnotes.
4. **Your data looks like data.** Loaded text sits in dashed "data" boxes in monospace, inserted as text only. The page's own words never appear inside them.
5. **Evidence in place.** The judge's quote is highlighted inside the reply it came from.

## Layout

- **Shell:** a step rail (200px) beside one panel, max width 1040px, 16px side gutter. At 760px and below the rail becomes a horizontal, scrollable row of steps above the panel.
- **Steps:** Bring outputs · Write criteria · Label · How far to trust it · Score the rest · Results. Done steps show a tick; you can go back to any done step. Steps not yet reachable are shown but not clickable, with the reason as their accessible description.
- **Panel:** heading (22px), one line of help text (muted), content, then a footer row with secondary actions left and the primary button right.
- **Header above the shell:** the product name, one sentence, "Your data and key stay in this browser", and a "Demo" or "Your data" badge showing which mode you're in.

## Tokens

Defined on `:root`, with dark values under `prefers-color-scheme: dark` (guarded by `:root:not([data-theme="light"])`) and again under `:root[data-theme="dark"]`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #f6f3ff | #120f1d | page |
| `--surface` | #ffffff | #1b1729 | panel, cards |
| `--ink` | #1d1832 | #ece8fa | text |
| `--muted` | #635c7a | #a59dbf | help text, labels |
| `--line` | #e2dcf2 | #2e2844 | borders, empty bar track |
| `--accent` | #5b3fd6 | #a995ff | primary button, current step, point marker |
| `--accent-ink` | #ffffff | #120f1d | text on accent |
| `--pass` / `--passbg` | #1f7a4d / #e3f5ea | #63d69a / #163326 | pass verdicts |
| `--fail` / `--failbg` | #b8322a / #fbe6e3 | #ff8a7e / #3a1c1a | fail verdicts |
| `--warn` / `--warnbg` | #8a5300 / #fff3dc | #ffc266 / #33260f | too wide, thin evidence, withheld |
| `--range` | #cfc4fb | #3f3478 | range band |
| `--quote` | #ffe9a8 | #5e4b12 | highlighted quote |
| `--data` | #faf9fe | #161324 | data boxes |

Pass and fail are never shown by colour alone: the word is always there.

## Type and spacing

- System UI font, 16px body, line height 1.55. Headings 22px (panel), 16px (card). Help text and secondary text 14px. Numbers in rates use tabular figures; the big number in a rate is 22px.
- Data boxes: monospace 14px, `white-space: pre-wrap`, `overflow-wrap: anywhere`, so long words and URLs wrap instead of overflowing.
- Spacing scale: 4, 8, 12, 16, 22 px. Panel padding 22px (16px at phone width). Corners: panel 16px, cards 14px, rows 12px, buttons 10px, pills fully round.

## Components

- **Button:** primary (accent fill), secondary (outlined), danger (fail colour outline, for "Clear everything" and "Forget key"). Focus ring: 2px accent outline, 2px offset, on every interactive element.
- **Verdict choice:** two pill buttons per criterion, "Pass" and "Fail", each showing its key. The chosen one fills with `--passbg` or `--failbg` and has `aria-pressed="true"`. A skipped item shows "Skipped" in muted text.
- **Range bar:** a 10px track (`--line`), the range as a band (`--range`), the point estimate as a 3px marker (`--accent`) kept inside the track at 0% and 100%. Below it, in words: "likely between 38% and 96%". The bar has an accessible label that says the same.
- **Rate block:** "Caught **4 of 5** failures you marked", then its range bar. Plain counts first; percentages only in the range words.
- **Status pill:** "Too wide to decide yet" (warn), "Trusted" (pass), "Trusted before the range narrowed" (warn), "Not trusted" (muted).
- **Count row:** beside every pass rate: "Withheld 3 · Unclear 2 · Errors 0", same size as the rate's words, warn colour when not zero.
- **Data box:** dashed border, `--data` background, the label above it ("Customer wrote", "AI replied", "Reference").
- **Quote highlight:** `<mark>` around the found passage inside the reply. When the quote is from the customer's message (a missing-element failure), the highlight is in that box and the reason says what was missing.
- **Notice:** warn background, bold lead-in ("Why too wide?"), one or two sentences, an optional action.
- **Progress:** "Reply 12 of 40" plus a 6px bar.

## Screens

| Screen | Content, in order | Primary action |
|---|---|---|
| Start (header plus first panel) | Sentence; privacy line; "Try the demo (no key needed)"; "Bring your own outputs" | Try the demo |
| Bring outputs | File drop or paste box; "N loaded, M refused" with a list of refused rows (row number and reason); column choice when headers are unclear; preview of the first 3 rows in data boxes | Continue |
| Write criteria | 1-6 criterion cards (name, "passes when", optional failure examples, remove); "Add a criterion"; optional reference box; the notice "The judge will have less to go on" on any criterion without failure examples or with a short description; version number once results exist | Start labelling |
| Label | Help line; progress; two data boxes; one verdict choice per criterion; key hints; "Back", "Skip" | Next reply (Enter) |
| How far to trust it | Help line naming the held-back count; one card per criterion: rate blocks for caught and passed, status pill, "Show tuning figures" (collapsed), kappa line with its one-line meaning; notice per too-wide card with "Label N more"; "Disagreements (n)" list with your label, the judge's verdict, highlighted quote and reason; per card: "Trust this criterion" or "Edit (makes version n+1)"; the "measured after you saw earlier results" pill when it applies | Score the rest (enabled when at least one is trusted) |
| Score the rest | Model choice; estimated cost "typical $x, at most $y"; the cap (editable); key box with "Remember on this device" and "Forget key"; after start: progress, money spent, Stop; "Paused at the cap" notice with Resume | Start scoring |
| Results | Per trusted criterion: pass rate with range and the count row, trust pill; review pile ("Unclear: n"), each item with its quote and reason and Pass/Fail override; filter by criterion and verdict; every scored item expandable to its evidence; export buttons (CSV, JSON) and "Download project" | Export CSV |

Persistent footer (all screens): "Download project", "Open project", "Clear everything", the price table's checked date, and a link to the source.

## Keyboard

- Label screen: `1`/`2` pass/fail for criterion 1, `3`/`4` for criterion 2, and so on; `Enter` next; `Backspace` back; `S` skip. Keys only act when focus isn't in a text field.
- Everywhere: Tab order follows reading order; the step rail is a list of links; every control has a visible focus ring.

## States every screen handles

- Empty (nothing loaded yet), working (spinner text, not an animation that hides content), error (plain message with what to do), storage blocked (notice: "This browser won't keep your work after a reload. Download the project to save it.").

## Checks (ticket 08)

Screenshots at 390 and 1280px, light and dark, with and without the wide fallback font; no element outside its container; a reply containing markup shows as text.
