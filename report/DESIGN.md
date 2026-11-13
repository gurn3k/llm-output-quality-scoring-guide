---
name: Findings report
description: A static findings report on how far an AI judge can be trusted, set as a marked exam script with a second marker's check.
colors:
  paper: "#ffffff"
  raised: "#ffffff"
  ink: "#1e1f24"
  ink-2: "#4a4c55"
  rule: "#1e1f24"
  hair: "#d4d7de"
  feint: "#dbe5f3"
  data: "#fbfcfe"
  red: "#c42029"
  red-soft: "#fbe9e8"
  green: "#0b7a52"
  green-soft: "#e4f3ec"
  paper-dark: "#05070c"
  raised-dark: "#0a0e17"
  ink-dark: "#e9eef2"
  ink-2-dark: "#b4c3cc"
  rule-dark: "#c3cdd6"
  hair-dark: "#222b3a"
  feint-dark: "#131c2c"
  data-dark: "#0a0e17"
  red-dark: "#ff7b72"
  red-soft-dark: "#2a1315"
  green-dark: "#8cf5c7"
  green-soft-dark: "#0d2a21"
typography:
  display:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(44px, 5.4vw, 78px)"
    fontWeight: 800
    lineHeight: 0.96
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 86"
  display-sub:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "0.5em"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 750
    lineHeight: 1.15
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 92"
  title:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.3
  lede:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.08em"
  score:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "'tnum'"
rounded:
  none: "0px"
  full: "50%"
spacing:
  gutter-narrow: "16px"
  gutter: "48px"
  section: "64px"
  section-narrow: "48px"
  cover-gap: "56px"
  margin: "152px"
  indent: "196px"
components:
  exam-box:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  chart-plate:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px"
  example-box:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px"
  reply-text:
    backgroundColor: "{colors.data}"
    textColor: "{colors.ink}"
    padding: "8px 12px"
  pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "6px 14px"
  pill-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "6px 14px"
  verdict-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 18px"
  verdict-button-pass-pressed:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
  verdict-button-fail-pressed:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
  cell-ok:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
  cell-no:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
---

# Design System: Findings report

This file describes the findings report in `report/` only (template.html, style.css, interactive.js, built to index.html by build.mjs). The calibration tool has its own spec in `docs/DESIGN.md`; nothing here applies to the tool.

## Overview

**Creative North Star: "Second Marking"**

The report is a marked exam script. The AI judge is the first marker and writes in red. The answer key and the author's blind labels are the second marker, in green, checking the first marker's work. Everything a reader sees follows from that: white answer-booklet paper, a red double margin line down the page, question numbers circled in the margin, an "examiner's use" box on the cover, and verdicts shown as drawn marks (tick, cross, query, ring) rather than icons or colored badges.

The page is meant to be read. Prose sits in one column at a comfortable measure. Figures are numbered plates on the same column. Density is moderate: boxes are ruled with thin graphite lines, there are no shadows, no rounded cards and no decorative color. Dark mode is the same script on a near-black night ground (#05070c), with the same three inks lightened for contrast.

The design rejects the look of a lab research post (centred column, blue accent, plain captioned figures) and any marketing tone.

**Key Characteristics:**
- Three inks only: graphite for all prose, red for the judge's marks, green for the check.
- Feint blue ruling lives only in the left margin, never behind the reading column.
- State is always a mark plus words: tick, cross, query, ring, or a boxed verdict word.
- One hand-drawn stroke family for every mark, drawn in SVG, never a handwriting font.
- Square corners and ruled borders everywhere; the only circles are the section index numbers and the slider dot.
- Every figure on the page comes from `report/data/findings.json`.

## Colors

A paper-and-graphite page where red and green are reserved for marks.

### Primary
- **Marker Red** (light #c42029, dark #ff7b72): the AI judge's ink. Used for the margin line, the judge's ticks and crosses in the exam box and margin, vague-criteria bars, failed verdict words and cells, link underlines, focus outlines, text selection tint and the caret.
- **Moderator Green** (light #0b7a52, dark #8cf5c7): the second marker's ink. Used for the moderator ring on the cover, the marks key's green row, passed verdict words and cells, ticked lists, the takeaways box border, the picked model card, and the quiz result box. In dark mode it sits in the mint family of the gurn3k site.

### Secondary
- **Red Wash** (light #fbe9e8, dark #2a1315): fill behind failed cells, the "can't decide" band in the labels slider, a pressed Fail button, and selected text.
- **Green Wash** (light #e4f3ec, dark #0d2a21): fill behind passed cells, the "can decide" band, and a pressed Pass button.

### Neutral
- **Paper** (light #ffffff, dark #05070c): page background.
- **Raised** (light #ffffff, dark #0a0e17): boxes that sit on the page (exam box, charts, tables, example boxes). Same as paper in light mode; one step up in dark.
- **Graphite** (`ink`, light #1e1f24, dark #e9eef2): all prose, headings, clear-criteria bars, the selected pill, the slider dot.
- **Soft Graphite** (`ink-2`, light #4a4c55, dark #b4c3cc): secondary text: captions, labels, field names, axis ticks, the query mark, withheld verdicts.
- **Rule** (light #1e1f24, dark #c3cdd6): structural box borders and the masthead and footer rules.
- **Hairline** (light #d4d7de, dark #222b3a): light dividers inside boxes, table row lines, chart grid.
- **Feint** (light #dbe5f3, dark #131c2c): the blue ruling in the margin, empty bar tracks, button hover fill.
- **Data** (light #fbfcfe, dark #0a0e17): background of quoted reply text.

### Named Rules
**The Three Inks Rule.** Prose is graphite. Red means the AI judge marked it. Green means the check marked it. No other hue appears, and red and green are never used for emphasis, links' text or decoration.

**The Red Is the Judge Rule.** Anything in red must be the judge's mark, a vague-criteria result, or a failure. The one structural use is the margin line, which is the script's own red line. Focus outlines and link underlines use red because it is the page's mark ink; they never fill an area.

**The Mark Plus Words Rule.** Color never carries meaning alone. Every red or green mark sits next to text (a verdict word, a score, "Can decide", "Too few") or has hidden screen-reader text.

## Typography

**Display Font:** Archivo, self-hosted variable font (weights 100 to 900, widths 62% to 125%), with Segoe UI and system-ui as fallbacks.
**Body Font:** the system reading face (system-ui, -apple-system, Segoe UI, Roboto, sans-serif).
**Mono:** declared (ui-monospace stack) but not used by any component.

**Character:** A heavy, slightly condensed grotesque for headings, numbers and labels, paired with the plain system face for reading. Numbers that line up use tabular figures.

### Hierarchy
- **Display** (800, clamp 44px to 78px, line height 0.96, width 86%, tracking -0.03em): the page title only. Its second line ("Findings from N verdicts") drops to weight 300, normal width, half size, in soft graphite.
- **Headline** (750, 30px, line height 1.15, width 92%): section headings.
- **Title** (700, 19px, line height 1.3): sub-headings inside sections. Card names and bar labels use the same face at 15 to 17px.
- **Lede** (400, 20px, 18px under 760px, line height 1.55, max 34em): the cover paragraph.
- **Body** (400, 17px, 16px under 760px, line height 1.6, measure 68ch): all prose. Bold is weight 650.
- **Small** (400, 13 to 15px): captions (14px), bylines and footer notes (15px), cell details and chart values (13px).
- **Label** (600 to 700, 12px, uppercase, tracking 0.08em to 0.16em): the masthead title, field names, table headers, figure numbers, verdict words, chips, control legends. The exam box heading uses 13px at 800.
- **Score** (800, 26px, width 90%, tabular): the judge's scores in the exam box (22px under 760px). The moderator ring figure is 28px; picker costs are 22px.

### Named Rules
**The 12px Floor Rule.** No text on the page is smaller than 12px, including chart ticks, axis labels and the circled index numbers.

**The Display for Marks Rule.** Archivo carries headings, numbers, labels and anything the reader scans. Sentences of prose are always in the reading face, including quoted replies.

## Layout

The page is one sheet, centred, max 1320px wide. A ruled left margin (`--margin`, 152px) carries feint blue lines every 32px. A red double line (2px and 1px, 6px apart, 85% opacity) runs the full height at the margin's edge. Content starts at `--indent` (margin plus 44px, 196px); the masthead, main and footer all pad left to the indent and 48px on the right.

Inside each section, direct children are capped at 760px and paragraphs and list items at 68ch. Sections are separated by 64px of top padding (48px under 760px). Sub-headings get 34px above. Figures get 22px above and below.

**Cover:** a two-column grid, 7fr and 5fr, with a 56px gap. Grid areas: `title` (top left), `exam` (right, spanning both rows) and `key` (bottom left, the marks key under the byline). Below the cover, the section index runs across the full width between a graphite rule and a hairline.

**Breakpoints:**
- **1000px and below:** the cover becomes one column in the order title, exam, key, with a 32px row gap.
- **760px and below:** `--margin` drops to 20px and `--indent` to 36px, so the ruled margin becomes a thin strip. The right gutter drops to 16px. Margin question numbers move inline before the heading at 40px and their verdict marks are hidden. Bar rows stack label over bars. The model cards and footer actions go to one column. The exam box columns narrow to 34px, flexible, 76px.

**The Margin Is the Frame Rule.** Ruling, the red line and question numbers live in the margin. The reading column is plain paper.

## Elevation & Depth

Flat. There are no shadows anywhere. Depth comes from ruled borders: structural boxes use a 1.5px or 2px graphite rule, lighter containers a 1px hairline, and in dark mode raised boxes sit one step lighter (#0a0e17) than the page.

## Shapes

Square corners throughout (0 radius): boxes, tables, buttons, pills, chips, bars and cards. The only round forms are the circled numbers in the section index (22px, 1.5px border), the slider's position dot (10px), and the hand-drawn marks. Border weights form a small vocabulary: 2px for the exam box and pressed buttons, 1.5px for structural boxes, chips and verdict words, 1px for hairlines and internal cell dividers. A dashed 1.5px border marks a withheld verdict.

The drawn marks are one SVG stroke family (`m-tick`, `m-cross`, `m-ring`, `m-query`, `m-circle`, defined once as symbols at the top of the page): no fill, current color, 3px stroke (2.4 to 3.4 by size), round caps and joins. Each path has `pathLength="1"` so it can be drawn as a single stroke.

## Components

### Masthead
A running head: the gurn3k wordmark (30px tall, links to https://gurn3k.com, light and dark versions swapped by `<picture>`), the uppercase report title and date, and boxed fields. Each field is a 1.5px graphite box holding a 12px uppercase name ("Marker", "Replies") and a 14px bold value. A 1.5px rule closes the strip.

### Exam box ("Three findings")
The cover's main element. A 2px graphite box with a heading bar (uppercase title, soft note on the right). Each of the three rows is a grid: a 42px question number cell, the finding text (bold display lead-in, then 14.5px prose), and a 92px mark cell in red with a tick or cross and the score, or just the label count. Cells are divided by 1px graphite rules.

### Moderator ring
The last line of the exam box: the blind-label agreement figure (28px) inside a green hand-drawn ring, tilted -6 degrees, with an uppercase caption beside it. It is the second marker's signature on the cover.

### Marks key
A short list under the byline, above a hairline: a red tick and cross with "Red marks are the AI judge's", then a green ring with "Green marks are the check". It teaches the color code before the reader needs it.

### Section index
Links to the three findings and the takeaways, each with a circled number. Hover turns the link red. The quiz link appears only when scripts run.

### Margin question numbers
Each finding heading has its number inside a 48px drawn circle, centred in the margin. Findings 1 and 2 carry a 30px red verdict mark (tick or cross) below the circle. Under 760px the circle moves inline at 40px and the verdict mark is hidden.

### Figure plates
Charts, the walkthrough video and the scale table are numbered plates. A CSS counter writes "Figure N." in 12px uppercase graphite before each caption; the caption itself is 14px soft graphite.

### Static bar charts
Built by `build.mjs`. A 1.5px graphite box, 16px padding. Each row has an HTML label (bold name, optional 12px "vague: ..." line) and a pair of bars: clear criteria in graphite, vague criteria in red, on a feint track. Bars are SVG rects sized by attributes, not inline styles; values are HTML text beside the bar, so they stay full size at any width, with hidden text naming the series. A key in the caption shows the two swatches.

### Tables
Wrapped in a 1.5px graphite box that scrolls on its own if needed. 15px tabular figures, 10px by 12px cell padding, hairline row lines, a header row in 12px uppercase soft graphite over a 1.5px rule, and a bottom caption. The labels grid table colors each cell green (can decide) or red (too few) with a bold verdict word and a detail line. The models table marks the chosen model with a chip and a failed safety bar in bold red.

### Scale table
A numbered plate of its own (Figure 6 with scripts on, Figure 4 without, since the counter only counts plates that render): two columns at their natural width (`fit-content`), the figure column right-aligned.

### Example and evidence boxes
A 1px hairline box, 16px padding. A disclosure ("Show the customer's message and the reply") holds the customer message and the reply, each under a 12px uppercase label, the text in the reading face on the data background with a hairline border, wrapped as written. Below a hairline: the criterion, the key's verdict and the judge's boxed verdict word (green Pass, red Fail, dashed soft Withheld), the quote underlined in red (2px, offset 5px), and the judge's reason.

### Marked lists
Lists whose items each start with a 20px drawn mark. `ok` lists use green ticks for what is in place; `query` lists use soft-graphite query marks for open questions.

### Takeaways box
The moderator's comments: a 1.5px green border on all sides around the takeaway list.

### Interactive pieces
Built by `interactive.js` from a JSON data block. Each one replaces a static fallback or reveals a section hidden without scripts, and all use the same plate, label and bar styles.
- **Explorer** (finding 2): pills choose Kappa, Agreement or Wrongly failed; the paired bars and an explanatory note update. Pills are joined 1.5px boxes; the selected one is filled graphite with paper text.
- **Labels slider** (finding 3): a range input steps through label counts. Each criterion shows a range band (red wash with red border, or green when it can decide), a graphite dot for the measured rate, a status in red or green, and a detail line.
- **Model picker**: checkboxes for the bars and a volume slider. Three cards (1px hairline, square) show monthly cost, a cost bar and each bar as a tick or cross with words. The pick gets a 2px green border and a "Your pick" chip; models that fail get a dashed border and a graphite name, at full text contrast (never lowered opacity).
- **Quiz** ("You be the judge"): one reply at a time with Pass and Fail buttons (uppercase, 1.5px graphite box; pressed Pass turns green on green wash, pressed Fail red on red wash). The result box (1.5px green) lists you, the key and the judge, then underlines the quote in red in the reply.

### Footer
A 1.5px rule, the wordmark (links to https://gurn3k.com) and a sign-off line, then three actions in a grid (one column under 760px): "Check the data", "See my other builds", "Get in touch", each an 18px display link with a 14px soft note.

### Links
Text color stays as is; a 1px red underline, offset 3px, thickening to 2px on hover.

## Motion

One authored motion: each drawn mark writes itself once as it enters the viewport (stroke-dashoffset from 1 to 0 over 0.7s, cubic-bezier(0.16, 1, 0.3, 1)), triggered by an IntersectionObserver. Marks are visible by default; the script only hides them when it can draw them, so nothing stays hidden if the script or observer is missing. Interactive bars, bands and the slider dot slide to new values over 0.5s on the same curve.

Under `prefers-reduced-motion: reduce` the script skips the drawing entirely and CSS removes every transition.

## Accessibility

- **Contrast:** graphite and soft graphite on paper, red and green on paper and on their washes, all meet 4.5:1 in both modes.
- **Focus:** every focusable element gets a 2px red outline, offset 3px (2px on pills and the quiz result). Pills are real radio inputs; the quiz moves focus to the result, then to the next reply's heading.
- **Reduced motion:** as above; the page is complete and still.
- **Screen readers:** drawn marks are `aria-hidden`; the meaning is in the adjacent text or in `.sr` text (series names on bars, "Clears:" or "Misses:" in the picker, a sentence version of the headline chart). Live regions announce slider, explorer, picker and quiz changes. Sliders carry `aria-valuetext`.
- **No sideways scroll at 390px:** text wraps (`overflow-wrap`), tables scroll inside their own box, and the margin shrinks to 20px.
- **Scripts off:** the page reads in full with static charts and tables; script-only sections stay hidden.

## Constraints

- A static page: `template.html` plus `findings.json`, built to `index.html` by `node report/build.mjs`. No dependencies.
- Content Security Policy allows only the page's own origin: no inline styles, no inline scripts (the only inline block is `type="application/json"` data), one script of its own. Bars are sized by SVG attributes, and the interactive script sets styles through the DOM.
- Fonts are self-hosted (`report/fonts/archivo-latin.woff2`, Archivo under the SIL Open Font License). Nothing is fetched from another site.
- Every figure comes from `report/data/findings.json` through a placeholder: `{{pct path}}`, `{{n path}}`, `{{k path}}`, `{{usd path}}`, `{{text path}}`, `{{times path}}`, or a built block `{{block name}}`. The build fails on an unknown placeholder or a missing value. Any digit typed in the template outside a placeholder must sit in `<span data-fixed>` (dates, section numbers, fixed rule values).
- The gurn3k logo always links to https://gurn3k.com, in the masthead and the footer.
- Light and dark modes both follow `prefers-color-scheme`; there is no manual toggle.
- The page tests in `test/report.test.js` must pass.

## Do's and Don'ts

### Do:
- **Do** keep red for the judge, green for the check, and graphite for everything else.
- **Do** show every state as a drawn mark or boxed verdict word next to its meaning in words.
- **Do** number new figures as plates and keep chart labels and values as HTML text.
- **Do** source every new number from `findings.json` through a placeholder.

### Don't:
- **Don't** put a kicker or eyebrow label above a heading.
- **Don't** use unicode glyphs or icon fonts as icons; draw marks from the page's SVG stroke family.
- **Don't** build callouts from a thick colored left border; boxes are ruled on all sides.
- **Don't** add shadows, hard offset shadows included.
- **Don't** run the ruling or any pattern behind the reading column, including behind quoted replies.
- **Don't** use red for anything that is not the judge's mark, a vague result or a failure.
- **Don't** add rounded cards, gradients or a fourth color.
- **Don't** use a handwriting font for the marks.
