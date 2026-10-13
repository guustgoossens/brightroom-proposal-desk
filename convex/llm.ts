// LLM lane: four Claude sub-agents with tight, separate system prompts.
// Plain helper module (no Convex functions). Imported only from `pipeline.ts`, which runs in the Node runtime.
// Structured output via `output_config.format` (JSON schema from zod). Static catalogue prompt is cache-marked.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { FACILITATOR_HOURS, MAX_HOURS, SERVICES, VENUES } from "./lib/catalogue";
import type { Audit, AuditIssue, BaselineOutput, Brief, Draft, EngineResult } from "./lib/types";

export const hasAnthropicKey = () => !!process.env.ANTHROPIC_API_KEY;
export const anthropicModel = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic());

// ---------------------------------------------------------------- catalogue (static, cacheable)
const CATALOGUE_TEXT = [
  "BRIGHTROOM APPROVED CATALOGUE (fictional teaching data; all prices are total euros; there are NO taxes, fees, discounts, or longer-duration prices)",
  "Venues (one per booking, flat price):",
  ...VENUES.map((v) => `- ${v.id} ${v.name}: EUR ${v.price}, ${v.conditions}`),
  "Services:",
  ...SERVICES.map((s) => `- ${s.id} ${s.name}: EUR ${s.price} ${s.pricing === "per_person" ? "per person" : "flat"}; ${s.conditions}`),
  `Booking length is ${MAX_HOURS} hours maximum. The facilitator covers ${FACILITATOR_HOURS} hours. Nothing else exists in the catalogue.`,
].join("\n");

const system = (role: string) => [
  { type: "text" as const, text: CATALOGUE_TEXT, cache_control: { type: "ephemeral" as const } },
  { type: "text" as const, text: role },
];

interface CallOpts<T extends z.ZodType> {
  role: string;
  user: string;
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

async function callStructured<T extends z.ZodType>(o: CallOpts<T>): Promise<z.infer<T>> {
  const res = await client().messages.parse({
    model: anthropicModel(),
    max_tokens: o.maxTokens ?? 8000,
    system: system(o.role),
    messages: [{ role: "user", content: o.user }],
    output_config: { format: zodOutputFormat(o.schema), effort: o.effort ?? "low" },
  });
  if (res.stop_reason === "refusal") throw new Error("Model refused this request");
  if (res.parsed_output == null) throw new Error(`No parsable output (stop_reason=${res.stop_reason})`);
  return res.parsed_output as z.infer<T>;
}

// ---------------------------------------------------------------- (a) extractor
const BriefSchema = z.object({
  headcount: z.number().nullable(),
  durationHours: z.number().nullable(),
  budgetEur: z.number().nullable(),
  wheelchair: z.enum(["required", "preferred", "not_needed", "unknown"]),
  services: z.array(z.object({
    id: z.enum(["S1", "S2", "S3", "S4"]),
    need: z.enum(["required", "preferred"]),
    evidence: z.string(),
  })),
  requestedDate: z.string().nullable(),
  unlistedRequests: z.array(z.string()),
  commitmentAsks: z.array(z.string()),
  confirmed: z.array(z.string()),
  preferences: z.array(z.string()),
  missing: z.array(z.string()),
});

const EXTRACTOR_ROLE = `ROLE: You are the EXTRACTOR. Turn a client enquiry into a structured brief. You do not price anything, do not draft any reply, and do not give advice.

RULES
- Extract only what the client wrote. "Not stated" MUST be null (numbers/date) or "unknown" (wheelchair). Never guess, never fill defaults, never infer a number the client did not give.
- headcount: number of attendees if explicitly stated, else null. durationHours: only if an explicit number of hours is given (e.g. "4 hours", "two hours"); vague phrases like "half a day", "a morning", "an afternoon" are NOT hours -> null and add the vagueness to "missing". budgetEur: total budget in euros if stated; if the budget is per person or unclear, set null and say so in "missing" and "preferences".
- wheelchair: "required" if step-free/wheelchair access is needed or someone uses a wheelchair; "preferred" if wished for but optional; "not_needed" only if the client says it is not needed; otherwise "unknown".
- services: only catalogue services S1 (coffee break), S2 (lunch), S3 (projector), S4 (facilitator). Wording "must / need / required / have to / essential" => need "required". "would be nice / ideally / if possible / maybe / preferably / optional" => need "preferred". A service the client simply asks for with no hedge ("coffee for everyone", "with lunch", "and a projector") is "required". Quote the client's words in "evidence".
- The word "food" / "catering" / "refreshments" is AMBIGUOUS: mark BOTH S2 and S1 as "preferred" (evidence = the client's words) and add an entry to "missing" like "Unclear which food service is wanted: coffee break, lunch, or both?". Do not mark them required unless the client clearly says coffee/lunch is required.
- requestedDate: the verbatim date phrase ("next month", "Friday 14th") or null. It is never confirmed.
- unlistedRequests: things the client asks for that are NOT in the catalogue (e.g. live band, allergen guarantee, overnight stay, parking, decorations, a bigger venue, a longer session pricing). Short noun phrases. Discounts, price promises, holding or booking a date, and "confirm today" are NEVER unlisted requests: they go ONLY in commitmentAsks (we simply decline to promise them).
- commitmentAsks: commitments the client wants us to make now (e.g. "confirm today", "hold the date", "give a discount", "guarantee availability", "guarantee allergen-free").
- confirmed: facts the client stated clearly (short phrases, e.g. "10 attendees"). preferences: soft wishes and context. missing: information a salesperson would need and that was not stated or is vague (headcount, duration, budget, which services, accessibility, exact date).
- Output language: English, short phrases.`;

export async function extractBrief(text: string): Promise<Brief> {
  const out = await callStructured({
    role: EXTRACTOR_ROLE,
    user: `Client enquiry:\n"""\n${text}\n"""`,
    schema: BriefSchema,
    effort: "low",
  });
  // Dedupe services by id: keep "required" over "preferred".
  const byId = new Map<string, Brief["services"][number]>();
  for (const s of out.services) {
    const prev = byId.get(s.id);
    if (!prev || (prev.need === "preferred" && s.need === "required")) byId.set(s.id, s);
  }
  return { ...out, services: [...byId.values()] };
}

// ---------------------------------------------------------------- (b) writer
const DraftSchema = z.object({ subject: z.string(), body: z.string() });

const WRITER_ROLE = `ROLE: You are the WRITER. You write a plain-text email DRAFT that a BrightRoom salesperson will review and approve. You never send anything.

You receive ENGINE FACTS (a JSON object computed by deterministic code) and the structured brief. The engine facts are the ONLY source of truth for prices, totals, venues, violations, alternatives and assumptions.

HARD RULES
1. Use only items, quantities, unit prices, amounts and totals that appear in the engine facts, copied verbatim. Never compute, round, convert, add, subtract or estimate any money amount yourself. Do not introduce any number that is not in the facts or the brief (headcount, hours, budget are allowed as given).
2. Do not invent services, venues, extras, perks, discounts, taxes, fees or conditions. Nothing outside the catalogue and engine facts exists.
3. Never promise or imply a held date, confirmed booking, availability, discount, price lock, or guarantee (including allergen guarantees). State clearly that availability is unconfirmed and that nothing is held or booked. If the client asked for an immediate commitment (e.g. confirm today), say politely that this draft cannot confirm anything and a salesperson will follow up.
4. Label every assumption from the facts explicitly as an assumption and ask the client to confirm it.
5. Violations: explain each plainly and honestly (what the client asked for, which limit it hits). Do not hide a budget overrun and do not silently change a must-have.
6. Alternatives: if the facts include alternatives, present them AFTER explaining the violation, each with its explicit trade-offs (the relaxations) and its package total from the facts. Never present an alternative as the default or as what the client asked for; the salesperson and client must explicitly agree to a trade-off.
7. Optional add-ons (preferred services) are shown as optional, priced from the facts, and NOT included in the package total.
8. Itemise the package as lines (name, basis, amount) followed by the verified total, all copied from the facts.
9. Tone: warm, concise, professional. Plain text only (no markdown, no bullets with asterisks; use simple dashes). Address the client generically ("Hello,") and sign off as "BrightRoom team".
10. The final line of the body MUST be exactly: "DRAFT for salesperson approval - not sent. Availability is unconfirmed; nothing is held or booked."

BY KIND (you are told which kind to write)
- proposal (engine status ready or provisional): summarise the request, show the itemised package and total, optional add-ons if any, assumptions to confirm (if provisional), the next-step questions from clarificationQuestions, availability unconfirmed.
- explanation (status infeasible): explain which requirement cannot be met and why, show the best-fitting package from the facts only if it exists and clearly say it does NOT meet the request in the way described, then list alternatives with trade-offs. Ask the client which trade-off, if any, they accept.
- clarification (status needs_clarification): ask the clarificationQuestions only (you may rephrase them in friendly wording). NO prices, NO totals, NO packages, NO catalogue price figures.`;

const KIND_BY_STATUS: Record<EngineResult["status"], Draft["kind"]> = {
  ready: "proposal",
  provisional: "proposal",
  infeasible: "explanation",
  needs_clarification: "clarification",
};

export const DRAFT_NOTICE = "DRAFT for salesperson approval - not sent. Availability is unconfirmed; nothing is held or booked.";

export async function writeDraft(
  brief: Brief,
  engine: EngineResult,
  revision?: { previous: Draft; issues: AuditIssue[] },
): Promise<Draft> {
  const kind = KIND_BY_STATUS[engine.status];
  const facts = JSON.stringify({ kindToWrite: kind, engineFacts: engine, brief });
  const user = revision
    ? `${facts}\n\nYour previous draft was REJECTED by automatic checks. Rewrite the full draft fixing every issue below, still using only the engine facts.\nISSUES:\n${revision.issues.map((i) => `- [${i.severity}] ${i.message}`).join("\n")}\n\nPREVIOUS DRAFT:\nSubject: ${revision.previous.subject}\n${revision.previous.body}`
    : facts;
  const out = await callStructured({ role: WRITER_ROLE, user, schema: DraftSchema, effort: "medium", maxTokens: 10000 });
  let body = out.body.trimEnd();
  if (!body.toUpperCase().includes("DRAFT")) body += `\n\n${DRAFT_NOTICE}`;
  return { kind, subject: out.subject.trim(), body };
}

// ---------------------------------------------------------------- (c) auditor
const AuditSchema = z.object({
  issues: z.array(z.object({ severity: z.enum(["block", "warn"]), message: z.string() })),
});

const AUDITOR_ROLE = `ROLE: You are the AUDITOR. You review an email DRAFT against the ENGINE FACTS and the catalogue. You do not rewrite the draft.

Report an issue ONLY when you can point to concrete text. Check for:
1. Invented services, venues, extras, perks, discounts, fees or conditions not in the catalogue/engine facts.
2. Numbers (prices, totals, quantities, hours) that do not match the engine facts, or any money amount the facts do not contain.
3. A hidden budget overrun: the draft implies the request fits the budget when the facts show a budget violation, or fails to state a shortfall.
4. A silently changed must-have: the draft drops, swaps or weakens a required service/constraint (capacity, duration, accessibility) without saying so, or presents an alternative as the default.
5. Promises: confirms, holds or guarantees a date, availability, discount, price, allergen safety or anything in engineFacts.cannotPromise.
6. Clarification drafts that include prices; proposal drafts for infeasible requests that present a non-compliant package as fine; missing DRAFT/for-salesperson-approval notice.
Severity: "block" for 1-5 and any wrong number; "warn" for tone, minor omissions (e.g. an assumption not labelled). If the draft is clean, return an empty issues list. Messages: one short sentence each, quoting the offending words.`;

export async function auditDraft(draft: Draft, engine: EngineResult, brief: Brief): Promise<AuditIssue[]> {
  const out = await callStructured({
    role: AUDITOR_ROLE,
    user: JSON.stringify({ engineFacts: engine, brief, draft }),
    schema: AuditSchema,
    effort: "low",
    maxTokens: 6000,
  });
  return out.issues.map((i) => ({ source: "llm" as const, severity: i.severity, message: i.message }));
}

export const finalizeAudit = (issues: AuditIssue[], revised: boolean, firstPass?: AuditIssue[]): Audit => ({
  passed: !issues.some((i) => i.severity === "block"),
  issues,
  revised,
  ...(firstPass?.length ? { firstPass } : {}),
});

// ---------------------------------------------------------------- (d) baseline: one prompt, no engine, no Jev
const BaselineSchema = z.object({
  text: z.string(),
  claimedTotal: z.number().nullable(),
  claimedFeasible: z.boolean().nullable(),
});

const BASELINE_ROLE = `ROLE: You are a BrightRoom sales assistant. Read the client enquiry and write the complete reply email the client should receive, using the catalogue above. Work everything out yourself.
Also report, as structured fields: "text" = the full email, "claimedTotal" = the total price in euros that your email quotes for the proposed package (null if you quote no single total), "claimedFeasible" = true if you consider the request fully deliverable as asked, false if not, null if you cannot tell yet.`;

export async function runBaseline(text: string): Promise<BaselineOutput> {
  return callStructured({
    role: BASELINE_ROLE,
    user: `Client enquiry:\n"""\n${text}\n"""`,
    schema: BaselineSchema,
    effort: "low",
    maxTokens: 10000,
  });
}
