// DEV-ONLY fixtures, active only with `?mock=1`. Never used against a real backend.
import type { Case, Run } from "../types";

const now = Date.now();

export const MOCK_CASES: Case[] = [
  { _id: "c1", _creationTime: now, label: "Q1", text: "Workshop for 10 people, 4 hours, coffee and lunch, budget 600.", tags: ["routine"], expectedStatus: "ready", expectedTotal: 500 },
  { _id: "c2", _creationTime: now, label: "Q4", text: "30 people, wheelchair user, lunch + facilitator, 800 budget.", tags: ["difficult"], expectedStatus: "infeasible" },
  { _id: "c3", _creationTime: now, label: "Q3", text: "Team offsite sometime next month, need coffee. Not sure how many.", tags: ["missing-info"], expectedStatus: "needs_clarification" },
];

const readyRun: Run = {
  _id: "r1", _creationTime: now, caseId: "c1", label: "Q1", mode: "pipeline", status: "done",
  text: "Workshop for 10 people, 4 hours, coffee and lunch, budget 600. A projector would be nice.",
  createdAt: now - 60000, finishedAt: now - 52000,
  steps: [
    { key: "extract", title: "Extract brief", lane: "llm", status: "done", startedAt: now - 60000, ms: 2100, summary: "10 people · 4 h · budget €600 · 2 required, 1 preferred" },
    { key: "jev_triage", title: "Triage + hardness", lane: "jev", status: "done", startedAt: now - 60000, ms: 380, summary: "complete (92%) · pressure 6%" },
    { key: "engine", title: "Price & check constraints", lane: "code", status: "done", startedAt: now - 57000, ms: 4, summary: "ready · Studio · €500 verified" },
    { key: "jev_pick", title: "Pick alternative", lane: "jev", status: "skipped", startedAt: now - 57000, summary: "no alternatives needed" },
    { key: "write", title: "Write draft", lane: "llm", status: "done", startedAt: now - 57000, ms: 3400, summary: "proposal, 142 words" },
    { key: "audit", title: "Audit draft", lane: "llm", status: "done", startedAt: now - 53000, ms: 1800, summary: "passed · 0 issues" },
  ],
  brief: {
    headcount: 10, durationHours: 4, budgetEur: 600, wheelchair: "unknown",
    services: [
      { id: "S1", need: "required", evidence: "\"coffee and lunch\"" },
      { id: "S2", need: "required", evidence: "\"coffee and lunch\"" },
      { id: "S3", need: "preferred", evidence: "\"A projector would be nice\"" },
    ],
    requestedDate: null, unlistedRequests: [], commitmentAsks: [],
    confirmed: ["10 attendees", "4 hours", "Budget €600", "Coffee break", "Lunch"],
    preferences: ["Projector (nice to have)"],
    missing: ["Date", "Accessibility needs"],
  },
  jev: {
    model: "jev-typed-1", latencyMs: 380,
    triage: { choice: "complete", confidence: 0.92, probs: { complete: 0.92, provisional_ok: 0.07, needs_clarification: 0.01 } },
    pressure: { probability: 0.06 },
    hardness: { S1: { probability: 0.81 }, S2: { probability: 0.88 }, S3: { probability: 0.12 }, S4: { probability: 0.02 }, wheelchair: { probability: 0.03 } },
    agreement: [
      { field: "S1 Coffee break", llm: "required", jev: "hard (81%)", agrees: true },
      { field: "S2 Lunch", llm: "required", jev: "hard (88%)", agrees: true },
      { field: "S3 Projector", llm: "preferred", jev: "soft (12%)", agrees: true },
    ],
  },
  engine: {
    status: "provisional", totalVerified: true,
    assumptions: ["Date not stated: availability must be confirmed by the salesperson", "No accessibility need stated: Studio (stairs only) assumed fine"],
    violations: [],
    package: {
      venue: "V1", headcount: 10, durationHours: 4, total: 500,
      lines: [
        { id: "V1", name: "Studio", qty: 1, unit: "venue", unitPrice: 240, amount: 240, basis: "flat, 4 hours, max 12 people" },
        { id: "S1", name: "Coffee break", qty: 10, unit: "person", unitPrice: 8, amount: 80, basis: "€8 × 10 people" },
        { id: "S2", name: "Lunch", qty: 10, unit: "person", unitPrice: 18, amount: 180, basis: "€18 × 10 people" },
      ],
    },
    optionalAddOns: [{ id: "S3", name: "Projector", qty: 1, unit: "booking", unitPrice: 35, amount: 35, basis: "flat per booking", withinBudgetWithPackage: true }],
    alternatives: [], clarificationQuestions: [], cannotPromise: ["Date availability", "Allergen guarantee"], notes: [],
  },
  draft: {
    kind: "proposal", subject: "Your workshop at BrightRoom: proposal for 10 people",
    body: "Hello,\n\nThank you for your enquiry. Based on what you told us, here is a proposal:\n\n- Studio, 4 hours (€240)\n- Coffee break for 10 (€80)\n- Lunch for 10 (€180)\n\nTotal: €500. A projector can be added for €35.\n\nPlease note availability for your date is not yet confirmed.\n\nBest regards,\nBrightRoom\n\n--\nDRAFT · for salesperson approval · availability unconfirmed",
  },
  audit: { passed: true, revised: false, issues: [{ source: "llm", severity: "warn", message: "Date is not mentioned in the draft; consider asking." }] },
};

const infeasibleRun: Run = {
  _id: "r2", _creationTime: now, caseId: "c2", label: "Q4", mode: "pipeline", status: "done",
  text: "We are 30 people, one is a wheelchair user. Lunch and a facilitator please, budget 800. Can you confirm today?",
  createdAt: now - 20000, finishedAt: now - 11000,
  steps: [
    { key: "extract", title: "Extract brief", lane: "llm", status: "done", startedAt: now - 20000, ms: 2300, summary: "30 people · wheelchair required · budget €800" },
    { key: "jev_triage", title: "Triage + hardness", lane: "jev", status: "done", startedAt: now - 20000, ms: 410, summary: "complete (84%) · pressure 91%" },
    { key: "engine", title: "Price & check constraints", lane: "code", status: "done", startedAt: now - 17700, ms: 6, summary: "infeasible · 2 violations · 2 alternatives" },
    { key: "jev_pick", title: "Pick alternative", lane: "jev", status: "done", startedAt: now - 17700, ms: 350, summary: "A1 recommended (71%)" },
    { key: "write", title: "Write draft", lane: "llm", status: "done", startedAt: now - 17300, ms: 3900, summary: "explanation + 2 alternatives" },
    { key: "audit", title: "Audit draft", lane: "llm", status: "error", startedAt: now - 13400, ms: 900, error: "LLM auditor timed out; code checks only" },
  ],
  brief: {
    headcount: 30, durationHours: 4, budgetEur: 800, wheelchair: "required",
    services: [
      { id: "S2", need: "required", evidence: "\"Lunch and a facilitator please\"" },
      { id: "S4", need: "required", evidence: "\"Lunch and a facilitator please\"" },
    ],
    requestedDate: null, unlistedRequests: [], commitmentAsks: ["confirm today"],
    confirmed: ["30 attendees", "Wheelchair access", "Budget €800"], preferences: [], missing: ["Date", "Duration"],
  },
  jev: {
    model: "jev-typed-1", latencyMs: 410,
    triage: { choice: "complete", confidence: 0.84, probs: { complete: 0.84, provisional_ok: 0.12, needs_clarification: 0.04 } },
    pressure: { probability: 0.91 },
    hardness: { S1: { probability: 0.05 }, S2: { probability: 0.74 }, S3: { probability: 0.03 }, S4: { probability: 0.69 }, wheelchair: { probability: 0.97 } },
    pick: { altId: "A1", confidence: 0.71, probs: { A1: 0.71, A2: 0.29 } },
    agreement: [
      { field: "Wheelchair", llm: "required", jev: "hard (97%)", agrees: true },
      { field: "S4 Facilitator", llm: "preferred", jev: "hard (69%)", agrees: false },
    ],
  },
  engine: {
    status: "infeasible", totalVerified: true, assumptions: [],
    violations: [
      { code: "capacity", message: "30 people exceeds the largest venue (24 people)." },
      { code: "budget", message: "Cheapest compliant package is €1,244, €444 over the €800 budget.", shortfallEur: 444 },
    ],
    package: null, optionalAddOns: [],
    alternatives: [
      {
        id: "A1", title: "Loft, 24 people", budgetEur: 800, withinBudget: false, note: "Keeps accessibility; drops 6 attendees.",
        relaxations: [{ field: "headcount", from: "30", to: "24", tradeoff: "Six people cannot attend this session; run a second session." }],
        package: { venue: "V2", headcount: 24, durationHours: 4, total: 1132, lines: [
          { id: "V2", name: "Loft", qty: 1, unit: "venue", unitPrice: 420, amount: 420, basis: "flat, 4 hours, max 24 people" },
          { id: "S2", name: "Lunch", qty: 24, unit: "person", unitPrice: 18, amount: 432, basis: "€18 × 24 people" },
          { id: "S4", name: "Facilitator", qty: 1, unit: "booking", unitPrice: 280, amount: 280, basis: "flat, 2 hours" },
        ] },
      },
      {
        id: "A2", title: "Loft, 24 people, no facilitator", budgetEur: 800, withinBudget: false, note: "Cheaper, but loses the facilitator.",
        relaxations: [
          { field: "headcount", from: "30", to: "24", tradeoff: "Six people cannot attend." },
          { field: "service", from: "Facilitator", to: "none", tradeoff: "Sessions would be self-led." },
        ],
        package: { venue: "V2", headcount: 24, durationHours: 4, total: 852, lines: [
          { id: "V2", name: "Loft", qty: 1, unit: "venue", unitPrice: 420, amount: 420, basis: "flat, 4 hours, max 24 people" },
          { id: "S2", name: "Lunch", qty: 24, unit: "person", unitPrice: 18, amount: 432, basis: "€18 × 24 people" },
        ] },
      },
    ],
    clarificationQuestions: [], cannotPromise: ["Same-day confirmation", "Discounts"], notes: [],
  },
  draft: {
    kind: "explanation", subject: "Your workshop: what we can and cannot offer for 30 people",
    body: "Hello,\n\nThank you for your enquiry. Unfortunately our largest venue holds 24 people, so we cannot host all 30 in one session as requested.\n\nOption A1: Loft, 24 people, with lunch and facilitator, €1,132.\nOption A2: Loft, 24 people, lunch only, €852.\n\nWe cannot confirm anything today; the salesperson will follow up.\n\n--\nDRAFT · for salesperson approval · availability unconfirmed",
  },
  audit: { passed: true, revised: true, issues: [{ source: "code", severity: "block", message: "Draft quoted €1,100; corrected to €1,132 after revision." }] },
};

const clarificationRun: Run = {
  _id: "r3", _creationTime: now, caseId: "c3", label: "Q3", mode: "pipeline", status: "done",
  text: "Team offsite sometime next month, need coffee. Not sure how many yet.",
  createdAt: now - 9000, finishedAt: now - 6000,
  steps: [
    { key: "extract", title: "Extract brief", lane: "llm", status: "done", startedAt: now - 9000, ms: 1800, summary: "headcount unknown" },
    { key: "jev_triage", title: "Triage + hardness", lane: "jev", status: "skipped", startedAt: now - 9000, summary: "no key configured" },
    { key: "engine", title: "Price & check constraints", lane: "code", status: "done", startedAt: now - 7200, ms: 2, summary: "needs clarification" },
    { key: "write", title: "Write draft", lane: "llm", status: "done", startedAt: now - 7200, ms: 1500, summary: "clarification, 3 questions" },
    { key: "audit", title: "Audit draft", lane: "llm", status: "done", startedAt: now - 5700, ms: 700, summary: "passed" },
  ],
  brief: { headcount: null, durationHours: null, budgetEur: null, wheelchair: "unknown", services: [{ id: "S1", need: "required", evidence: "\"need coffee\"" }], requestedDate: "next month", unlistedRequests: [], commitmentAsks: [], confirmed: ["Coffee break"], preferences: [], missing: ["Headcount", "Duration", "Budget", "Exact date"] },
  engine: { status: "needs_clarification", totalVerified: true, assumptions: [], violations: [], package: null, optionalAddOns: [], alternatives: [], clarificationQuestions: ["How many people will attend?", "How long should the session run (max 4 hours)?", "Which date would you like?"], cannotPromise: [], notes: [] },
  draft: { kind: "clarification", subject: "A few questions about your team offsite", body: "Hello,\n\nTo prepare a proposal we need:\n1. How many people?\n2. How many hours?\n3. Which date?\n\n--\nDRAFT · for salesperson approval · availability unconfirmed" },
  audit: { passed: true, revised: false, issues: [] },
};

const baselineRun: Run = {
  _id: "r4", _creationTime: now, caseId: "c2", label: "Q4", mode: "baseline", status: "done",
  text: infeasibleRun.text, createdAt: now - 30000, finishedAt: now - 26000,
  steps: [{ key: "baseline", title: "Single prompt", lane: "llm", status: "done", startedAt: now - 30000, ms: 4100, summary: "claimed €780, feasible" }],
  baseline: { text: "Great news! For 30 people with lunch and a facilitator the Loft works perfectly. Lunch for 30 is €540 and the facilitator €280 for a total of €780 which fits your budget. Confirmed for today!", claimedTotal: 780, claimedFeasible: true },
};

const runningRun: Run = {
  _id: "r5", _creationTime: now, label: "Live demo", mode: "pipeline", status: "running",
  text: "Training day for 12 people, 4 hours, lunch, projector, budget 500.",
  createdAt: now, steps: [
    { key: "extract", title: "Extract brief", lane: "llm", status: "running", startedAt: now },
    { key: "jev_triage", title: "Triage + hardness", lane: "jev", status: "done", startedAt: now, ms: 360, summary: "complete (88%)" },
  ],
};

export const MOCK_RUNS: Run[] = [runningRun, clarificationRun, baselineRun, infeasibleRun, readyRun];
