# BrightRoom Proposal Desk

MSc DSAIB Case 02: from a client enquiry to a feasible, **draft** proposal (or the clarification needed first).
Convex (local) + Claude Sonnet 5.5 sub-agents + TypeSafe Jev + a deterministic pricing engine. UI styled from Pacium's Figma tokens.

## Design rationale
- **5A form:** Application (a small purpose-built web app) with an agentic back end (sub-agents). Complexity is justified by the failure mode in the brief: a persuasive proposal that is infeasible. A single prompt cannot guarantee totals or constraints, so the money and limits are code.
- **Three lanes, each doing what it is best at**
  | Lane | Does | Why |
  |---|---|---|
  | **LLM** (Claude Sonnet sub-agents: extractor, writer, auditor) | read messy text into a structured brief, write the email, review it | language understanding and tone |
  | **Jev** (TypeSafe `jev-1.13.0`, ~0.5 s) | typed probabilistic judgments: triage (complete / provisional / needs clarification), commitment pressure ("confirm today"), is-each-service-a-hard-requirement, which alternative fits the client | fast, typed, calibrated answers with probabilities used as a second opinion and for gating (agreement panel flags LLM vs Jev disagreements) |
  | **Code** (`convex/lib/engine.ts`, `verify.ts`) | catalogue pricing, capacity/duration/accessibility/budget checks, alternatives, total recomputation, draft guard | exact, testable, never hallucinates |
- **Ask vs provisional (rule in code):** headcount missing -> ask (no price without guessing). Anything else missing (duration, budget, services) -> provisional with *labelled assumptions*. Unstated accessibility keeps the case ready but is flagged, because the Studio is stairs-only.
- **Infeasibility is visible before sending:** a red/amber/blue/green banner sits above the draft; the Approve button is disabled for infeasible and clarification-only runs unless an alternative is chosen.
- **Alternatives:** each relaxes named must-haves with explicit trade-offs; accessibility is never offered as a trade-off; nothing is applied silently.
- **Human responsibilities:** the salesperson approves and sends. Nothing is ever sent or booked; availability, dates, discounts and unlisted services are never promised.
- **EDGE target:** *Efficiency* (first proposal in seconds) and *Decisions* (infeasibility and trade-offs surfaced).
- **Baseline:** one single prompt with the catalogue (no code, no Jev), runnable from the UI ("Try single prompt") for the same enquiry.

## Reproduce
```bash
bun install
bunx convex dev                       # local deployment on 127.0.0.1:3210 (first run: login + local deployment)
bunx convex env set ANTHROPIC_API_KEY <key>
bunx convex env set TYPESAFE_API_KEY  <key>      # TypeSafe direct (Jev)
bunx vite --port 5173                 # open http://localhost:5173
bun test                              # engine + draft-guard tests (36)
```
In the UI: "Load starter cases" (reads `data/cases.json`, 18 cases) or "Import JSON" with your own `[{label,text,tags?,expectedStatus?,expectedTotal?,note?}]`, or type an enquiry. Click an enquiry in the rail to run it (or "Run again"); on the Evaluation tab, "Run all" / "Run all as single prompt" fills the results table. Open any row to watch it live. `bunx convex run jev:probe '{}'` checks the Jev connection.

Tool/model details: `claude-sonnet-5-5` (override `ANTHROPIC_MODEL`), Jev `jev-latest` via `@typesafe-ai/sdk`. Test evidence: `docs/TESTING.md`.
Group member / contributions: _fill in names_. Built with Claude Code and parallel Sonnet sub-agents (backend, frontend, tests).
