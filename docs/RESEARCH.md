# Research summary

First pass, 2026-11-10. Sources are linked inline.

## 1. Existing tools: how is this different?

| Tool | Calibrates a judge against your labels? | Free, no sign-up, nothing to install? | Notes |
|---|---|---|---|
| [LangSmith Align Evaluator](https://docs.langchain.com/langsmith/improve-judge-evaluator-feedback) | Yes: label examples, run the judge, see an "alignment score", edit the prompt, rerun | No: LangSmith account, data must be a LangSmith dataset or traces | Alignment score is raw % agreement. Docs suggest 20+ labels balanced between 0 and 1. Launched boolean-only, one criterion per evaluator ([announcement](https://forum.langchain.com/t/introducing-align-evals-streamlining-llm-application-evaluation/817)). |
| [Braintrust](https://www.braintrust.dev/articles/human-in-the-loop-evals-for-llm-apps) | Yes, as a workflow: human and judge scores side by side per row, track agreement | No: account | No published agreement statistics built in, as far as found. |
| [ChainForge + EvalGen](https://arxiv.org/abs/2404.12272) | Yes: grade a subset thumbs up/down, it picks evaluators that match | Partly: open source; hosted web version is [limited](https://chainforge.ai/play/) and EvalGen there is unconfirmed | Research tool, visual node editor, developer-oriented. Its paper names **criteria drift**: people's criteria change as they grade, so criteria can't be fixed before grading. |
| [Kalibra](https://github.com/LibreGuild/kalibra) | Says so ("against your own labels"); no metrics shown | Local `npx`, no account | Broad dev eval suite, 1 star. |
| [llm-judge-calibrator](https://github.com/0xelitesystem/llm-judge-calibrator) | No judge: you paste a confusion matrix | Yes, hosted, browser-only | Gives a corrected pass rate with a confidence interval (prediction-powered inference) and refuses when the sample isn't random. A good idea to borrow. 0 stars. |
| Others (evalproof, JevLab, llm-judge-toolkit, matthews-wong/llm-judge-calibration) | Yes | No: Python/CLI/local installs | Developer libraries. |

**Answer:** calibrating a judge against human labels is a known practice, and paid platforms (LangSmith, Braintrust) support it. No tool found does the whole loop in a free hosted page with no sign-up: load outputs, write a rubric, label, calibrate with chance-corrected agreement and its uncertainty, then score with verified quotes. The difference is access and honesty, not a new idea:
- no account, no install, data stays in the browser;
- written for PMs, not engineers;
- agreement shown with chance correction (Cohen's kappa) and a range, not only raw %;
- every score's quote checked against the output.

Kill criterion 1 (a free tool already does this as simply) is **not met**.

## 2. How many labels are enough?

Rough 95% margins for a judge that agrees 85% of the time on a balanced pass/fail criterion (kappa about 0.70):

| Labels | Agreement | Kappa |
|---|---|---|
| 15 | ±18 pts | ±0.36 |
| 20 | ±16 pts | ±0.31 |
| 30 | ±13 pts | ±0.26 |
| 40 | ±11 pts | ±0.22 |
| 60 | ±9 pts | ±0.18 |

At 15-20 labels the kappa range covers "poor" to "excellent", so it can't support a decision. Guides suggest 30-50 labels and a kappa of about 0.6 as the bar for trusting a judge ([example guide](https://tonyx1998.github.io/modern-ai-engineer-guide/docs/evaluation/eval-llm-as-judge)). Kill criterion 2 is **partly met** for the planned 15-20. Response: default to 30-40 labels, always show the range, and say plainly when the range is too wide to decide.

## 3. What goes wrong with model judges

- Agreement with people varies widely by model and task. One rubric-grading study reports 75% agreement (kappa 0.44) for the best judge and kappa 0.08 for another ([survey](https://arxiv.org/pdf/2411.15594)). It has to be measured per rubric, not assumed.
- Human-to-model agreement is usually below human-to-human agreement ([LLM-Rubric](https://arxiv.org/html/2501.00274v1)).
- Criteria drift (EvalGen paper above): the rubric changes as you grade, so the tool should make rubric edits and re-labelling cheap and keep versions.
- Tuning the judge prompt on the same labels it's measured on overstates agreement. Hold back part of the labels for the final check (LangSmith's own advice, [LangChain](https://www.langchain.com/resources/llm-as-a-judge)).

## 4. Platform and terms

- **Browser calls:** the Anthropic API accepts calls from a web page when the request carries the `anthropic-dangerous-direct-browser-access: true` header ([announcement](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access)). The key is visible to the browser it's typed into, so the page must hold no third-party scripts, keep the key in memory unless the visitor opts in, and render all outputs as text.
- **Terms:** Anthropic's [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) make the key holder responsible for all activity and fees on their account, and allow using the API to power products for end users. No explicit bring-your-own-key policy was found. Anthropic's help centre advises care before giving a key to third-party tools, so the page must explain where the key goes (only to api.anthropic.com) and let people check it.
- **Prices** (checked 2026-11-10, [pricing](https://platform.claude.com/docs/en/about-claude/pricing)), per million tokens in/out: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20. One judgment of a support reply (about 1,500 tokens in, 400 out) costs roughly $0.0004 on Haiku, $0.007 on Sonnet, $0.014 on Opus, so a 60-item run on Sonnet costs about $0.40.
- **Structured output:** the API can constrain replies to a JSON schema (`output_config.format`), so the judge's reply shape is enforced by the API as well as checked in code.

## 5. Who has the problem, and how they judge quality today (second pass, 2026-11-10)

- **PMs are being told to own evals.** Guides now frame evals as a product decision, not an engineering one ([Amplitude](https://amplitude.com/blog/ai-evals-for-product-managers), [The PM Transition](https://thepmtransition.substack.com/p/ai-evals-for-product-managers-from)). The common split: code checks for rules, people for judgment calls, model judges for scale, with model judges "calibrated against human reviews". No survey of how PMs actually do this was found; the sources are guides and vendor pages.
- **Practitioner advice, from Hamel Husain's [LLM-judge guide](https://hamel.dev/blog/posts/llm-judge/):**
  - Pass/fail, not 1-5 scales. He treats a set of 1-5 metrics as a warning sign.
  - One principal domain expert defines what "good" means, and writes a short critique with each verdict. Critiques can become examples for the judge.
  - Raw agreement misleads when failures are rare. Report the judge's true-positive and true-negative rates separately.
  - Split labels into tuning, dev and test sets; run the frozen judge on the test set once.
  - Start with about 30 examples; below about 60, confidence intervals are often too wide. Validating a judge properly can take about 100 labels per failure mode.
- **Support replies specifically:** accuracy and policy grounding should outrank tone, and escalation deserves its own criterion ([Lorikeet](https://www.lorikeetcx.ai/articles/ai-ticket-quality-scoring-guide), [Kommunicate](https://www.kommunicate.io/blog/hallucinations-in-customer-support-prevention/)). "Policy fabrication" (inventing a refund rule) is a named failure. A rubric that asks "is it accurate?" without the governing policy invites opinion, so the demo needs a short policy sheet the judge can check against. Research benchmarks build rubric items from a service policy the same way ([arXiv 2510.22143](https://arxiv.org/pdf/2510.22143)).

**What this changes:**
- The target user is a PM acting as the principal domain expert for their feature. The product's job is to turn their judgment into a judge they can measure.
- Pass/fail per criterion fits both the practitioner advice and the agreement maths better than 1-5.
- Plain-language rates ("caught 9 of 10 failures you marked; passed 18 of 20 replies you passed") fit PMs better than kappa alone.
- The demo's support task ships with a policy sheet (refund window, escalation rules) so accuracy can be judged.

## 6. What this research does not show

- Whether PMs (rather than ML engineers) want this. No user interviews were done; the README will say so.
- Whether LangSmith's alignment now supports categorical scores or chance-corrected statistics (docs didn't say).
- Whether EvalGen works in ChainForge's hosted version.
- An explicit Anthropic statement on bring-your-own-key web apps.
