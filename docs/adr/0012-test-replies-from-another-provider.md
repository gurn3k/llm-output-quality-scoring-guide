# 0012. The test set's clean replies come from an OpenAI model

## Decision
- The clean (control) support replies in the test set are written by an OpenAI model, from the fictional company's policy and each customer message. They're then read and checked by hand against the policy before they go into the answer key.
- Planted failures and the answer key are written by hand, so every known answer is exact.
- The product itself stays Anthropic-only in version 1 (PRD, out of scope). OpenAI is used only to make test data, from a script run on the owner's machine. The OpenAI key lives in `.env.local`, which git ignores, and is never in the page.
- Generation has its own cap, set and approved before the run. A run of this size is expected to cost well under $1.

## Alternatives
- Write all replies by hand, or with an Anthropic model. Rejected: model judges tend to rate text from their own model family more kindly (self-preference bias). That would make the judges look better on our test set than on a real team's outputs.
- Use OpenAI models as judges too, or support OpenAI keys in the product. Deferred to version 2 by the owner, 2026-11-10: it roughly doubles the API surface to keep correct.

## Why
A judge in real use mostly grades text another system wrote. The test set should match that.

## Consequences
- A second provider's terms apply to the generation step. Check OpenAI's usage terms before the run; generating evaluation data is the intended use, not training a competing model.
- The generated replies can't be regenerated exactly. The files are kept as written, with the model name and date recorded.
- If a clean reply turns out to break the policy, it's either fixed by hand or retagged as a failure, and the change is noted in the answer key.
