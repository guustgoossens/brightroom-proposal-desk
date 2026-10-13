// Deterministic guard for LLM-written drafts. No LLM here: it only checks the text against engine facts.
// It is intentionally conservative: a false "block" costs one rewrite, a missed invented number costs trust.
import { SERVICES, VENUES } from "./catalogue";
import type { EngineResult } from "./types";

export interface Draft {
  kind: "proposal" | "clarification" | "explanation";
  subject: string;
  body: string;
}
export interface Issue {
  source: "code";
  severity: "block" | "warn";
  message: string;
}
/** Optional extra facts the engine result does not carry (it never stores the budget when status is ready). */
export interface VerifyOpts {
  budgetEur?: number | null;
}

// ---------------------------------------------------------------- euro parsing

// 1,500 | 1.500 | 1 500 | 1500 | 8.50 | 8,5
const NUM = "(\\d{1,3}(?:[,.\\u00a0\\u202f]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
const EUR_PREFIX = new RegExp(`(?:€|\\bEUR\\b)\\s*${NUM}`, "gi"); // €1,500  € 940  EUR 940  (also €8/person)
const EUR_SUFFIX = new RegExp(`${NUM}\\s*(?:€|euros?\\b|\\bEUR\\b)`, "gi"); // 1500 euros  940€

/** "1,500" -> 1500, "8.50" -> 8.5, "1.500" -> 1500. A trailing 1-2 digit group is a decimal part. */
export function parseAmount(raw: string): number {
  const s = raw.replace(/[\s  ]/g, "");
  const dec = s.match(/^(.*?)[.,](\d{1,2})$/);
  return dec ? Number(`${dec[1].replace(/[.,]/g, "")}.${dec[2]}`) : Number(s.replace(/[.,]/g, ""));
}

export interface Mention { value: number; index: number }

/** Every euro amount in the text, with its position. */
export function extractEuroAmounts(text: string): Mention[] {
  const out: Mention[] = [];
  for (const re of [EUR_PREFIX, EUR_SUFFIX]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) out.push({ value: parseAmount(m[1]), index: m.index ?? 0 });
  }
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------- allowed facts

const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.005;
const has = (set: number[], v: number) => set.some((x) => sameMoney(x, v));

/** All subset sums of the add-on amounts (<= 4 services, so at most 16). */
function subsetSums(amounts: number[]): number[] {
  return amounts.reduce<number[]>((acc, a) => [...acc, ...acc.map((s) => s + a)], [0]);
}

function collectFacts(engine: EngineResult, opts: VerifyOpts) {
  const lineAmounts: { name: string; value: number }[] = [];
  const totals: number[] = [];
  const other: number[] = [];

  const addPackage = (p: { lines: { name: string; amount: number; unitPrice: number }[]; total: number }) => {
    totals.push(p.total);
    for (const l of p.lines) { lineAmounts.push({ name: l.name, value: l.amount }); other.push(l.amount, l.unitPrice); }
  };

  if (engine.package) addPackage(engine.package);
  for (const alt of engine.alternatives) {
    addPackage(alt.package);
    if (alt.budgetEur != null) other.push(alt.budgetEur);
  }
  const addOnAmounts = engine.optionalAddOns.map((a) => a.amount);
  for (const a of engine.optionalAddOns) other.push(a.amount, a.unitPrice);
  if (engine.package) for (const s of subsetSums(addOnAmounts)) totals.push(engine.package.total + s);

  // Budget: from the caller, alternatives, or derivable from the budget shortfall.
  const budgets: number[] = [];
  if (opts.budgetEur != null) budgets.push(opts.budgetEur);
  for (const alt of engine.alternatives) if (alt.budgetEur != null) budgets.push(alt.budgetEur);
  for (const v of engine.violations) if (v.shortfallEur != null && engine.package) budgets.push(engine.package.total - v.shortfallEur);
  other.push(...budgets);
  for (const v of engine.violations) if (v.shortfallEur != null) other.push(v.shortfallEur);

  // Derived differences the writer may legitimately quote: savings vs the package, headroom vs budget.
  if (engine.package) {
    for (const alt of engine.alternatives) other.push(Math.abs(engine.package.total - alt.package.total));
    for (const b of budgets) other.push(Math.abs(b - engine.package.total));
    for (const b of budgets) for (const t of totals) other.push(Math.abs(b - t));
  }

  // Catalogue prices.
  for (const v of VENUES) other.push(v.price);
  for (const s of SERVICES) other.push(s.price);

  // Euro amounts the engine itself wrote in its notes/messages (e.g. "Loft would cost €180 more").
  const engineText = [
    ...engine.notes, ...engine.assumptions, ...engine.violations.map((v) => v.message),
    ...engine.alternatives.flatMap((a) => [a.note, a.title, ...a.relaxations.map((r) => `${r.from} ${r.to} ${r.tradeoff}`)]),
  ].join("\n");
  for (const m of extractEuroAmounts(engineText)) other.push(m.value);

  return { lineAmounts, totals, budgets, allowed: [...other, ...totals] };
}

// ---------------------------------------------------------------- text helpers

/** The clause (sentence fragment) containing `index`, so negations only count locally. */
function clauseAt(text: string, index: number, length = 0): string {
  const before = text.slice(0, index).split(/[.!?;\n]|,\s*(?:but|however)\b|\s+but\s+/i).pop() ?? "";
  const after = text.slice(index + length).split(/[.!?;\n]|,\s*(?:but|however)\b|\s+but\s+/i)[0] ?? "";
  return before + text.slice(index, index + length) + after;
}

const HARD_NEGATION = /\b(?:not|no|never|cannot|can't|cant|can not|unable|isn't|aren't|won't|wouldn't|don't|doesn't|nothing|without|neither|nor|unconfirmed|unbooked|unreserved)\b|n't\b/i;
// Conditional wording also defuses a promise ("once the salesperson confirms ...").
const SOFT_NEGATION = /\b(?:until|unless|pending|subject to|once|if|only after|before)\b/i;
/** "No problem" is not a negation. */
const isNegated = (clause: string, soft: boolean) => {
  const c = clause.replace(/\bno (?:problem|worries)\b/gi, "");
  return HARD_NEGATION.test(c) || (soft && SOFT_NEGATION.test(c));
};

/**
 * Matches that are NOT negated in their clause (and not exempted by `unless`). Returns the matched strings.
 * `soft` also treats conditional wording ("once", "if", "until") as defusing, used for promises only.
 */
function affirmedMatches(text: string, re: RegExp, soft = false, unless?: RegExp): string[] {
  const hits: string[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(g)) {
    const clause = clauseAt(text, m.index ?? 0, m[0].length);
    if (isNegated(clause, soft) || (unless && unless.test(clause))) continue;
    hits.push(m[0]);
  }
  return hits;
}

// Promises we are never allowed to make (availability, booking, date, discount).
const PROMISE =
  /\b(?:confirmed|booked|reserved|secured|guaranteed?|guarantees|locked in|held for you|we (?:will|'ll|can|shall) (?:hold|reserve|book|secure|block|guarantee)|(?:is|are) (?:definitely |now )?available|(?:date|slot|venue|room) is (?:yours|taken care of))\b/gi;

// Anything that is not Studio/Loft/coffee/lunch/projector/facilitator, plus discount/freebie wording.
const OUT_OF_CATALOGUE =
  /\b(?:photograph(?:er|y)|videograph(?:er|y)|catering|caterer|decorations?|flowers?|dj|live band|band|music|entertainment|parking|transport|shuttle|accommodation|hotel|overnight|dinner|breakfast|brunch|drinks reception|open bar|cocktails?|snacks?|cake|microphones?|sound system|live[- ]?stream(?:ing)?|interpret(?:er|ation)|translation|security guard|photo booth|swag|ballroom|terrace|rooftop|garden|atrium|auditorium|penthouse|annex|boardroom|conference hall|third venue|discounts?|\d+\s?% off|price match|special rate|early[- ]bird|free upgrade|free of charge|for free|complimentary|on the house|at no (?:extra )?(?:cost|charge)|free (?:extra|add-?on|photograph\w*|coffee|lunch|projector|facilitator|session|hour))\b/gi;

// Phrases that present a plan as fine/within reach.
const PRESENTS_AS_OK =
  /\b(?:within (?:your |the )?budget|fits? (?:comfortably |easily )?(?:within |in )?(?:your |the )?budget|good news|ready to go|ready to proceed|perfect(?:ly)? fit|all set|we can (?:offer|deliver|do) (?:this|that|it|exactly|everything)|no problem)\b/gi;
// A budget-fit claim about an alternative or a hypothetical is legitimate in an infeasible explanation.
const ABOUT_ALTERNATIVE = /\b(?:alternatives?|options?|instead|if you|would|could|reduc\w*|drop\w*|fewer|smaller|without|keep\w*|remov\w*|scal\w*)\b/i;
const ACKNOWLEDGES_LIMIT =
  /\b(?:exceed\w*|over (?:your |the )?budget|above (?:your |the )?budget|cannot|can't|not possible|unable|does(?:n't| not) fit|do(?:n't| not) fit|beyond|not within|too (?:high|much|small|long)|shortfall|limit|maximum|only offer)\b/i;

// ---------------------------------------------------------------- main check

export function verifyDraft(draft: Draft, engine: EngineResult, opts: VerifyOpts = {}): Issue[] {
  const issues: Issue[] = [];
  const block = (message: string) => issues.push({ source: "code", severity: "block", message });
  const warn = (message: string) => issues.push({ source: "code", severity: "warn", message });
  const text = `${draft.subject}\n${draft.body}`;

  // 1. Euro amounts: every one must come from the engine/catalogue.
  const { lineAmounts, totals, budgets, allowed } = collectFacts(engine, opts);
  const mentions = extractEuroAmounts(text);
  const reported = new Set<number>();
  for (const m of mentions) {
    if (!has(allowed, m.value) && !reported.has(m.value)) {
      reported.add(m.value);
      block(`Amount €${m.value} is not in the engine output or the catalogue (invented or miscalculated).`);
    }
  }

  // 2. Amounts described as a "total" must be a verified total (package, alternative, or package+add-ons).
  for (const m of mentions) {
    if (reported.has(m.value) || has(budgets, m.value)) continue; // already blocked above / a budget, not a total
    const window = text.slice(Math.max(0, m.index - 40), m.index).split(/[.!?;\n]/).pop() ?? "";
    if (!/\btotal\b|\ball[- ]in\b|\bin all\b|\boverall\b/i.test(window)) continue;
    if (/budget|shortfall|short by|over\b|exceed|saving|save\b|difference|more\b|less\b|cheaper|fewer|per person|each/i.test(window)) continue;
    const isTotal = has(totals, m.value);
    const isNamedLine = lineAmounts.some((l) => sameMoney(l.value, m.value) && window.toLowerCase().includes(l.name.toLowerCase()));
    if (!isTotal && !isNamedLine) block(`€${m.value} is presented as a total but is not a verified package/alternative total.`);
  }
  if (engine.package && draft.kind !== "clarification" && !mentions.some((m) => sameMoney(m.value, engine.package!.total))) {
    warn(`The verified package total €${engine.package.total} is not stated in the draft.`);
  }

  // 3. Clarification emails never carry prices.
  if (draft.kind === "clarification" && mentions.length) {
    block("A clarification email must not contain any euro price or amount.");
  }

  // 4. Out-of-catalogue services, venues, discounts, freebies (negations like "we cannot offer a discount" are fine).
  for (const hit of new Set(affirmedMatches(text, OUT_OF_CATALOGUE).map((h) => h.toLowerCase()))) {
    block(`"${hit}" is outside the approved catalogue (Studio, Loft, coffee, lunch, projector, facilitator) and must not be offered.`);
  }

  // 5. Promises about availability, booking, a date, or a discount.
  for (const hit of new Set(affirmedMatches(text, PROMISE, true).map((h) => h.toLowerCase()))) {
    block(`"${hit}" reads as a promise (availability, booking, date, discount); nothing is confirmed until the salesperson approves.`);
  }

  // 6. Infeasible plans must not be presented as OK.
  if (engine.status === "infeasible") {
    for (const hit of new Set(affirmedMatches(text, PRESENTS_AS_OK, false, ABOUT_ALTERNATIVE).map((h) => h.toLowerCase()))) {
      block(`Status is infeasible but the draft says "${hit}".`);
    }
    if (!ACKNOWLEDGES_LIMIT.test(text)) block("Status is infeasible but the draft never acknowledges the exceeded limit or budget.");
    if (draft.kind === "proposal") warn("Status is infeasible: an explanation (with alternatives), not a plain proposal, is expected.");
  }
  if (engine.status === "needs_clarification" && draft.kind !== "clarification") {
    warn("Status is needs_clarification: only a clarification email is expected.");
  }

  // 7. DRAFT / salesperson-approval notice.
  const hasDraft = /\bdraft\b/i.test(draft.body);
  const hasApproval = /(?:sales\s?person|sales team)[^.\n]*\bapprov|\bapprov[^.\n]*(?:sales\s?person|sales team)/i.test(draft.body);
  if (!hasDraft || !hasApproval) warn("Missing the DRAFT / salesperson-approval notice.");

  return issues;
}
