# BrightRoom: build contract (read before touching code)

Goal: enquiry text -> structured brief + draft proposal (or clarification email) for **salesperson approval**.
Hackathon deliverable (MSc DSAIB Case 02). Keep it simple, honest, beautiful. Do NOT over-engineer.

## Three lanes (this is what the demo must make visible)
| Lane | Who | Does |
|---|---|---|
| **LLM**  | Claude Sonnet (`claude-sonnet-5-5`) sub-agents | extract the brief, write the draft, audit the draft |
| **Jev**  | TypeSafe Jev (typed decision API) | fast typed judgments with probabilities: triage, pressure, hardness of each service, alternative pick |
| **Code** | `convex/lib/engine.ts` (DONE, do not change semantics) | catalogue pricing, constraints, alternatives, total verification |

Rule: LLM never computes money. Writer gets engine output as facts; deterministic `verifyDraft` rejects invented numbers.

## Files already written (do not rewrite; import them)
- `convex/lib/catalogue.ts`  catalogue + `eur()`
- `convex/lib/types.ts`      `Brief`, `EngineResult`, `Package`, `Alternative`, `Status`, ...
- `convex/lib/engine.ts`     `evaluate(brief): EngineResult`, `verifyPackage`
- `convex/schema.ts`         tables `cases`, `runs` (see comments)
Convex runs LOCALLY (http://127.0.0.1:3210, `.env.local` already configured; `bunx convex dev` is run by the lead).
Use **bun**, never npm/pnpm. Do not commit anything. Do not read .env files.

## Env vars (Convex deployment env, read via `process.env` in actions)
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `JEV_API_KEY`, `JEV_BASE_URL`, `JEV_MODEL`.
Keys may be MISSING right now: every external call must degrade gracefully (step status `"skipped"`, summary "no key configured")
and the engine lane must still work if the Brief can't be extracted (then run ends `error` with a clear message).

## Run document (convex/schema.ts `runs`) payload shapes
- `brief`: `Brief` (types.ts)
- `jev`: `JevResult`:
  ```ts
  { model: string; latencyMs: number;
    triage:   { choice: "complete" | "provisional_ok" | "needs_clarification"; confidence: number; probs?: Record<string, number> };
    pressure: { probability: number };               // does client demand an immediate commitment ("confirm today")?
    hardness: Record<"S1"|"S2"|"S3"|"S4"|"wheelchair", { probability: number }>; // is X a hard requirement (not a nice-to-have)?
    pick?:    { altId: string; confidence: number; probs?: Record<string, number> }; // which engine alternative best fits client priorities
    agreement: { field: string; llm: string; jev: string; agrees: boolean }[]; // computed in code: LLM brief vs Jev (e.g. need=required but hardness p<0.5 => disagree)
  }
  ```
- `engine`: `EngineResult`
- `draft`: `{ kind: "proposal" | "clarification" | "explanation"; subject: string; body: string }` (plain text email, salesperson-approval wording, ends with the DRAFT notice)
- `audit`: `{ passed: boolean; issues: { source: "code" | "llm"; severity: "block" | "warn"; message: string }[]; revised: boolean }`
- `baseline` (mode baseline): `{ text: string; claimedTotal: number | null; claimedFeasible: boolean | null }` single-prompt answer, no catalogue code.

## Public Convex API the frontend relies on (backend agent implements EXACTLY these names)
- `runs.list` query `{}` -> latest 100 runs (desc createdAt), `runs.get` query `{id}` -> run | null
- `runs.start` mutation `{ label: string, text: string, mode?: "pipeline"|"baseline", caseId?: Id<"cases"> }` -> Id<"runs">; schedules internal action `pipeline.run` (or `pipeline.runBaseline`)
- `runs.approve` NOT needed (approval is UI-local state; nothing is ever sent)
- `cases.list` query `{}`; `cases.add` mutation `{label,text,tags?,expectedStatus?,expectedTotal?,note?}`; `cases.importJson` mutation `{ cases: Array<same> }` (upsert by label); `cases.remove` mutation `{id}`; `cases.seedStarter` mutation (inserts Q1–Q5 + variations from data/cases.json content passed as arg is fine)
- `runs.evaluateAll` mutation `{ mode?: "pipeline"|"baseline" }` starts one run per case.
JSON case file format (`data/cases.json`): `[{ "label": "Q1", "text": "...", "tags": ["routine"], "expectedStatus": "ready", "expectedTotal": 320, "note": "..." }]`

## Pipeline (convex/pipeline.ts `run`, internalAction)
1. In PARALLEL: `extract` (LLM sub-agent -> Brief, tool/JSON-schema output) and `jev_triage` (Jev on raw text: triage, pressure, hardness x5).
2. `engine` (code): `evaluate(brief)`; compute `jev.agreement` by comparing LLM brief vs Jev.
3. `jev_pick` (Jev, only if engine.alternatives.length >= 2): choice among alt ids given client text + alternatives summary.
4. `write` (LLM sub-agent): drafts email from ENGINE FACTS ONLY. kind by status: ready/provisional -> proposal (provisional lists assumptions); infeasible -> explanation + alternatives with explicit trade-offs; needs_clarification -> clarification questions only, no prices.
5. `audit`: deterministic `verifyDraft(draft, engine)` (convex/lib/verify.ts) THEN an LLM auditor sub-agent (reflection). If code finds a `block` issue, ask the writer ONCE to revise with the issues, re-verify; set `audit.revised`.
Update `steps` live via internal mutations after each stage so the UI streams progress.

## UI (src/, Vite + React + Convex React client)
Single screen, beautiful, not busy. Left: enquiry input (pick a case / paste text / simple form: label + text) + case library with JSON upload + "Run all" and a results table (expected vs got, pass/fail, baseline vs pipeline).
Center/right: for the selected run show the **three lanes** (LLM / Jev / Code) as a live timeline with timings, the **brief** (confirmed / preferences / missing), the **itemised package + verified total**, **feasibility banner** (red when infeasible, amber provisional, green ready, blue clarification) shown ABOVE the draft, **alternatives with trade-offs**, **Jev vs LLM agreement** panel, and the **draft email** with a prominent "DRAFT – for salesperson approval, availability unconfirmed" label and an Approve button that only marks it locally (disabled with explanation when status is infeasible/needs_clarification unless an alternative is chosen).
Styling: CSS variables in `src/tokens.css` (the lead will later swap in the Pacium design tokens from Figma, so ONLY use tokens, never hardcoded colours/radii in components). Dark/light via prefers-color-scheme.
