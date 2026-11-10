# 0008. Quotes must match exactly after light normalisation

## Decision
A quote counts as found when, after normalising both texts, it appears as a substring of the reply (or of the input, when `evidence_source` is "input").

Normalising means: Unicode NFC, curly quotes and apostrophes made straight, dashes made hyphens, runs of whitespace made one space, and case folded.

A quote containing "..." is split there, and every part must be found, in order. Each part must be at least 3 words long, or the whole text if that is shorter. There is no fuzzy matching.

## Alternatives
- Fuzzy match at a similarity threshold (an earlier project used 90%). Rejected here: a judge that slightly rewrites a sentence can change its meaning, and fuzzy matching would let that pass. The quote is the user's evidence, so it must be the reply's own words.
- Exact byte match. Rejected: harmless differences (curly quotes, line breaks) would withhold correct scores.

## Why
The guarantee says every shown score has a quote the code found in the text. The check must be strict enough that "found" means the words are really there.

## Consequences
Some correct verdicts will be withheld because the judge paraphrased. The withheld count is shown, and the test set measures how often it happens. If it's high, the prompt changes (asking for exact copying); the matcher isn't loosened.
