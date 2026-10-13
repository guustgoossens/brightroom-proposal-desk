import type { Case, Run } from "../types";

export type Verdict = { pass: boolean; checks: string[] } | null;

const sameTotal = (a: number | null | undefined, b: number | undefined) =>
  b == null ? true : a != null && Math.abs(a - b) < 0.5;

/** Pipeline: engine status + engine package total vs expectations. */
export function judgePipeline(c: Case, run: Run | undefined): Verdict {
  if (!run || run.status === "running") return null;
  if (run.status === "error" || !run.engine) return { pass: false, checks: ["run errored"] };
  const checks: string[] = [];
  let pass = true;
  if (c.expectedStatus) {
    const ok = run.engine.status === c.expectedStatus;
    pass &&= ok;
    checks.push(`status ${ok ? "=" : "≠"} ${c.expectedStatus}`);
  }
  if (c.expectedTotal != null) {
    const ok = sameTotal(run.engine.package?.total, c.expectedTotal);
    pass &&= ok;
    checks.push(`total ${ok ? "=" : "≠"} ${c.expectedTotal}`);
  }
  return { pass, checks };
}

/** Baseline: claimedTotal and claimedFeasible vs expectation. */
export function judgeBaseline(c: Case, run: Run | undefined): Verdict {
  if (!run || run.status === "running") return null;
  if (run.status === "error" || !run.baseline) return { pass: false, checks: ["run errored"] };
  const checks: string[] = [];
  let pass = true;
  if (c.expectedStatus) {
    const expectFeasible = c.expectedStatus === "ready" || c.expectedStatus === "provisional";
    const claimed = run.baseline.claimedFeasible;
    const ok = claimed === expectFeasible;
    pass &&= ok;
    checks.push(`feasible claim ${claimed == null ? "none" : claimed ? "yes" : "no"} ${ok ? "✓" : "✗"}`);
  }
  if (c.expectedTotal != null) {
    const ok = sameTotal(run.baseline.claimedTotal, c.expectedTotal);
    pass &&= ok;
    checks.push(`total ${run.baseline.claimedTotal ?? "none"} ${ok ? "✓" : "✗"}`);
  }
  return { pass, checks };
}

/** Newest run per case and mode. */
export function latestByCase(runs: Run[]) {
  const out = new Map<string, { pipeline?: Run; baseline?: Run }>();
  for (const r of [...runs].sort((a, b) => b.createdAt - a.createdAt)) {
    if (!r.caseId) continue;
    const slot = out.get(r.caseId) ?? {};
    if (!slot[r.mode]) slot[r.mode] = r;
    out.set(r.caseId, slot);
  }
  return out;
}
