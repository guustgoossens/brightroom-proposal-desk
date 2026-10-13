"use node";
// Jev lane: TypeSafe Jev ("System One" typed decision API) via the official SDK, plus the JevResult builder.
// Env (Convex deployment env): TYPESAFE_API_KEY (or JEV_API_KEY), optional TYPESAFE_BASE_URL, JEV_MODEL.
import { v } from "convex/values";
import { TypeSafeClient, choice, noul } from "@typesafe-ai/sdk";
import { action } from "./_generated/server";
import type { Alternative, Brief, EngineResult, HardnessKey, JevAgreement, JevResult, TriageChoice } from "./lib/types";

const apiKey = () => process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || undefined;
export const hasJevKey = () => !!apiKey();

let _client: TypeSafeClient | null = null;
const client = () =>
  (_client ??= new TypeSafeClient({
    apiKey: apiKey(),
    baseURL: process.env.TYPESAFE_BASE_URL || undefined,
    defaultModel: process.env.JEV_MODEL || undefined, // default: jev-latest
    timeout: 20000,
  }));

const HARDNESS_KEYS: HardnessKey[] = ["S1", "S2", "S3", "S4", "wheelchair"];
const HARDNESS_LABEL: Record<HardnessKey, string> = {
  S1: "a coffee break for every attendee",
  S2: "lunch for every attendee",
  S3: "a projector",
  S4: "a facilitator",
  wheelchair: "wheelchair-accessible (step-free) access",
};

const stateFor = (text: string) =>
  `Enquiry received by BrightRoom, a small company renting meeting rooms (Studio, Loft) with optional coffee break, lunch, projector and facilitator:\n"""\n${text}\n"""`;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const probsOf = (p: Readonly<Record<string, number>>): Record<string, number> =>
  Object.fromEntries(Object.entries(p).map(([k, x]) => [k, clamp01(x)]));

function triageQuestions() {
  return {
    triage: choice("Triage this enquiry: how complete is it for pricing a proposal?", {
      complete: "headcount, duration, budget and services are all stated",
      provisional_ok: "headcount is stated but something else (duration, budget, services, accessibility) is missing",
      needs_clarification: "headcount is missing",
    }),
    pressure: noul("Does the client demand an immediate commitment from us, such as confirming or booking today?"),
    hardness_S1: noul(`Is ${HARDNESS_LABEL.S1} a hard requirement for the client rather than a nice-to-have? If the enquiry does not mention it, the answer should be low.`),
    hardness_S2: noul(`Is ${HARDNESS_LABEL.S2} a hard requirement for the client rather than a nice-to-have? If the enquiry does not mention it, the answer should be low.`),
    hardness_S3: noul(`Is ${HARDNESS_LABEL.S3} a hard requirement for the client rather than a nice-to-have? If the enquiry does not mention it, the answer should be low.`),
    hardness_S4: noul(`Is ${HARDNESS_LABEL.S4} a hard requirement for the client rather than a nice-to-have? If the enquiry does not mention it, the answer should be low.`),
    hardness_wheelchair: noul(`Is ${HARDNESS_LABEL.wheelchair} a hard requirement for the client rather than a nice-to-have? If the enquiry does not mention it, the answer should be low.`),
  };
}

export interface JevTriageResult {
  model: string;
  latencyMs: number;
  triage: JevResult["triage"];
  pressure: JevResult["pressure"];
  hardness: JevResult["hardness"];
}

/** One request: triage + pressure + hardness x5. */
export async function jevTriage(text: string): Promise<JevTriageResult> {
  const t0 = Date.now();
  const r = await client().systemOne({ state: stateFor(text), questions: triageQuestions() });
  const latencyMs = Date.now() - t0;
  const a = r.answers;
  return {
    model: r.model,
    latencyMs,
    triage: { choice: a.triage.choice as TriageChoice, confidence: clamp01(a.triage.confidence), probs: probsOf(a.triage.probabilities) },
    pressure: { probability: clamp01(a.pressure.noul) },
    hardness: {
      S1: { probability: clamp01(a.hardness_S1.noul) },
      S2: { probability: clamp01(a.hardness_S2.noul) },
      S3: { probability: clamp01(a.hardness_S3.noul) },
      S4: { probability: clamp01(a.hardness_S4.noul) },
      wheelchair: { probability: clamp01(a.hardness_wheelchair.noul) },
    },
  };
}

/** Choice among engine alternatives, given the client text and each alternative's trade-offs. */
export async function jevPick(text: string, alts: Alternative[]): Promise<{ pick: NonNullable<JevResult["pick"]>; latencyMs: number }> {
  const describe = (a: Alternative) =>
    `${a.title}; total EUR ${a.package.total}${a.withinBudget == null ? "" : a.withinBudget ? " (within budget)" : " (over budget)"}; trade-offs: ${a.relaxations.map((x) => x.tradeoff).join(" ") || "none"}`;
  const criteria = Object.fromEntries(alts.map((a) => [a.id, describe(a)]));
  const state = `${stateFor(text)}\n\nThe request cannot be met as asked. These alternatives exist:\n${alts.map((a) => `${a.id}: ${describe(a)}`).join("\n")}`;
  const t0 = Date.now();
  const r = await client().systemOne({
    state,
    questions: { pick: choice("Which alternative best fits the client's stated priorities and must-haves?", criteria) },
  });
  const p = r.answers.pick;
  return {
    pick: { altId: String(p.choice), confidence: clamp01(p.confidence), probs: probsOf(p.probabilities as Record<string, number>) },
    latencyMs: Date.now() - t0,
  };
}

// ------------------------------------------------------------------ agreement (computed in code)
const pct = (p: number) => p.toFixed(2);
const STATUS_TO_TRIAGE: Record<EngineResult["status"], TriageChoice> = {
  ready: "complete",
  provisional: "provisional_ok",
  needs_clarification: "needs_clarification",
  infeasible: "complete",
};

export function computeAgreement(brief: Brief, engine: EngineResult, j: JevTriageResult): JevAgreement[] {
  const out: JevAgreement[] = [];

  out.push({
    field: "triage",
    llm: `engine status ${engine.status} -> ${STATUS_TO_TRIAGE[engine.status]}`,
    jev: `${j.triage.choice} (${pct(j.triage.confidence)})`,
    agrees: j.triage.choice === STATUS_TO_TRIAGE[engine.status],
  });

  const asks = brief.commitmentAsks;
  const pressured = j.pressure.probability >= 0.5;
  out.push({
    field: "commitment pressure",
    llm: asks.length ? `asks: ${asks.join("; ")}` : "no commitment asked",
    jev: `p=${pct(j.pressure.probability)} ${pressured ? "demands commitment" : "no pressure"}`,
    agrees: pressured === asks.length > 0,
  });

  for (const id of ["S1", "S2", "S3", "S4"] as const) {
    const p = j.hardness[id].probability;
    const svc = brief.services.find((s) => s.id === id);
    if (!svc && p < 0.5) continue; // nothing to compare
    const hard = p >= 0.5;
    out.push({
      field: `${id} hardness`,
      llm: svc ? svc.need : "not requested",
      jev: `p=${pct(p)} ${hard ? "hard requirement" : "nice-to-have"}`,
      agrees: svc ? (svc.need === "required") === hard : false,
    });
  }

  const pw = j.hardness.wheelchair.probability;
  if (brief.wheelchair !== "unknown" || pw >= 0.5) {
    const hard = pw >= 0.5;
    out.push({
      field: "wheelchair hardness",
      llm: brief.wheelchair,
      jev: `p=${pct(pw)} ${hard ? "hard requirement" : "nice-to-have"}`,
      agrees: brief.wheelchair === "required" ? hard : brief.wheelchair === "unknown" ? false : !hard,
    });
  }
  return out;
}

export function buildJevResult(j: JevTriageResult, agreement: JevAgreement[], pick?: { pick: NonNullable<JevResult["pick"]>; latencyMs: number }): JevResult {
  return {
    model: j.model,
    latencyMs: j.latencyMs + (pick?.latencyMs ?? 0),
    triage: j.triage,
    pressure: j.pressure,
    hardness: j.hardness,
    ...(pick ? { pick: pick.pick } : {}),
    agreement,
  };
}

// ------------------------------------------------------------------ probe (public action)
/**
 * Sends one noul + one choice question through the SDK and returns the parsed answers, usage, model and latency.
 * Usage: bunx convex run jev:probe '{}'
 */
export const probe = action({
  args: { text: v.optional(v.string()) },
  handler: async (_ctx, { text }) => {
    if (!hasJevKey()) return { ok: false, error: "TYPESAFE_API_KEY is not set (bunx convex env set TYPESAFE_API_KEY ...)" };
    const sample = text ?? "We are 8 people and need a room for a 4-hour workshop next week with a projector. Budget 600 euro. Please confirm today.";
    try {
      const t0 = Date.now();
      const r = await client().systemOne({
        state: stateFor(sample),
        questions: {
          pressure: noul("Does the client demand an immediate commitment such as confirming today?"),
          triage: choice("How complete is this enquiry?", {
            complete: "headcount, duration, budget and services are all stated",
            provisional_ok: "headcount is stated but something else is missing",
            needs_clarification: "headcount is missing",
          }),
        },
      });
      return { ok: true, latencyMs: Date.now() - t0, model: r.model, answers: r.answers, usage: r.usage };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
});
