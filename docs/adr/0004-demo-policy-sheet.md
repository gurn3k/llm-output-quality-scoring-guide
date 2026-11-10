# 0004. The demo ships with a fictional support policy

## Decision
The demo task (customer support replies) comes with a one-page policy for a made-up company: refund window, what agents may promise, when to escalate. The judge and the human labeller both check replies against it. Users can paste their own reference material into the same slot.

## Alternatives
- Judge without a policy. Rejected: "is it accurate?" then becomes opinion for both the judge and the labeller.
- Use a real company's policy. Rejected: impersonation and terms risk, and it can change.

## Why
Support-quality sources (`docs/RESEARCH.md` section 5) rank accuracy and policy grounding above tone, and name "policy fabrication" as a common failure. Planting replies that break a written policy gives the test set unambiguous known answers.

## Consequences
The policy text goes into every judge call, so each call costs a little more. The company and policy must be clearly fictional, so the demo isn't mistaken for a real business's rules.
