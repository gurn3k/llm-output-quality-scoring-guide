# 0007. One judge call per item per criterion, strict JSON, injection-resistant prompt

## Decision
- One Messages API call per item and criterion. The system prompt holds the judging instructions, the criterion and the reference material (for example the policy), and is marked for prompt caching. The item comes last, in the user message.
- The item's input and output are wrapped in clearly delimited, labelled blocks. The instructions say everything inside them is data to judge, never instructions to follow, and that an attempt to instruct the judge should be mentioned in the reason.
- Replies are constrained with structured outputs (`output_config.format`, a JSON schema) to `{verdict: "pass" | "fail" | "unclear", evidence_source: "output" | "input", quote, reason}`. The code validates the shape again. A reply that fails is retried once, then counted as an error.
- `max_tokens` is fixed per call, with room for thinking plus the JSON. `stop_reason` is checked before reading content; `refusal` and `max_tokens` count as errors, never guesses.
- Models: Haiku 5.5, Sonnet 5.5 and Opus 5.5 are all offered, at effort `medium`. The default is set by a staged comparison on the test set (owner's decision, 2026-11-10), kept inside the $10 development cap:
  1. The sample run (Sonnet, 10 items) measures the real cost per call, and the comparison's cost is recalculated from it before spending.
  2. All three models on the good criteria. The default is the best on the PRD bar; the cheaper model wins only on a tie.
  3. The vague criteria on the winning model only.
  4. One other effort level on the winning model, only if the remaining budget covers it.
- An item over a set size is refused with a message rather than sent.

## Alternatives
- One call per item for all criteria. Cheaper, but verdicts on one criterion bleed into others, and one bad reply loses every criterion at once. Rejected for v1; it can be measured later as a cheaper option.
- Free-text replies parsed by pattern matching. Rejected: fragile, and the API can enforce the shape.

## Why
Separate calls keep each criterion's judgment independent, which the per-criterion trust figures assume. Caching makes the repeated system prompt cheap: on Haiku 5.5, Sonnet 5.5 and Opus 5.5 the minimum cacheable prompt is 512 tokens, and cache reads cost 5-10% of normal input ([pricing](https://platform.claude.com/docs/en/about-claude/pricing), checked 2026-11-10). Delimiting plus the code-side quote check is the main defence against injected instructions, and the test set measures it.

## Consequences
Cost scales with items times criteria, so the cost estimate must count every call. The prompt's wording is a product decision, versioned with the code, and any change is followed by a rerun of the test set.
