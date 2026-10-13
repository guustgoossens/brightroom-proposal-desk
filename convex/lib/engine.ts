// Deterministic pricing + constraint engine. No LLM here: money and hard limits are code, not prose.
import {
  FACILITATOR_HOURS, MAX_HOURS, MAX_PEOPLE, SERVICES, VENUES, eur, serviceById, venueById,
  type ServiceId, type Venue,
} from "./catalogue";
import type {
  Alternative, Brief, EngineResult, Line, Package, Relaxation, Violation,
} from "./types";

export const CANNOT_PROMISE = [
  "Availability is unconfirmed: no venue or date is held or booked.",
  "No discount, extra service, longer-duration price or unlisted item can be offered.",
  "Prices are catalogue totals in euros; no taxes or other fees are modelled.",
];

interface Req {
  headcount: number;
  durationHours: number;
  wheelchairRequired: boolean;
  services: ServiceId[];
}

const sortIds = (ids: ServiceId[]) => [...new Set(ids)].sort();

function lineFor(id: ServiceId, headcount: number): Line {
  const s = serviceById(id);
  return s.pricing === "per_person"
    ? { id, name: s.name, qty: headcount, unit: "person", unitPrice: s.price, amount: s.price * headcount, basis: `${eur(s.price)} × ${headcount} people` }
    : { id, name: s.name, qty: 1, unit: "booking", unitPrice: s.price, amount: s.price, basis: `${eur(s.price)} flat, added once` };
}

function eligibleVenues(r: Req): Venue[] {
  return VENUES.filter(
    (v) => r.headcount <= v.maxPeople && r.durationHours <= v.hours && (!r.wheelchairRequired || v.wheelchairAccessible),
  );
}

function buildPackage(r: Req): Package | null {
  const venues = eligibleVenues(r);
  if (!venues.length) return null;
  const venue = venues.reduce((a, b) => (b.price < a.price ? b : a));
  const lines: Line[] = [
    { id: venue.id, name: venue.name, qty: 1, unit: "venue", unitPrice: venue.price, amount: venue.price, basis: `${eur(venue.price)} flat, ${venue.hours} hours` },
    ...sortIds(r.services).map((id) => lineFor(id, r.headcount)),
  ];
  return { venue: venue.id, headcount: r.headcount, durationHours: r.durationHours, lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

/** Independent recomputation from the catalogue, used to prove the itemised total. */
export function verifyPackage(p: Package): boolean {
  const venue = venueById(p.venue);
  const services = p.lines.filter((l) => l.id !== p.venue).map((l) => l.id as ServiceId);
  const expected =
    venue.price +
    services.reduce((s, id) => {
      const svc = serviceById(id);
      return s + (svc.pricing === "per_person" ? svc.price * p.headcount : svc.price);
    }, 0);
  return expected === p.total && p.lines.reduce((s, l) => s + l.amount, 0) === p.total;
}

const cleanInt = (n: number | null) => (n != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null);

export function evaluate(brief: Brief): EngineResult {
  const headcount = cleanInt(brief.headcount);
  const duration = brief.durationHours != null && brief.durationHours > 0 ? brief.durationHours : null;
  const budget = brief.budgetEur != null && brief.budgetEur > 0 ? brief.budgetEur : null;

  const required = sortIds(brief.services.filter((s) => s.need === "required").map((s) => s.id));
  const preferred = sortIds(brief.services.filter((s) => s.need === "preferred" && !required.includes(s.id)).map((s) => s.id));

  const assumptions: string[] = [];
  const notes: string[] = [];
  const clarificationQuestions: string[] = [];

  // Headcount drives venue choice and every per-person price: never guess it.
  if (headcount == null) {
    clarificationQuestions.push("How many people will attend?");
    if (duration == null) clarificationQuestions.push("How long should the session run (the catalogue offers 4-hour bookings)?");
    if (budget == null) clarificationQuestions.push("Is there a maximum budget?");
    if (!brief.services.length) clarificationQuestions.push("Which services do you need: coffee break, lunch, projector, facilitator?");
    if (brief.wheelchair === "unknown") clarificationQuestions.push("Does anyone need wheelchair-accessible (step-free) access?");
    if (brief.requestedDate) clarificationQuestions.push(`"${brief.requestedDate}" is not a date: which date(s) would you like us to check availability for?`);
    return {
      status: "needs_clarification", assumptions, violations: [], package: null, optionalAddOns: [], alternatives: [],
      clarificationQuestions, cannotPromise: CANNOT_PROMISE, notes, totalVerified: true,
    };
  }

  // Labelled assumptions for non-core gaps -> provisional.
  let durationHours = duration;
  if (durationHours == null) {
    durationHours = MAX_HOURS;
    assumptions.push(`Duration not stated: assumed ${MAX_HOURS} hours, the only catalogue booking length.`);
    clarificationQuestions.push("Please confirm the session length (the catalogue only offers 4-hour bookings).");
  }
  if (budget == null) {
    assumptions.push("No budget stated: totals are shown without a budget check.");
    clarificationQuestions.push("Is there a maximum budget we should stay within?");
  }
  if (!brief.services.length) {
    assumptions.push("No services stated: venue only, nothing else added.");
    clarificationQuestions.push("Do you need coffee breaks, lunch, a projector or a facilitator?");
  }
  // Unstated accessibility is flagged, not a status downgrade: a routine enquiry stays "ready",
  // but the salesperson sees (and the draft asks) whether step-free access is needed.
  if (brief.wheelchair === "unknown") {
    notes.push("No accessibility need was mentioned. If anyone needs step-free access, only the Loft qualifies (the Studio is stairs-only).");
    clarificationQuestions.push("Does anyone need wheelchair-accessible (step-free) access?");
  }
  if (brief.requestedDate) {
    notes.push(`Requested timing "${brief.requestedDate}" is not a confirmed date; availability needs a separate check.`);
    clarificationQuestions.push(`Which specific date(s) should we check for "${brief.requestedDate}"?`);
  }

  const req: Req = {
    headcount, durationHours, wheelchairRequired: brief.wheelchair === "required", services: required,
  };

  // Hard constraints.
  const violations: Violation[] = [];
  if (headcount > MAX_PEOPLE) {
    violations.push({ code: "capacity", message: `${headcount} people exceeds the largest venue (Loft, max ${MAX_PEOPLE}).` });
  }
  if (durationHours > MAX_HOURS) {
    violations.push({ code: "duration", message: `${durationHours} hours exceeds the ${MAX_HOURS}-hour booking length; no longer-duration price exists.` });
  }
  for (const u of brief.unlistedRequests) {
    violations.push({ code: "unlisted_service", message: `"${u}" is not in the approved catalogue and cannot be offered.` });
  }

  const pkg = buildPackage(req);
  if (pkg && budget != null && pkg.total > budget) {
    violations.push({ code: "budget", message: `Package total ${eur(pkg.total)} exceeds the ${eur(budget)} budget.`, shortfallEur: pkg.total - budget });
  }
  if (pkg && req.wheelchairRequired) notes.push("Wheelchair access required: only the Loft qualifies.");
  if (brief.wheelchair === "preferred" && pkg && !venueById(pkg.venue).wheelchairAccessible) {
    const loft = buildPackage({ ...req, wheelchairRequired: true });
    notes.push(`Step-free access was only a preference; selected venue is stairs-only.${loft ? ` The accessible Loft would cost ${eur(loft.total - pkg.total)} more.` : ""}`);
    clarificationQuestions.push("Is step-free access a requirement or a nice-to-have?");
  }
  if (required.includes("S4") && durationHours > FACILITATOR_HOURS) {
    notes.push(`The facilitator covers ${FACILITATOR_HOURS} of the ${durationHours} hours.`);
  }

  // Preferred services: priced but never in the total.
  const optionalAddOns = preferred.map((id) => {
    const line = lineFor(id, headcount);
    return { ...line, withinBudgetWithPackage: pkg && budget != null ? pkg.total + line.amount <= budget : null };
  });

  const alternatives = violations.length ? buildAlternatives(req, budget, violations) : [];

  const status =
    violations.length ? "infeasible" : assumptions.length ? "provisional" : "ready";

  return {
    status, assumptions, violations, package: pkg, optionalAddOns, alternatives,
    clarificationQuestions: [...new Set(clarificationQuestions)], cannotPromise: CANNOT_PROMISE, notes,
    totalVerified: pkg ? verifyPackage(pkg) : true,
  };
}

/**
 * Alternatives relax named must-haves, one explicit trade-off at a time. Structural fixes
 * (capacity, duration) are applied together because no venue exists otherwise. Accessibility is
 * never offered as a trade-off.
 */
function buildAlternatives(req: Req, budget: number | null, violations: Violation[]): Alternative[] {
  const out: Alternative[] = [];
  const structural: Relaxation[] = [];
  let base: Req = { ...req };

  if (violations.some((v) => v.code === "capacity")) {
    structural.push({ field: "headcount", from: `${req.headcount} people`, to: `${MAX_PEOPLE} people`, tradeoff: `${req.headcount - MAX_PEOPLE} attendees could not be accommodated in a single booking.` });
    base = { ...base, headcount: MAX_PEOPLE };
  }
  if (violations.some((v) => v.code === "duration")) {
    structural.push({ field: "durationHours", from: `${req.durationHours} hours`, to: `${MAX_HOURS} hours`, tradeoff: `The session would be ${req.durationHours - MAX_HOURS} hours shorter than requested; no longer booking is priced.` });
    base = { ...base, durationHours: MAX_HOURS };
  }

  const push = (r: Req, relaxations: Relaxation[], title: string, note: string) => {
    const p = buildPackage(r);
    if (!p) return;
    out.push({
      id: `alt${out.length + 1}`, title, relaxations, package: p, budgetEur: budget,
      withinBudget: budget == null ? null : p.total <= budget, note,
    });
  };

  const basePkg = buildPackage(base);
  if (!basePkg) return out; // e.g. accessibility conflict with no venue: nothing honest to offer

  const overBudget = budget != null && basePkg.total > budget;

  if (structural.length) {
    push(base, structural, structural.length > 1 ? "Fit the catalogue limits (smaller group, 4 hours)" : "Fit the catalogue limit", "Every other must-have is kept. Needs the client's explicit agreement to the changes listed.");
  }

  if (overBudget) {
    // Reduce headcount: largest n whose cheapest eligible package fits the budget.
    for (let n = base.headcount - 1; n >= 1; n--) {
      const p = buildPackage({ ...base, headcount: n });
      if (p && p.total <= budget!) {
        const dropped = req.headcount - n;
        push({ ...base, headcount: n }, [...structural.filter((s) => s.field !== "headcount"),
          { field: "headcount", from: `${req.headcount} people`, to: `${n} people`, tradeoff: `${dropped} fewer attendees than requested.` }],
          `Keep every service, reduce to ${n} people`, "All required services are kept; only the group size changes.");
        break;
      }
    }
    // Drop required services, smallest subsets first, stop at the first size that fits.
    const ids = base.services;
    for (let size = 1; size <= ids.length; size++) {
      const found: ServiceId[][] = [];
      const walk = (start: number, acc: ServiceId[]) => {
        if (acc.length === size) {
          const kept = ids.filter((i) => !acc.includes(i));
          const p = buildPackage({ ...base, services: kept });
          if (p && p.total <= budget!) found.push(acc);
          return;
        }
        for (let i = start; i < ids.length; i++) walk(i + 1, [...acc, ids[i]]);
      };
      walk(0, []);
      if (found.length) {
        for (const drop of found.slice(0, 3)) {
          const names = drop.map((d) => serviceById(d).name.toLowerCase()).join(" and ");
          push({ ...base, services: ids.filter((i) => !drop.includes(i)) },
            [...structural, ...drop.map((d): Relaxation => ({ field: "service", from: `${serviceById(d).name} included`, to: "not included", tradeoff: `${serviceById(d).name} was required by the client and would be removed.` }))],
            `Keep ${base.headcount} people, drop ${names}`, "Group size is kept; a stated requirement is removed, so the client must approve it.");
        }
        break;
      }
    }
  }
  return out.slice(0, 4);
}
