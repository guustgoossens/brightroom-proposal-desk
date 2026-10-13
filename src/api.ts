// Typed facade over the generated Convex api. Keeps the UI compiling even while
// the backend modules are still being pushed (convex/_generated lags behind).
import type { DefaultFunctionArgs, FunctionReference } from "convex/server";
import { api as generated } from "../convex/_generated/api";
import type { Case, CaseInput, Run, RunMode } from "./types";

type Q<A extends DefaultFunctionArgs, R> = FunctionReference<"query", "public", A, R>;
type M<A extends DefaultFunctionArgs, R> = FunctionReference<"mutation", "public", A, R>;

interface BrightApi {
  runs: {
    list: Q<Record<string, never>, Run[]>;
    get: Q<{ id: string }, Run | null>;
    start: M<{ label: string; text: string; mode?: RunMode; caseId?: string }, string>;
    evaluateAll: M<{ mode?: RunMode }, unknown>;
  };
  cases: {
    list: Q<Record<string, never>, Case[]>;
    importJson: M<{ cases: CaseInput[] }, unknown>;
    seedStarter: M<{ cases?: CaseInput[] }, unknown>;
    remove: M<{ id: string }, unknown>;
  };
}

export const api = generated as unknown as BrightApi;
