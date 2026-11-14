# Review findings

Reviewed 2026-11-14, after the report went live. Three passes:
- **Hostile input:** malformed files, odd text and abused controls, against the calibration tool locally and the live report.
- **Security:** the code, the full git history and the live hosting.
- **Correctness:** an independent review of the statistics, the quote check, the spending caps and the derivation of every public figure, by a reviewer who hadn't written the code.

Every fix has a test, and each test was shown to fail on the code before the fix.

### 1. A damaged project file broke the tool on every load
Steps: open a project file whose rows are `[{}, {}]` (or with a null criteria version, or labelling marked done with no sample).
Promise broken: "Every storage access is guarded, so the page still works" (ADR 0011).
What happened: the file was accepted, saved over the current work, and the page showed "Something went wrong". Reloading loaded the same file and failed again.
Seriousness: high for anyone it hit. They lost their saved work, and only "Clear everything" got them out.
Status: **Fixed.** The whole file is checked before it's used, and a project that can't be shown is refused without touching the saved work. Damaged saved work at start-up now gives a way out: download it or clear it. Tests: `project.test.js` (12 damaged shapes) and `flow.test.js` (both paths in a real browser).

### 2. The total judge spend was understated
Steps: add `spent` across every file in `eval/runs/`.
Promise broken: "Every judge run … cost $4.87" (report, README).
What happened: the total left out the Opus run on the vague criteria. That run was stopped after 33 calls when the credit ran out, and it cost $0.17. The total also added parts that had already been rounded. The real figure is **$5.05**.
Seriousness: a wrong public figure (small).
Status: **Fixed.** `eval/findings.mjs` counts every run file, refuses one it can't place, and rounds once. Test: `report.test.js`. No accuracy figure changed.

### 3. A project file could show a score whose quote was never checked
Steps: edit a saved project so a result reads `{ status: "pass", quote: "totally made up words" }`, then open it.
Promise broken: "every score shows its evidence: a quote verified in code".
What happened: the score was shown and counted in the pass rates.
Seriousness: a wrong answer shown, but only from a hand-edited file.
Status: **Fixed.** Stored pass and fail results go through the same check as live ones, and anything that fails is withheld. Test: `project.test.js`.

### 4. The quote check withheld a real quote and accepted a fragment
Steps: (a) the reply says "Sorry... we can refund you today" and the judge quotes it word for word; (b) the judge quotes "und you in fu" from "We will refund you in full".
What happened: (a) the reply's own "..." was read as joining two parts, so the quote was withheld. (b) A fragment cut from the middle of words was accepted.
Seriousness: minor. No verdict in the runs changed, and every report figure stayed the same once the fix was applied.
Status: **Fixed.** A quote found in full is taken as one passage, and each passage must start and end on a word boundary. Tests: `quote-reply.test.js`.

### 5. An unchecked quote wasn't marked as unchecked
Steps: an `unclear` verdict whose quote isn't in the text; a withheld pass that quoted the customer's message.
What happened: the first showed "The judge quoted: …" with no caveat. The second said the quote "shows what the reply left out", which is wrong for a pass.
Seriousness: minor; neither showed a score.
Status: **Fixed.** Any quote the code can't place says "not found in the text, so it isn't evidence", and the left-out note appears only for a failure. Test: `flow.test.js`.

### 6. Layout broke at the smallest phone width
Steps: open the tool's "How far to trust it" screen, or the report's cover, at 320 px.
What happened: the tool's trust cards stuck out of their container by 6 px, because the grid's minimum column was wider than the screen. On the report, the drawn ring stuck out by 2 px and its caption was squeezed to one word per line.
Seriousness: minor.
Status: **Fixed.** The page tests now run at 320 px and either side of every breakpoint, not only at 390 and 1,280.

### 7. The judge-model picker claimed models "clear your bars" when none were ticked
Status: **Fixed.** With no bars ticked, it now says nothing rules a model out and names the cheapest. Test: `report.test.js`.

### 8. Public claims that weren't true as written
- "The page won't build if a number is typed by hand": only a test checked this. **Fixed:** the build now refuses, and a test shows it.
- The README's figures were typed in and checked by nothing. **Fixed:** a test ties each one to `findings.json` and fails on any number it can't account for.
- The case study said the results "couldn't move" the bars, but one bar was replaced after it was missed. The report's limits now also say that the injection bar was written into the model-picking rule only after Haiku's run. The case-study wording is corrected on the site.

## What held up

- **Markup:** markup in a reply or a criterion name shows as text and never runs. Tested with `<img onerror>` and `<script>`.
- **The API key:** it goes only to `api.anthropic.com`. It's stored only if the visitor asks, and "Clear everything" removes it.
- **Page safety:** the content security policy allows no third-party code. The report makes no requests beyond its own files.
- **Git history:** all commits are free of keys, tokens and private email addresses, and every commit uses a noreply address.
- **Live hosting:** each of the report's 11 files returns 200. Its template, build scripts, data, design notes and local files all return 404. The page works with and without the trailing slash.
- **Hostile input:** right-to-left text, emoji, zero-width and NUL characters, cells that start with a spreadsheet formula, an item over 20,000 characters (refused before sending), 600 rows (500 loaded, the rest refused), a bad JSONL line, an unclosed quote, and an empty or header-only paste.
- **Interactive pieces:** the sliders and checkboxes hold up when pushed past their ends, and quiz answers clicked twice count once.
- **Accessibility:** colour contrast meets WCAG AA on every text element, on the report and on six tool screens, in light and dark. Every control has a name and a visible focus ring. Headings never skip a level. Text at 200% fits on a phone.
- **Without scripts:** the report reads in full, with its static charts and tables.
- **Statistics and money:** the reviewer recomputed the headline figures independently from the run files, and they match (findings 189 of 196, 94.6%, kappa 0.86; 193 of 196, 64.8%, kappa 0.35). So do the model table, the labels-needed table and the scale figures. The Wilson interval, kappa, sampling, cost reservation and spending caps check out.

## Not tested

- **A real screen reader** (NVDA or VoiceOver). Names and structure were checked in code only.
- **The report bar** (ADR 0014): whether a reader new to the subject can state the three main findings. It needs two such readers.
- **Minor, left as is:** when a paste has more than 500 rows, the rows after the 500th are reported as one refusal. The message names the row range, so "loaded + refused" doesn't add up to the file's row count.
