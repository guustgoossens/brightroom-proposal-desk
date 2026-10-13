import type { ServiceId, VenueId } from "./catalogue";

export type Need = "required" | "preferred";
export type Wheelchair = "required" | "preferred" | "not_needed" | "unknown";

/** What the LLM extractor (Claude) returns. Everything is nullable: "not stated" is a first-class value. */
export interface Brief {
  headcount: number | null;
  durationHours: number | null;
  budgetEur: number | null;
  wheelchair: Wheelchair;
  services: { id: ServiceId; need: Need; evidence: string }[];
  /** Verbatim date phrase if any, e.g. "next month". Never treated as confirmed. */
  requestedDate: string | null;
  /** Things the client asked for that are NOT in the catalogue (e.g. "live band", "allergen guarantee"). */
  unlistedRequests: string[];
  /** Commitments the client wants that we must not make (e.g. "confirm today", "discount", "book the date"). */
  commitmentAsks: string[];
  confirmed: string[];
  preferences: string[];
  missing: string[];
}

export interface Line {
  id: VenueId | ServiceId;
  name: string;
  qty: number;
  unit: "venue" | "person" | "booking";
  unitPrice: number;
  amount: number;
  basis: string;
}

export interface Package {
  venue: VenueId;
  headcount: number;
  durationHours: number;
  lines: Line[];
  total: number;
}

export type ViolationCode = "capacity" | "duration" | "accessibility" | "budget" | "unlisted_service";

export interface Violation {
  code: ViolationCode;
  message: string;
  shortfallEur?: number;
}

export interface Relaxation {
  field: "headcount" | "durationHours" | "service";
  from: string;
  to: string;
  tradeoff: string;
}

export interface Alternative {
  id: string;
  title: string;
  relaxations: Relaxation[];
  package: Package;
  budgetEur: number | null;
  withinBudget: boolean | null;
  note: string;
}

export type Status = "ready" | "provisional" | "infeasible" | "needs_clarification";

export interface EngineResult {
  status: Status;
  assumptions: string[];
  violations: Violation[];
  /** Package that satisfies every capacity/duration/accessibility constraint (may still exceed budget). Null when no venue qualifies. */
  package: Package | null;
  /** Priced "preferred" services. NOT included in package.total. */
  optionalAddOns: (Line & { withinBudgetWithPackage: boolean | null })[];
  /** Each alternative relaxes named must-haves; never applied silently. */
  alternatives: Alternative[];
  clarificationQuestions: string[];
  /** Fixed list of things the draft must not promise. */
  cannotPromise: string[];
  notes: string[];
  totalVerified: boolean;
}

// ---- Appended by backend agent: payload shapes stored on `runs` (see CONTRACT.md) ----

export type TriageChoice = "complete" | "provisional_ok" | "needs_clarification";
export type HardnessKey = "S1" | "S2" | "S3" | "S4" | "wheelchair";

export interface JevAgreement {
  field: string;
  llm: string;
  jev: string;
  agrees: boolean;
}

export interface JevResult {
  model: string;
  latencyMs: number;
  triage: { choice: TriageChoice; confidence: number; probs?: Record<string, number> };
  pressure: { probability: number };
  hardness: Record<HardnessKey, { probability: number }>;
  pick?: { altId: string; confidence: number; probs?: Record<string, number> };
  agreement: JevAgreement[];
}

export interface Draft {
  kind: "proposal" | "clarification" | "explanation";
  subject: string;
  body: string;
}

export interface AuditIssue {
  source: "code" | "llm";
  severity: "block" | "warn";
  message: string;
}

export interface Audit {
  passed: boolean;
  issues: AuditIssue[];
  revised: boolean;
  /** Blocking issues the code guard found in the writer's FIRST draft (kept as evidence when a revision ran). */
  firstPass?: AuditIssue[];
}

export interface BaselineOutput {
  text: string;
  claimedTotal: number | null;
  claimedFeasible: boolean | null;
}
