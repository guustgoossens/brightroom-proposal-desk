# Demo narration (synthetic voice: Samantha). Re-record in your own voice if you prefer.

## 1. s0-title (~10 s)

This is the BrightRoom proposal desk, our solution for case two: turning a client enquiry into a feasible draft proposal, or into the questions needed before one can be made.

## 2. s1-problem (~24 s)

The user is a BrightRoom salesperson. Today they clarify the brief, check the catalogue, do the sums and write the proposal by hand. It repeats, but every enquiry has different constraints, and a persuasive proposal is only useful if the package actually fits. Our value target is a first proposal in seconds instead of minutes, with correct totals, and a clear warning before an infeasible proposal can go out.

## 3. s2-solution (~26 s)

We built a small application with three lanes. Claude Sonnet sub-agents read the enquiry, write the draft and audit it. Jev, a typed decision model from TypeSafe, gives fast probabilistic judgments, like whether the enquiry is complete. And plain code does everything that must be exact: pricing, constraints, alternatives and the total check. The language model never computes money. A human stays in the chain: nothing is sent or booked.

## 4. s3a-routine (~16 s)

First a routine case. Q3: ten people, four hours, wheelchair access, coffee and a projector, six hundred euros. I press play and run it live. Claude extracts the brief, Jev triages in about half a second, and the code prices it.

## 5. s3b-routine (~21 s)

The banner says ready. Only the Loft is wheelchair accessible, so the package is the Loft, coffee for ten and a projector: five hundred thirty-five euros, recomputed independently by code. The draft email beside it is a proposal for the salesperson to approve, it states that availability is unconfirmed, and a code check and an LLM auditor have both passed it.

## 6. s4a-hard (~9 s)

Now a difficult case. Q2: twenty people, coffee and lunch both required, a budget of eight hundred fifty euros. Run it live.

## 7. s4b-hard (~23 s)

The banner turns red before anyone reads the draft: the package costs nine hundred forty euros, ninety over budget. The system does not quietly drop something to make the numbers work. It shows alternatives, each with its trade-off: keep everything and cut to sixteen people, or drop the coffee, or drop the lunch. Jev recommends one and shows its confidence, but the salesperson decides.

## 8. s4c-approve (~10 s)

Approval is disabled until an alternative is chosen. I choose one, and only then can the draft be approved. Approval only marks it locally. Nothing is sent.

## 9. s4d-jev (~12 s)

Under the hood, this tab puts Jev next to Claude: triage probabilities, which services are hard requirements, and where the two agree or differ. A difference is a signal for the salesperson to look closer.

## 10. s5a-missing (~7 s)

Missing information. Q4 only says: can you organise a team workshop next month, send me your best offer.

## 11. s5b-missing (~20 s)

The system does not guess a headcount. It asks what it needs, and the draft contains questions only, with no prices. Q5 asks for thirty people for six hours and to confirm today. That is infeasible on both capacity and duration, Jev flags the commitment pressure at ninety-six percent, and the draft says plainly that nothing can be confirmed.

## 12. s6-tests (~47 s)

We ran eighteen cases: the five from the brief plus thirteen variations, including exact capacity boundaries, a discount demand, a request to book a date, and a prompt-injection attempt. The pipeline passes 18 of 18 against our expected results. A single prompt with the same catalogue passes 14 of 18, failing where it should have asked questions or declined. Read that carefully: our baseline scoring is lenient, the expected values are ours, each case ran once, and we fixed one extractor prompt after a failure, so that case is not a clean held-out test. Re-running also showed variance: once, on the prompt-injection case, the extractor treated coffee as optional and the total came out wrong. We tightened the rule and it now holds across three re-runs.

## 13. s7-honest (~33 s)

Two honest notes about the components. The code check blocked the writer's first draft in eight of eighteen runs, mostly over-cautious phrasing, with one real catch: a price inside a clarification email. Jev's triage agreed with the engine in all eighteen cases. And in that coffee case, Jev flagged an eighty-five percent hard requirement against the language model's optional, so the desk now shows that disagreement as a warning on the main screen. That makes Jev a useful cross-check, but we have not shown that it improves accuracy, and its alternative pick is unvalidated.

## 14. s8-limits (~18 s)

Limitations: manual preparation time is our estimate of ten to fifteen minutes, not a measurement, and token cost was not measured. Next improvement: a fresh held-out set of enquiries, catalogue identifiers on every line so sources are visible, and timing a real salesperson. Thank you.
