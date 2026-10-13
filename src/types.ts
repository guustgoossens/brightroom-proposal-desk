import type { Brief, EngineResult, Status } from "../convex/lib/types";

export type { Brief, EngineResult, Status };

export type Lane = "llm" | "jev" | "code";
export type StepStatus = "running" | "done" | "skipped" | "error";
export type RunMode = "pipeline" | "baseline";

export interface Step {
  key: string;
  title: string;
  lane: Lane;
  status: StepStatus;
  startedAt: number;
  ms?: number;
  summary?: string;
  error?: string;
}

export interface JevResult {
  model: string;
  latencyMs: number;
  triage: { choice: "complete" | "provisional_ok" | "needs_clarification"; confidence: number; probs?: Record<string, number> };
  pressure: { probability: number };
  hardness: Record<"S1" | "S2" | "S3" | "S4" | "wheelchair", { probability: number }>;
  pick?: { altId: string; confidence: number; probs?: Record<string, number> };
  agreement: { field: string; llm: string; jev: string; agrees: boolean }[];
}

export interface Draft {
  kind: "proposal" | "clarification" | "explanation";
  subject: string;
  body: string;
}

export interface Audit {
  passed: boolean;
  issues: { source: "code" | "llm"; severity: "block" | "warn"; message: string }[];
  revised: boolean;
  firstPass?: { source: "code" | "llm"; severity: "block" | "warn"; message: string }[];
}

export interface Baseline {
  text: string;
  claimedTotal: number | null;
  claimedFeasible: boolean | null;
}

export interface Run {
  _id: string;
  _creationTime: number;
  caseId?: string;
  label: string;
  text: string;
  mode: RunMode;
  status: "running" | "done" | "error";
  steps: Step[];
  brief?: Brief;
  jev?: JevResult;
  engine?: EngineResult;
  draft?: Draft;
  audit?: Audit;
  baseline?: Baseline;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

export interface CaseInput {
  label: string;
  text: string;
  tags?: string[];
  expectedStatus?: string;
  expectedTotal?: number;
  note?: string;
}

export interface Case extends CaseInput {
  _id: string;
  _creationTime: number;
}
