import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const modeV = v.union(v.literal("pipeline"), v.literal("baseline"));

const stepV = v.object({
  key: v.string(),
  title: v.string(),
  lane: v.union(v.literal("llm"), v.literal("jev"), v.literal("code")),
  status: v.union(v.literal("running"), v.literal("done"), v.literal("skipped"), v.literal("error")),
  startedAt: v.number(),
  ms: v.optional(v.number()),
  summary: v.optional(v.string()),
  error: v.optional(v.string()),
});

// ---------------------------------------------------------------- public API (CONTRACT.md)
export const list = query({
  args: {},
  handler: (ctx) => ctx.db.query("runs").withIndex("by_createdAt").order("desc").take(100),
});

export const get = query({
  args: { id: v.id("runs") },
  handler: (ctx, { id }) => ctx.db.get(id),
});

async function startOne(
  ctx: MutationCtx,
  a: { label: string; text: string; mode: "pipeline" | "baseline"; caseId?: Id<"cases"> },
  delayMs: number,
): Promise<Id<"runs">> {
  const id = await ctx.db.insert("runs", {
    caseId: a.caseId, label: a.label, text: a.text, mode: a.mode,
    status: "running", steps: [], createdAt: Date.now(),
  });
  const fn = a.mode === "baseline" ? internal.pipeline.runBaseline : internal.pipeline.run;
  await ctx.scheduler.runAfter(delayMs, fn, { runId: id });
  return id;
}

export const start = mutation({
  args: { label: v.string(), text: v.string(), mode: v.optional(modeV), caseId: v.optional(v.id("cases")) },
  handler: (ctx, a) => startOne(ctx, { label: a.label, text: a.text, mode: a.mode ?? "pipeline", caseId: a.caseId }, 0),
});

/** Starts one run per case (staggered a little to be gentle on API rate limits). */
/** Deletes every run whose label matches (cleanup of ad-hoc test runs). */
export const removeByLabel = mutation({
  args: { label: v.string() },
  handler: async (ctx, { label }) => {
    const all = await ctx.db.query("runs").collect();
    const hit = all.filter((r) => r.label === label);
    for (const r of hit) await ctx.db.delete(r._id);
    return hit.length;
  },
});

export const evaluateAll = mutation({
  args: { mode: v.optional(modeV) },
  handler: async (ctx, { mode }) => {
    const cases = await ctx.db.query("cases").collect();
    const ids: Id<"runs">[] = [];
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      ids.push(await startOne(ctx, { label: c.label, text: c.text, mode: mode ?? "pipeline", caseId: c._id }, i * 400));
    }
    return ids;
  },
});

// ---------------------------------------------------------------- internal (used by pipeline.ts)
export const getInternal = internalQuery({
  args: { id: v.id("runs") },
  handler: (ctx, { id }) => ctx.db.get(id),
});

export const patchRun = internalMutation({
  args: {
    runId: v.id("runs"),
    status: v.optional(v.union(v.literal("running"), v.literal("done"), v.literal("error"))),
    brief: v.optional(v.any()),
    jev: v.optional(v.any()),
    engine: v.optional(v.any()),
    draft: v.optional(v.any()),
    audit: v.optional(v.any()),
    baseline: v.optional(v.any()),
    error: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
  },
  handler: async (ctx, { runId, ...patch }) => {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, val]) => val !== undefined));
    await ctx.db.patch(runId, clean);
  },
});

/** Insert or replace a step by key so the UI can stream the timeline. */
export const upsertStep = internalMutation({
  args: { runId: v.id("runs"), step: stepV },
  handler: async (ctx, { runId, step }) => {
    const run = await ctx.db.get(runId);
    if (!run) return;
    const steps = [...run.steps];
    const i = steps.findIndex((s) => s.key === step.key);
    if (i >= 0) steps[i] = step;
    else steps.push(step);
    await ctx.db.patch(runId, { steps });
  },
});
