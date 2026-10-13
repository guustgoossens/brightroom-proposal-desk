import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Test/enquiry library. Loaded from JSON or typed into a form.
  cases: defineTable({
    label: v.string(), // "Q1", "V3-vegan-lunch", ...
    text: v.string(),
    tags: v.optional(v.array(v.string())), // "routine" | "missing-info" | "difficult" | "variation"
    expectedStatus: v.optional(v.string()), // Status from convex/lib/types.ts
    expectedTotal: v.optional(v.number()), // expected package total in EUR (omit when none)
    note: v.optional(v.string()),
  }).index("by_label", ["label"]),

  // One processing run of one enquiry. Steps are appended live so the UI can show the pipeline filling in.
  runs: defineTable({
    caseId: v.optional(v.id("cases")),
    label: v.string(),
    text: v.string(),
    mode: v.union(v.literal("pipeline"), v.literal("baseline")), // baseline = single prompt, no code, no Jev
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    steps: v.array(v.object({
      key: v.string(), // "extract" | "jev_triage" | "engine" | "write" | "audit" | "jev_pick" | "baseline"
      title: v.string(),
      lane: v.union(v.literal("llm"), v.literal("jev"), v.literal("code")),
      status: v.union(v.literal("running"), v.literal("done"), v.literal("skipped"), v.literal("error")),
      startedAt: v.number(),
      ms: v.optional(v.number()),
      summary: v.optional(v.string()),
      error: v.optional(v.string()),
    })),
    brief: v.optional(v.any()),   // Brief            (llm: extractor)
    jev: v.optional(v.any()),     // JevResult        (jev lane)
    engine: v.optional(v.any()),  // EngineResult     (code lane)
    draft: v.optional(v.any()),   // Draft            (llm: writer)
    audit: v.optional(v.any()),   // Audit            (code checks + llm auditor)
    baseline: v.optional(v.any()),// BaselineOutput   (mode "baseline" only)
    error: v.optional(v.string()),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  }).index("by_createdAt", ["createdAt"]).index("by_case", ["caseId"]),
});
