# 0011. Save the project on this device; withhold rather than guess

## Decision
- **Storage:** the project (rows, criteria versions, labels, split, verdicts) is saved automatically in this browser's local storage, so a reload doesn't lose 40 labels. "Download project" and "Open project" use a JSON file, and "Clear everything" erases it. The key is stored separately and only on opt-in (ADR 0005). Every storage access is guarded, so the page still works where storage is blocked, with a notice that work won't survive a reload.
- **Error trade-off:** when unsure, show less. A verdict without a found quote, an `unclear`, a refusal or a malformed reply is withheld and counted, never shown as pass or fail. The judge's instructions prefer `unclear` to a guess.

## Alternatives
- No persistence. Rejected: labelling 30-40 items is real work, and a reload would lose it.
- IndexedDB. Not needed: 500 rows fit comfortably in local storage, and the simpler API is easier to test.
- Preferring a verdict over `unclear` to shorten the review pile. Rejected: a wrong verdict presented with evidence breaks the guarantee, while a longer review pile only costs time.

## Why
The user's data stays on their device either way (ADR 0001). The withholding rule is the guarantee applied to every failure path.

## Consequences
Pass rates are computed over fewer items when much is withheld, so the page makes the withheld count prominent; a high withholding rate can't hide.
