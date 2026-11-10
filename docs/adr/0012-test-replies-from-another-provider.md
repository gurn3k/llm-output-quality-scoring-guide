# 0012. The test set's clean replies come from an OpenAI model

## Decision
- The customer messages and support replies in the test set are written by an OpenAI model, from the fictional company's policy and a hand-written scenario for each item. Each flawed item's scenario names its one flaw. Every item is then read and checked by hand against the policy before it goes into the answer key, and hand edits are recorded in the key.
- The scenarios, flaws, injections and answer key are written by hand, so every known answer is exact.
- The product itself stays Anthropic-only in version 1 (PRD, out of scope). OpenAI is used only to make test data, from a script run on the owner's machine. The OpenAI key lives in `.env.local`, which git ignores, and is never in the page.
- Generation has its own cap, set and approved before the run. A run of this size is expected to cost well under $1.

## Alternatives
- Write all replies by hand, or with an Anthropic model. Rejected: model judges tend to rate text from their own model family more kindly (self-preference bias). That would make the judges look better on our test set than on a real team's outputs.
- Use OpenAI models as judges too, or support OpenAI keys in the product. Deferred to version 2 by the owner, 2026-11-10: it roughly doubles the API surface to keep correct.

## Why
A judge in real use mostly grades text another system wrote. The test set should match that.

## Consequences
- A second provider's terms apply to the generation step. Checked 2026-11-10: OpenAI's terms forbid using output "to develop models that compete with OpenAI" ([terms](https://www.openai.com/terms)); generating evaluation data for judges isn't that.
- What was used: `gpt-6.1-terra` ($1 in / $5 out per million tokens, [pricing](https://developers.openai.com/api/docs/pricing), checked 2026-11-10), with a $1 cap enforced per call on worst-case cost. All 56 items, flawed ones included, came from the same model, so the judge can't tell clean from flawed by writing style. Actual spend: $0.14.
- The generated replies can't be regenerated exactly. The files are kept as written, with the model name and date recorded.
- If a clean reply turns out to break the policy, it's either fixed by hand or retagged as a failure, and the change is noted in the answer key.
