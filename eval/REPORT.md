# Measurement report

Measured 2026-11-11 on the test set in `eval/testset/`: support replies for Sofa So Good, a fictional shop, judged against its written policy. Every figure below is a count out of a count, from the run files in `eval/runs/`. `node eval/report.mjs` reproduces them for free.

## What was run

- **Model comparison:** the original 60 replies (20 clean, 36 with one planted failure each, 4 injections) × the 4 good criteria, on Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5. That's 240 calls per model, at medium effort with judging instructions version 2.
- **Vague criteria:** the same 60 replies × 4 deliberately vague criteria ("The reply is accurate", "The reply is helpful", and so on), on the chosen model.
- A pair is one reply judged on one criterion. "Caught" means the judge showed `fail` where the answer key says fail. An unclear verdict, a withheld one or an error counts as not caught. Injections are left out of both rates and used only to check for flips.
- The 10 replies used in the earlier sample run helped sharpen the criteria, so each rate is also given with them left out.

## Bars

| Bar | Target | Measured | Result |
|---|---|---|---|
| Good criteria, default model | Catches ≥ 80% of planted failures; passes ≥ 85% of clean replies | Sonnet: 34 of 36 caught (94%, range 82–98%); 80 of 80 clean passed (100%, range 95–100%). Sample-run replies left out: 27 of 28, 76 of 76 | **Pass** |
| Vague criteria, as first written | Catch rate at least 20 points lower | 36 of 36 caught (100%) | **Missed** (see below) |
| Vague criteria, replacement bar (2026-11-11) | Agreement with the key at least 15 points lower, and kappa below 0.6 | 96% to 77% (19 points lower); kappa 0.87 to 0.46 | **Pass** on these 60, and on the 160 replies judged after the bar was fixed: 94.0% to 60.5% (33.5 points lower), kappa 0.85 to 0.31 |
| Evidence | 100% of shown scores have a quote found in the text | Enforced in code and tested. Sonnet: 0 of 240 withheld; Haiku: 2 withheld (shown as withheld, never as a score) | **Pass** |
| Injection | 0 verdicts changed by a planted instruction | Sonnet 0 of 16; Opus 0 of 16; Haiku 2 of 16 | **Pass** for the default |
| Owner's blind labels vs the answer key | Reported as measured | 116 of 120 (96.7%), kappa 0.90 | Measured (see below) |
| Judge model | All three compared on the same bar; best wins, cheaper only on a tie | See below | Sonnet 5.5 |
| Cost | Measured within 50% of the estimate; cap never exceeded | Sonnet +2%, Opus +19%, Haiku +27% against the page's own estimate; no stage or run cap exceeded | **Pass** |
| Demo | Two people new to it finish in under 2 minutes | Not yet run | **Open** |

## Choosing the default model

The rule was set before reading any results: a model must meet the bar, the highest balanced score (the mean of the two rates) wins, and a cheaper model wins only on a tie. A tie means within one pair on both caught and clean passed.

| Model | Caught | Clean passed | Injection flips | Agreement with the key, all pairs | Cost per reply (4 criteria) |
|---|---|---|---|---|---|
| Haiku 5.5 | 36 of 36 | 78 of 80 | **2 of 16** | 210 of 216 (97%), kappa 0.91 | $0.0006 |
| Sonnet 5.5 | 34 of 36 | 80 of 80 | 0 of 16 | 213 of 221 (96%), kappa 0.87 | $0.008 |
| Opus 5.5 | 35 of 36 | 80 of 80 | 0 of 16 | 219 of 224 (98%), kappa 0.92 | $0.019 |

- **Haiku is out on the injection bar.** On two injected replies, its "Escalates" verdict moved from unclear to pass. The rule as first written covered only the two rates. The injection bar was added once Haiku's run showed the flips, because the product compares models on the same bar.
- **Sonnet and Opus tie** (34 vs 35 caught, 80 vs 80 clean), so Sonnet, the cheaper, is the default. On agreement across every pair Opus is a little ahead (kappa 0.92 against 0.87). Sonnet more often fails a flawed reply on a second criterion: 7 pairs against Opus's 4.
- **Misses:** both Sonnet misses are tone. t02 says "because you chose standard shipping", mild blame Sonnet read as neutral, as it did in the sample run. t04 is curt, with no greeting or apology; Sonnet said unclear and Opus passed it.

## Vague criteria

The bar expected vague criteria to catch fewer planted failures. They caught all of them. What they lose is precision: they fail replies for flaws that belong to other criteria.

| | Good criteria | Vague criteria |
|---|---|---|
| Planted failures caught | 34 of 36 | 36 of 36 |
| Flawed replies passed on their *other* criteria | 99 of 108 | 55 of 108 |
| Agreement with the key, all pairs | 213 of 221 (96%), kappa 0.87 | 171 of 223 (77%), kappa 0.46 |
| Lowest criterion | Accurate, kappa 0.77 | "Handles the situation", 36 of 56 (64%), kappa 0.30 |

So a vague rubric does show clearly lower agreement, which is what the page measures and shows. Catch rate alone was the wrong measure for this bar. A judge that fails every reply catches every planted failure, so catch rate rewards exactly the failure mode vague criteria produce.

**The bar was replaced, not quietly rewritten.** The original bar and its miss stay in this report. The replacement, at least 15 points lower agreement and kappa below 0.6, counts false alarms as well as misses. It was written after these 60 replies were judged, so passing here proves little. It was fixed *before* the other 160 replies in the test set were judged, and its real test is those 160. Vague tone ("The tone is good") held up well (kappa 0.88), since tone needs little definition. One vague verdict flipped under injection (i02, tone: pass to unclear).

## The other 160 replies (judged for the demo)

The rest of the test set, 160 replies, was judged on Sonnet 5.5 with both criteria sets after the replacement bar was fixed. These replies took no part in choosing the model or setting any bar.

| | Good criteria | Vague criteria |
|---|---|---|
| Planted failures caught | 155 of 160 | 157 of 160 |
| Agreement with the key | 594 of 632 (94.0%), kappa 0.85 | 375 of 620 (60.5%), kappa 0.31 |
| Failed where the key passes | 34 | 245 |
| Unclear or withheld | 8 of 640 | 20 of 640 |

- **The good criteria hold up on new replies.** The weak spot is again Accurate, with kappa 0.69 and 22 over-fails. Most of these are replies that keep an escalation case to themselves and are also failed on Accurate, the overlap described below.
- **Vague criteria fall apart further on the larger set.** "Handles the situation" reaches kappa 0.09, close to chance.

**The demo, fully labelled.** On its held-back third, the good criteria catch 16 of 16 (Accurate), 20 of 20 (Answers), 17 of 17 (Escalates) and 11 of 12 (Tone). The first three can be trusted outright. Tone's caught range is 34 points wide (65–99%), so it can be trusted only on thin evidence, marked as such.

## The owner's blind labels against the answer key

The owner labelled 30 replies drawn at random from the 216 non-injection replies, without seeing the answer key, the planted flaws or the judge's verdicts. The page showed only neutral ids (R01–R30) and each criterion's definition, with the policy beside it. 27 of the 30 replies carry one planted flaw and 3 are clean, which mirrors the test set.

| | Agreement |
|---|---|
| All 120 labels | 116 of 120 (96.7%), kappa 0.90 |
| Accurate | 29 of 30 |
| Answers the question | 27 of 30 |
| Escalates when required | 30 of 30 |
| Appropriate tone | 30 of 30 |
| Planted failures the owner also failed | 24 of 27 |
| Key passes the owner failed | 1 of 93 |
| Owner against the judge (Sonnet 5.5) | 108 of 117 decided pairs |

All four disagreements are about replies that respond to something but not to the question asked. One reply explains the warranty when asked whether a used kettle can be returned (q10). Another gives return conditions but never the 30-day window (q15). The owner passed both on "Answers the question"; the key fails them. In the third case, a reply gives shipping times when asked about a clearance exchange (q19). The owner failed it on Accurate rather than on Answers. The judge sided with the key on all four. By the criterion as written ("directly addresses everything the customer asked"), the key holds. But the line between "Accurate" and "Answers" is as easy for a person to draw differently as it is for a judge. This is the same overlap seen in the runs, and the reason the page asks people to write criteria that judge one thing each.

## Answer-key corrections found by the runs

- **c09** (clean): the reply asked the customer for the tracking status and gave no next step or time, so it failed "Answers the question" under the same standard used everywhere else. Haiku and Opus failed it. The reply was edited, and c09 re-judged on all three models; the first verdicts are kept in each run file under `rejudged`.
- **e02** (found by the sample run): the same slip, edited earlier.

## Known limits seen in these runs

- **The criteria still overlap at the edges.** A reply that wrongly keeps an escalation case to itself is sometimes also failed on Accurate or Answers, with reasons a person could defend. For example, e05 tells a customer to keep testing a lamp that sparked. The criteria weren't tuned further against this test set, so the figures stay honest.
- **The worst-case reservation is far above real cost.** At a 4,000-token output limit, one Sonnet call reserves up to about $0.09, while real calls cost about $0.002. A small cap therefore pauses well before it is spent. That's safe, but worth knowing.
- One person wrote the answer key. The owner's blind labels check it (below).

## Spend

| | Spent |
|---|---|
| Sample run, 3 runs | $0.26 |
| Model comparison and vague criteria | $2.18 |
| The other 160 replies, both criteria sets (demo results) | $2.43 |
| **Judge spend so far** | **$4.87 of the $10 cap** |
| Writing the test set (OpenAI, separate cap) | $0.54 of $1 |
