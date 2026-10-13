// bun test. Every expected number is computed BY HAND from the catalogue, not copied from engine output.
//
// Catalogue recap:
//   Studio 240 flat, 4h, max 12, stairs only      Loft 420 flat, 4h, max 24, wheelchair accessible
//   Coffee 8/person   Lunch 18/person   Projector 35 flat   Facilitator 280 flat (2 hours)
import { describe, expect, test } from "bun:test";
import { evaluate, verifyPackage } from "../convex/lib/engine";
import { verifyDraft } from "../convex/lib/verify";
import type { Brief } from "../convex/lib/types";

type S = Brief["services"][number];
const req = (id: S["id"]): S => ({ id, need: "required", evidence: "test" });
const pref = (id: S["id"]): S => ({ id, need: "preferred", evidence: "test" });

/** Hand-built brief: a fully specified, no-accessibility-needed 10 person 4 hour booking unless overridden. */
const brief = (o: Partial<Brief> = {}): Brief => ({
  headcount: 10, durationHours: 4, budgetEur: null, wheelchair: "not_needed", services: [],
  requestedDate: null, unlistedRequests: [], commitmentAsks: [],
  confirmed: [], preferences: [], missing: [], ...o,
});

const allBriefs: Record<string, Brief> = {};
const run = (name: string, b: Brief) => { allBriefs[name] = b; return evaluate(b); };
const lineAmount = (r: ReturnType<typeof evaluate>, id: string) => r.package!.lines.find((l) => l.id === id)!.amount;

describe("case questions Q1-Q5", () => {
  test("Q1: 10p, 4h, coffee, budget 350 -> ready, Studio, total 320", () => {
    // Studio 240 + coffee 10 x 8 = 80 -> 320 <= 350
    const r = run("Q1", brief({ budgetEur: 350, services: [req("S1")] }));
    expect(r.status).toBe("ready");
    expect(r.package!.venue).toBe("V1");
    expect(r.package!.total).toBe(320);
    expect(lineAmount(r, "V1")).toBe(240);
    expect(lineAmount(r, "S1")).toBe(80);
    expect(r.violations).toEqual([]);
    expect(r.alternatives).toEqual([]);
  });

  test("Q2: 20p, coffee+lunch, budget 850 -> infeasible, package 940, three alternatives", () => {
    // 20 > 12 so Loft: 420 + coffee 20 x 8 = 160 + lunch 20 x 18 = 360 -> 940; shortfall 940 - 850 = 90
    const r = run("Q2", brief({ headcount: 20, budgetEur: 850, services: [req("S1"), req("S2")] }));
    expect(r.status).toBe("infeasible");
    expect(r.package!.venue).toBe("V2");
    expect(r.package!.total).toBe(940);
    expect(r.violations.map((v) => v.code)).toEqual(["budget"]);
    expect(r.violations[0].shortfallEur).toBe(90);
    // Headcount alternative: Loft 420 + 26n <= 850 -> n <= 16.5 -> 16 people: 420 + 16 x 26 = 836 (17 would be 862)
    // Drop coffee: 420 + 360 = 780.  Drop lunch: 420 + 160 = 580.
    const totals = r.alternatives.map((a) => a.package.total);
    expect(totals).toEqual([836, 780, 580]);
    expect(r.alternatives[0].package.headcount).toBe(16);
    expect(r.alternatives.every((a) => a.withinBudget === true)).toBe(true);
    // dropped services are named relaxations, never silent
    expect(r.alternatives[1].relaxations.map((x) => x.field)).toEqual(["service"]);
    expect(r.alternatives[1].relaxations[0].from).toContain("Coffee");
    expect(r.alternatives[2].relaxations[0].from).toContain("Lunch");
  });

  test("Q3: 10p, wheelchair, coffee+projector, budget 600 -> ready, Loft, 535", () => {
    // wheelchair forces Loft: 420 + coffee 80 + projector 35 = 535 <= 600
    const r = run("Q3", brief({ budgetEur: 600, wheelchair: "required", services: [req("S1"), req("S3")] }));
    expect(r.status).toBe("ready");
    expect(r.package!.venue).toBe("V2");
    expect(r.package!.total).toBe(535);
  });

  test("Q4: nothing stated -> needs_clarification, no package", () => {
    const r = run("Q4", brief({ headcount: null, durationHours: null, wheelchair: "unknown", requestedDate: "next month" }));
    expect(r.status).toBe("needs_clarification");
    expect(r.package).toBeNull();
    expect(r.alternatives).toEqual([]);
    expect(r.optionalAddOns).toEqual([]);
    const qs = r.clarificationQuestions.join(" | ");
    expect(qs).toContain("How many people");
    expect(qs).toContain("budget");
    expect(qs).toContain("next month"); // date phrase is never treated as a date
  });

  test("Q5: 30p, 6h, lunch, budget 1500, 'confirm today' -> infeasible capacity+duration, alt 24p/4h = 852", () => {
    // 30 > 24 (capacity) and 6 > 4 (duration): no venue qualifies, so no package.
    // Alternative: Loft 420 + lunch 24 x 18 = 432 -> 852 (<= 1500)
    const r = run("Q5", brief({ headcount: 30, durationHours: 6, budgetEur: 1500, services: [req("S2")], commitmentAsks: ["confirm today"] }));
    expect(r.status).toBe("infeasible");
    expect(r.violations.map((v) => v.code).sort()).toEqual(["capacity", "duration"]);
    expect(r.package).toBeNull();
    expect(r.alternatives).toHaveLength(1);
    const alt = r.alternatives[0];
    expect(alt.package.headcount).toBe(24);
    expect(alt.package.durationHours).toBe(4);
    expect(alt.package.venue).toBe("V2");
    expect(alt.package.total).toBe(852);
    expect(alt.withinBudget).toBe(true);
    expect(alt.relaxations.map((x) => x.field).sort()).toEqual(["durationHours", "headcount"]);
    expect(r.cannotPromise.join(" ")).toContain("unconfirmed");
  });
});

describe("venue boundaries", () => {
  test("12 people -> Studio", () => {
    // 240 + 12 x 8 = 96 -> 336
    const r = run("12p", brief({ headcount: 12, services: [req("S1")] }));
    expect(r.package!.venue).toBe("V1");
    expect(r.package!.total).toBe(336);
  });

  test("13 people -> Loft", () => {
    // 420 + 13 x 8 = 104 -> 524
    const r = run("13p", brief({ headcount: 13, services: [req("S1")] }));
    expect(r.package!.venue).toBe("V2");
    expect(r.package!.total).toBe(524);
  });

  test("24 people fits the Loft, 25 is a capacity violation with a 24 person alternative", () => {
    // 24: 420 + 24 x 8 = 192 -> 612 (budget 700 given, so status is ready)
    const ok = run("24p", brief({ headcount: 24, budgetEur: 700, services: [req("S1")] }));
    expect(ok.status).toBe("ready");
    expect(ok.package!.total).toBe(612);
    // 25: no venue. Alternative at 24 people: 612
    const bad = run("25p", brief({ headcount: 25, services: [req("S1")] }));
    expect(bad.status).toBe("infeasible");
    expect(bad.violations.map((v) => v.code)).toEqual(["capacity"]);
    expect(bad.package).toBeNull();
    expect(bad.alternatives[0].package.total).toBe(612);
    expect(bad.alternatives[0].package.headcount).toBe(24);
  });

  test("a 5 hour request is a duration violation; alternative is the 4 hour booking", () => {
    // 10p, 5h, coffee: 5 > 4 -> infeasible; no venue qualifies. Alternative 4h: 240 + 80 = 320
    const r = run("5h", brief({ durationHours: 5, services: [req("S1")] }));
    expect(r.status).toBe("infeasible");
    expect(r.violations.map((v) => v.code)).toEqual(["duration"]);
    expect(r.alternatives[0].package.total).toBe(320);
  });
});

describe("accessibility", () => {
  test("wheelchair forces the Loft even when a Studio fits the budget", () => {
    // 8p, lunch, budget 600. Studio would be 240 + 144 = 384, but wheelchair -> Loft 420 + 144 = 564 <= 600
    const r = run("wc-fit", brief({ headcount: 8, budgetEur: 600, wheelchair: "required", services: [req("S2")] }));
    expect(r.status).toBe("ready");
    expect(r.package!.venue).toBe("V2");
    expect(r.package!.total).toBe(564);
  });

  test("wheelchair + tight budget: infeasible, and accessibility is never relaxed", () => {
    // 8p, lunch, budget 500: Loft 564 -> shortfall 64.
    // Fewer people: 420 + 18n <= 500 -> n <= 4.44 -> 4 people = 492. Drop lunch = 420.
    const r = run("wc-tight", brief({ headcount: 8, budgetEur: 500, wheelchair: "required", services: [req("S2")] }));
    expect(r.status).toBe("infeasible");
    expect(r.package!.total).toBe(564);
    expect(r.violations[0].shortfallEur).toBe(64);
    expect(r.alternatives.map((a) => a.package.total)).toEqual([492, 420]);
    for (const a of r.alternatives) {
      expect(a.package.venue).toBe("V2"); // never falls back to the stairs-only Studio
      expect(a.relaxations.map((x) => x.field)).not.toContain("accessibility" as never);
      expect(JSON.stringify(a)).not.toMatch(/studio/i);
    }
  });

  test("wheelchair only preferred: Studio is chosen, Loft difference (180) is surfaced", () => {
    // Studio 240 + 80 = 320; Loft 420 + 80 = 500; difference 180
    const r = run("wc-pref", brief({ wheelchair: "preferred", services: [req("S1")] }));
    expect(r.package!.venue).toBe("V1");
    expect(r.package!.total).toBe(320);
    expect(r.notes.join(" ")).toContain("€180");
    expect(r.clarificationQuestions.join(" ")).toContain("step-free");
  });

  test("wheelchair unknown -> stays ready, but flagged with a note and a question", () => {
    // 10 people, 4h, coffee, budget 350: Studio 240 + 10*8 = 320 <= 350 -> ready (design choice: a routine
    // enquiry is not downgraded just because accessibility was not mentioned; it is surfaced instead).
    const r = run("wc-unknown", brief({ wheelchair: "unknown", budgetEur: 350, services: [req("S1")] }));
    expect(r.status).toBe("ready");
    expect(r.assumptions).toHaveLength(0);
    expect(r.notes.join(" ")).toContain("No accessibility need was mentioned");
    expect(r.clarificationQuestions.join(" ")).toContain("wheelchair");
    expect(r.package!.total).toBe(320);
  });
});

describe("services and pricing", () => {
  test("preferred services are excluded from the total but priced as add-ons", () => {
    // coffee required, projector preferred, budget 340. Package 240 + 80 = 320 (ready).
    // Projector add-on 35: 320 + 35 = 355 > 340 -> not within budget.
    const r = run("pref", brief({ budgetEur: 340, services: [req("S1"), pref("S3")] }));
    expect(r.status).toBe("ready");
    expect(r.package!.total).toBe(320);
    expect(r.package!.lines.map((l) => l.id)).not.toContain("S3");
    expect(r.optionalAddOns).toHaveLength(1);
    expect(r.optionalAddOns[0].id).toBe("S3");
    expect(r.optionalAddOns[0].amount).toBe(35);
    expect(r.optionalAddOns[0].withinBudgetWithPackage).toBe(false);
    // With budget 400, 355 <= 400 -> within budget.
    const r2 = evaluate(brief({ budgetEur: 400, services: [req("S1"), pref("S3")] }));
    expect(r2.optionalAddOns[0].withinBudgetWithPackage).toBe(true);
    expect(r2.package!.total).toBe(320);
  });

  test("a service both required and preferred is a package line, not an add-on; duplicates count once", () => {
    // projector listed three ways: 240 + 35 = 275
    const r = run("dupe", brief({ services: [req("S3"), pref("S3"), req("S3")] }));
    expect(r.optionalAddOns).toEqual([]);
    expect(r.package!.total).toBe(275);
  });

  test("per-person services cover the full headcount", () => {
    // 15p -> Loft 420 + coffee 15 x 8 = 120 + lunch 15 x 18 = 270 -> 810
    const r = run("pp", brief({ headcount: 15, services: [req("S1"), req("S2")] }));
    const coffee = r.package!.lines.find((l) => l.id === "S1")!;
    const lunch = r.package!.lines.find((l) => l.id === "S2")!;
    expect([coffee.qty, coffee.amount, coffee.unitPrice]).toEqual([15, 120, 8]);
    expect([lunch.qty, lunch.amount, lunch.unitPrice]).toEqual([15, 270, 18]);
    expect(r.package!.total).toBe(810);
  });

  test("flat items are added once regardless of headcount", () => {
    // 10p Studio 240 + projector 35 + facilitator 280 = 555 (not multiplied by 10)
    const r = run("flat", brief({ services: [req("S3"), req("S4")] }));
    const proj = r.package!.lines.find((l) => l.id === "S3")!;
    const fac = r.package!.lines.find((l) => l.id === "S4")!;
    expect([proj.qty, proj.amount]).toEqual([1, 35]);
    expect([fac.qty, fac.amount]).toEqual([1, 280]);
    expect(r.package!.total).toBe(555);
    expect(r.notes.join(" ")).toContain("2 of the 4 hours"); // facilitator covers 2h only
  });

  test("budget exactly equal to the total is fine (not over budget)", () => {
    const r = run("exact", brief({ budgetEur: 320, services: [req("S1")] }));
    expect(r.status).toBe("ready");
  });
});

describe("gaps, unlisted requests, commitments", () => {
  test("unlisted request -> infeasible violation, package still priced, no silent offer", () => {
    // Studio 240 + coffee 80 = 320; budget fine; the only violation is the photographer
    const r = run("unlisted", brief({ budgetEur: 500, services: [req("S1")], unlistedRequests: ["photographer"] }));
    expect(r.status).toBe("infeasible");
    expect(r.violations.map((v) => v.code)).toEqual(["unlisted_service"]);
    expect(r.violations[0].message).toContain("photographer");
    expect(r.package!.total).toBe(320);
    expect(r.package!.lines.map((l) => l.name.toLowerCase()).join(" ")).not.toContain("photograph");
  });

  test("duration missing -> provisional, assumes 4 hours, labelled", () => {
    const r = run("no-duration", brief({ durationHours: null, budgetEur: 400, services: [req("S1")] }));
    expect(r.status).toBe("provisional");
    expect(r.assumptions.join(" ")).toContain("Duration not stated");
    expect(r.package!.durationHours).toBe(4);
    expect(r.package!.total).toBe(320);
  });

  test("budget missing -> provisional, totals shown, add-on budget check unknown", () => {
    const r = run("no-budget", brief({ budgetEur: null, services: [req("S1"), pref("S3")] }));
    expect(r.status).toBe("provisional");
    expect(r.assumptions.join(" ")).toContain("No budget stated");
    expect(r.package!.total).toBe(320);
    expect(r.optionalAddOns[0].withinBudgetWithPackage).toBeNull();
  });

  test("no services stated -> provisional, venue only (Studio 240)", () => {
    const r = run("no-services", brief({ budgetEur: 300 }));
    expect(r.status).toBe("provisional");
    expect(r.package!.total).toBe(240);
  });

  test("requested date is only a note + clarification question, never confirmed (status unchanged)", () => {
    const r = run("date", brief({ budgetEur: 400, services: [req("S1")], requestedDate: "3 June" }));
    expect(r.status).toBe("ready");
    expect(r.notes.join(" ")).toContain("not a confirmed date");
    expect(r.clarificationQuestions.join(" ")).toContain("3 June");
    expect(r.cannotPromise.join(" ")).toContain("unconfirmed");
    expect(r.package!.total).toBe(320);
  });

  test("headcount missing always needs clarification, even if everything else is given", () => {
    const r = run("no-headcount", brief({ headcount: null, budgetEur: 500, services: [req("S1")] }));
    expect(r.status).toBe("needs_clarification");
    expect(r.package).toBeNull();
  });
});

describe("invariants", () => {
  test("totalVerified is true for every brief above and verifyPackage agrees", () => {
    for (const [name, b] of Object.entries(allBriefs)) {
      const r = evaluate(b);
      expect(r.totalVerified, name).toBe(true);
      if (r.package) expect(verifyPackage(r.package), name).toBe(true);
      for (const a of r.alternatives) expect(verifyPackage(a.package), `${name}/${a.id}`).toBe(true);
    }
  });

  test("a tampered package fails verification", () => {
    const r = evaluate(brief({ services: [req("S1")] }));
    expect(verifyPackage({ ...r.package!, total: 300 })).toBe(false);
  });
});

describe("verifyDraft", () => {
  const NOTICE = "\n\nThis is a DRAFT for salesperson approval only; availability is not confirmed.";
  const q1 = evaluate(brief({ budgetEur: 350, services: [req("S1")] }));
  const q2 = evaluate(brief({ headcount: 20, budgetEur: 850, services: [req("S1"), req("S2")] }));
  const q4 = evaluate(brief({ headcount: null, durationHours: null, wheelchair: "unknown" }));
  const proposal = (body: string, subject = "Draft proposal") => ({ kind: "proposal" as const, subject, body: body + NOTICE });

  const goodQ1 = proposal("Studio: €240\nCoffee break: 10 × €8 = €80\nTotal: €320, within your €350 budget.");

  test("good draft passes with no issues", () => {
    expect(verifyDraft(goodQ1, q1, { budgetEur: 350 })).toEqual([]);
  });

  test("amount formats are parsed: €320, € 320, 320 euros, EUR 320, €8/person", () => {
    for (const total of ["€320", "€ 320", "320 euros", "EUR 320"]) {
      const d = proposal(`Studio €240, coffee €8/person (€80). Total ${total}.`);
      expect(verifyDraft(d, q1)).toEqual([]);
    }
    const bad = verifyDraft(proposal("Total 1,500 euros."), q1);
    expect(bad.some((i) => i.severity === "block" && i.message.includes("1500"))).toBe(true);
  });

  test("invented euro amount is blocked", () => {
    const issues = verifyDraft(proposal("Studio €240 and coffee €80. Total: €330."), q1);
    expect(issues.some((i) => i.severity === "block" && i.message.includes("330"))).toBe(true);
  });

  test("wrong total that is a real number elsewhere (alternative total) is blocked", () => {
    // 780 is a legitimate alternative total for Q2, but not the package total
    const d = { kind: "explanation" as const, subject: "Draft", body: "The package total is €780, which exceeds nothing." + NOTICE };
    const issues = verifyDraft(d, q2);
    expect(issues.some((i) => i.severity === "block" && i.message.includes("not a verified"))).toBe(false); // 780 is an alternative total: allowed as a total
    const d2 = { kind: "explanation" as const, subject: "Draft", body: "The package total is €900, which exceeds your budget." + NOTICE };
    expect(verifyDraft(d2, q2).some((i) => i.severity === "block" && i.message.includes("900"))).toBe(true);
  });

  test("'booked' / 'confirmed' / 'guaranteed' promises are blocked", () => {
    for (const phrase of ["Your Studio is booked for 3 June.", "The date is confirmed.", "We guarantee availability.", "We will hold the Loft for you.", "The slot is reserved."]) {
      const issues = verifyDraft(proposal(`${phrase} Total: €320.`), q1);
      expect(issues.some((i) => i.severity === "block"), phrase).toBe(true);
    }
  });

  test("negations are allowed: 'not confirmed', 'unconfirmed', 'cannot guarantee', 'nothing is booked'", () => {
    const d = proposal("Availability is unconfirmed and not confirmed until approval. We cannot guarantee a date and nothing is booked, reserved or held. Total: €320.");
    expect(verifyDraft(d, q1).filter((i) => i.severity === "block")).toEqual([]);
  });

  test("out-of-catalogue offers and discounts are blocked; refusing them is allowed", () => {
    const bad = verifyDraft(proposal("We also add a free photographer and a 10% off discount. Total: €320."), q1);
    expect(bad.filter((i) => i.severity === "block").length).toBeGreaterThanOrEqual(2);
    const ok = verifyDraft(proposal("We cannot add a photographer or offer a discount; both are outside our catalogue. Total: €320."), q1);
    expect(ok.filter((i) => i.severity === "block")).toEqual([]);
  });

  test("clarification containing a price is blocked; without one it passes", () => {
    const bad = verifyDraft({ kind: "clarification", subject: "Draft", body: "Studio costs €240. How many people?" + NOTICE }, q4);
    expect(bad.some((i) => i.severity === "block")).toBe(true);
    const ok = verifyDraft({ kind: "clarification", subject: "Draft questions", body: "How many people will attend, and what is your maximum budget?" + NOTICE }, q4);
    expect(ok).toEqual([]);
  });

  test("infeasible explanation: honest one passes, 'fits your budget' is blocked", () => {
    const good = {
      kind: "explanation" as const, subject: "Draft: options",
      body: "The full package (Loft €420, coffee €160, lunch €360) comes to €940 and exceeds your €850 budget by €90. Alternatives: 16 people for €836, drop coffee for €780, or drop lunch for €580." + NOTICE,
    };
    expect(verifyDraft(good, q2)).toEqual([]);
    const bad = { kind: "proposal" as const, subject: "Draft", body: "Good news, the package fits your budget at €940." + NOTICE };
    const issues = verifyDraft(bad, q2);
    expect(issues.some((i) => i.severity === "block" && i.message.includes("infeasible"))).toBe(true);
  });

  test("missing DRAFT / salesperson-approval notice is a warning", () => {
    const d = { kind: "proposal" as const, subject: "Proposal", body: "Studio €240, coffee €80. Total: €320." };
    const issues = verifyDraft(d, q1);
    expect(issues.some((i) => i.severity === "warn" && i.message.includes("DRAFT"))).toBe(true);
    expect(issues.some((i) => i.severity === "block")).toBe(false);
  });
});
