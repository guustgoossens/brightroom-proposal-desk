import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

const caseV = v.object({
  label: v.string(),
  text: v.string(),
  tags: v.optional(v.array(v.string())),
  expectedStatus: v.optional(v.string()),
  expectedTotal: v.optional(v.number()),
  note: v.optional(v.string()),
});

type CaseInput = Infer<typeof caseV>;

const strip = (c: CaseInput) => Object.fromEntries(Object.entries(c).filter(([, val]) => val !== undefined)) as CaseInput;

/** Upsert by label. Returns "inserted" | "updated". */
async function upsert(ctx: MutationCtx, c: CaseInput) {
  const existing = await ctx.db.query("cases").withIndex("by_label", (q) => q.eq("label", c.label)).first();
  if (existing) {
    // replace() so that removed optional fields (e.g. expectedTotal) are cleared too
    await ctx.db.replace(existing._id, strip(c));
    return "updated" as const;
  }
  await ctx.db.insert("cases", strip(c));
  return "inserted" as const;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("cases").collect();
    return all.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  },
});

export const add = mutation({
  args: caseV.fields,
  handler: async (ctx, c) => {
    const existing = await ctx.db.query("cases").withIndex("by_label", (q) => q.eq("label", c.label)).first();
    if (existing) throw new Error(`A case labelled "${c.label}" already exists`);
    return ctx.db.insert("cases", strip(c));
  },
});

export const importJson = mutation({
  args: { cases: v.array(caseV) },
  handler: async (ctx, { cases }) => {
    let inserted = 0, updated = 0;
    for (const c of cases) (await upsert(ctx, c)) === "inserted" ? inserted++ : updated++;
    return { inserted, updated };
  },
});

export const remove = mutation({
  args: { id: v.id("cases") },
  handler: (ctx, { id }) => ctx.db.delete(id),
});

/** Seeds the starter library. Pass the content of data/cases.json as `cases` (upsert by label). */
export const seedStarter = mutation({
  args: { cases: v.optional(v.array(caseV)) },
  handler: async (ctx, { cases }) => {
    if (!cases?.length) return { inserted: 0, updated: 0, note: "No cases passed: provide the content of data/cases.json as `cases`." };
    let inserted = 0, updated = 0;
    for (const c of cases) (await upsert(ctx, c)) === "inserted" ? inserted++ : updated++;
    return { inserted, updated };
  },
});
