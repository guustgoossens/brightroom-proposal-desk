"use node";
// Orchestrates the three lanes. Only actions live here (Node runtime, needed by the Anthropic SDK).
// Every stage writes a step BEFORE and AFTER it runs so the UI can stream progress.
// Contract: never throw out of the action without marking the run "error".
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { eur } from "./lib/catalogue";
import { evaluate } from "./lib/engine";
import { verifyDraft } from "./lib/verify";
import type { Audit, AuditIssue, Brief, Draft, EngineResult, JevResult } from "./lib/types";
import { auditDraft, extractBrief, finalizeAudit, hasAnthropicKey, runBaseline as baselineCall, writeDraft } from "./llm";
import { buildJevResult, computeAgreement, hasJevKey, jevPick, jevTriage, type JevTriageResult } from "./jev";

type Lane = "llm" | "jev" | "code";
const NO_KEY = "no key configured";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const upsert = (ctx: ActionCtx, runId: Id<"runs">, step: {
  key: string; title: string; lane: Lane; status: "running" | "done" | "skipped" | "error";
  startedAt: number; ms?: number; summary?: string; error?: string;
}) => ctx.runMutation(internal.runs.upsertStep, { runId, step });

const patch = (ctx: ActionCtx, runId: Id<"runs">, p: Record<string, unknown>) =>
  ctx.runMutation(internal.runs.patchRun, { runId, ...p });

/** Runs `fn` as a visible step. Returns the value, or null if it threw (step is marked error). */
async function runStep<T>(
  ctx: ActionCtx, runId: Id<"runs">, key: string, title: string, lane: Lane,
  fn: () => Promise<{ value: T; summary: string }>,
): Promise<T | null> {
  const startedAt = Date.now();
  await upsert(ctx, runId, { key, title, lane, status: "running", startedAt });
  try {
    const { value, summary } = await fn();
    await upsert(ctx, runId, { key, title, lane, status: "done", startedAt, ms: Date.now() - startedAt, summary });
    return value;
  } catch (e) {
    const m = errMsg(e);
    await upsert(ctx, runId, { key, title, lane, status: "error", startedAt, ms: Date.now() - startedAt, summary: m.slice(0, 160), error: m });
    return null;
  }
}

const skip = (ctx: ActionCtx, runId: Id<"runs">, key: string, title: string, lane: Lane, summary: string) =>
  upsert(ctx, runId, { key, title, lane, status: "skipped", startedAt: Date.now(), ms: 0, summary });

const toIssues = (engine: EngineResult, draft: Draft, budgetEur: number | null): AuditIssue[] =>
  verifyDraft({ kind: draft.kind, subject: draft.subject, body: draft.body }, engine, { budgetEur }).map((i) => ({
    source: "code" as const, severity: i.severity, message: i.message,
  }));

async function failRun(ctx: ActionCtx, runId: Id<"runs">, message: string) {
  try {
    const run = await ctx.runQuery(internal.runs.getInternal, { id: runId });
    for (const s of run?.steps ?? []) {
      if (s.status === "running") {
        await upsert(ctx, runId, { ...s, status: "error", ms: Date.now() - s.startedAt, error: message, summary: message.slice(0, 160) });
      }
    }
  } catch { /* best effort */ }
  await patch(ctx, runId, { status: "error", error: message, finishedAt: Date.now() });
}

// ---------------------------------------------------------------------------- pipeline
async function pipeline(ctx: ActionCtx, runId: Id<"runs">, briefOverride?: Brief) {
  const run = await ctx.runQuery(internal.runs.getInternal, { id: runId });
  if (!run) return;
  const text = run.text;

  // Stage 1: extract (LLM) and triage (Jev) in parallel.
  const extract = async (): Promise<Brief | null> => {
    if (briefOverride) {
      await skip(ctx, runId, "extract", "Extract brief", "llm", "brief supplied directly (test hook)");
      return briefOverride;
    }
    if (!hasAnthropicKey()) {
      await skip(ctx, runId, "extract", "Extract brief", "llm", NO_KEY);
      return null;
    }
    return runStep(ctx, runId, "extract", "Extract brief", "llm", async () => {
      const b = await extractBrief(text);
      return {
        value: b,
        summary: `${b.headcount ?? "?"} people, ${b.services.map((s) => `${s.id}${s.need === "preferred" ? "?" : ""}`).join("+") || "no services"}, ${b.missing.length} missing`,
      };
    });
  };

  const triage = async (): Promise<JevTriageResult | null> => {
    if (!hasJevKey()) {
      await skip(ctx, runId, "jev_triage", "Jev triage and hardness", "jev", NO_KEY);
      return null;
    }
    return runStep(ctx, runId, "jev_triage", "Jev triage and hardness", "jev", async () => {
      const j = await jevTriage(text);
      return { value: j, summary: `${j.triage.choice} (${j.triage.confidence.toFixed(2)}), pressure p=${j.pressure.probability.toFixed(2)}` };
    });
  };

  const [brief, jevT] = await Promise.all([extract(), triage()]);
  if (brief) await patch(ctx, runId, { brief });
  if (jevT) await patch(ctx, runId, { jev: buildJevResult(jevT, []) });

  if (!brief) {
    const why = hasAnthropicKey() && !briefOverride
      ? "Brief extraction failed (see the extract step), so the engine cannot run."
      : "ANTHROPIC_API_KEY is not configured: no brief could be extracted, so the engine cannot run.";
    await skip(ctx, runId, "engine", "Price and verify (code)", "code", "no brief");
    await failRun(ctx, runId, why);
    return;
  }

  // Stage 2: engine (code) + agreement.
  const engine = await runStep(ctx, runId, "engine", "Price and verify (code)", "code", async () => {
    const e = evaluate(brief);
    return {
      value: e,
      summary: `${e.status}${e.package ? `, total ${eur(e.package.total)}${e.totalVerified ? " verified" : " NOT verified"}` : ""}${e.alternatives.length ? `, ${e.alternatives.length} alternatives` : ""}`,
    };
  });
  if (!engine) { await failRun(ctx, runId, "Engine failed (see the engine step)."); return; }
  await patch(ctx, runId, { engine });

  let jev: JevResult | null = null;
  if (jevT) {
    jev = buildJevResult(jevT, computeAgreement(brief, engine, jevT));
    await patch(ctx, runId, { jev });
  }

  // Stage 3: Jev picks among alternatives.
  if (engine.alternatives.length >= 2) {
    if (!hasJevKey()) {
      await skip(ctx, runId, "jev_pick", "Jev picks an alternative", "jev", NO_KEY);
    } else {
      const picked = await runStep(ctx, runId, "jev_pick", "Jev picks an alternative", "jev", async () => {
        const p = await jevPick(text, engine.alternatives);
        return { value: p, summary: `${p.pick.altId} (${p.pick.confidence.toFixed(2)})` };
      });
      if (picked && jevT) {
        jev = buildJevResult(jevT, computeAgreement(brief, engine, jevT), picked);
        await patch(ctx, runId, { jev });
      }
    }
  }

  // Stage 4: writer (LLM) from engine facts only.
  if (!hasAnthropicKey()) {
    await skip(ctx, runId, "write", "Write draft", "llm", NO_KEY);
    await skip(ctx, runId, "audit", "Verify draft (code)", "code", "no draft");
    await patch(ctx, runId, { status: "done", finishedAt: Date.now() });
    return;
  }
  let draft = await runStep(ctx, runId, "write", "Write draft", "llm", async () => {
    const d = await writeDraft(brief, engine);
    return { value: d, summary: `${d.kind}, ${d.body.length} chars` };
  });
  if (!draft) {
    await skip(ctx, runId, "audit", "Verify draft (code)", "code", "no draft");
    await failRun(ctx, runId, "Writer failed (see the write step).");
    return;
  }
  await patch(ctx, runId, { draft });

  // Stage 5: deterministic verification, one revision if blocked, then LLM auditor.
  let issues = (await runStep(ctx, runId, "audit", "Verify draft (code)", "code", async () => {
    const i = toIssues(engine, draft!, brief.budgetEur);
    return { value: i, summary: i.length ? `${i.filter((x) => x.severity === "block").length} block, ${i.filter((x) => x.severity === "warn").length} warn` : "no issues" };
  })) ?? [];
  let revised = false;
  let firstPass: AuditIssue[] | undefined;

  if (issues.some((i) => i.severity === "block")) {
    const previous = draft;
    const blocking = issues;
    firstPass = issues.filter((i) => i.severity === "block");
    const d2 = await runStep(ctx, runId, "revise", "Writer revises draft", "llm", async () => {
      const d = await writeDraft(brief, engine, { previous, issues: blocking });
      return { value: d, summary: "revised once after code checks" };
    });
    if (d2) {
      draft = d2;
      revised = true;
      issues = toIssues(engine, draft, brief.budgetEur);
      await patch(ctx, runId, { draft });
    }
  }
  await patch(ctx, runId, { audit: finalizeAudit(issues, revised, firstPass) });

  const finalDraft = draft;
  const llmIssues = await runStep(ctx, runId, "audit_llm", "Audit draft (LLM)", "llm", async () => {
    const i = await auditDraft(finalDraft, engine, brief);
    return { value: i, summary: i.length ? `${i.length} issue(s)` : "clean" };
  });
  const audit: Audit = finalizeAudit([...issues, ...(llmIssues ?? [])], revised, firstPass);
  await patch(ctx, runId, { audit, status: "done", finishedAt: Date.now() });
}

export const run = internalAction({
  args: { runId: v.id("runs"), briefOverride: v.optional(v.any()) },
  handler: async (ctx, { runId, briefOverride }) => {
    try {
      await pipeline(ctx, runId, briefOverride as Brief | undefined);
    } catch (e) {
      await failRun(ctx, runId, `Pipeline crashed: ${errMsg(e)}`);
    }
  },
});

// ---------------------------------------------------------------------------- baseline

export const runBaseline = internalAction({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    try {
      const run = await ctx.runQuery(internal.runs.getInternal, { id: runId });
      if (!run) return;
      if (!hasAnthropicKey()) {
        await skip(ctx, runId, "baseline", "Single-prompt baseline", "llm", NO_KEY);
        await failRun(ctx, runId, "ANTHROPIC_API_KEY is not configured: the baseline cannot run.");
        return;
      }
      const out = await runStep(ctx, runId, "baseline", "Single-prompt baseline", "llm", async () => {
        const b = await baselineCall(run.text);
        return { value: b, summary: `claims total ${b.claimedTotal == null ? "none" : eur(b.claimedTotal)}, feasible ${b.claimedFeasible ?? "unclear"}` };
      });
      if (!out) { await failRun(ctx, runId, "Baseline failed (see the baseline step)."); return; }
      await patch(ctx, runId, { baseline: out, status: "done", finishedAt: Date.now() });
    } catch (e) {
      await failRun(ctx, runId, `Baseline crashed: ${errMsg(e)}`);
    }
  },
});
