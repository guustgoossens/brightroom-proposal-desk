import type { Run } from "../types";
import { STATUS_LABEL, STATUS_TONE, eur } from "../lib/format";

const ICON: Record<string, string> = { ready: "✓", provisional: "!", infeasible: "✕", needs_clarification: "?" };

const HEADLINE: Record<string, string> = {
  ready: "Feasible: every stated requirement is met",
  provisional: "Feasible with assumptions: confirm before sending",
  infeasible: "Not feasible as requested: do not send a standard proposal",
  needs_clarification: "Not enough information to price this enquiry",
};

export function FeasibilityBanner({ run }: { run: Run }) {
  const e = run.engine;
  if (!e) {
    const failed = run.status === "error";
    return (
      <div className={`banner banner--${failed ? "danger" : "neutral"}`} role={failed ? "alert" : "status"}>
        <span className="banner__icon" aria-hidden>{failed ? "✕" : "…"}</span>
        <div>
          <p className="banner__head">{failed ? "Run failed" : "Checking feasibility…"}</p>
          <p className="banner__reason">{failed ? (run.error ?? "Unknown error") : "The Code lane will report once the brief is extracted."}</p>
        </div>
      </div>
    );
  }
  const tone = STATUS_TONE[e.status] ?? "info";
  let reasons: string[] = [];
  if (e.status === "infeasible") reasons = e.violations.map((v) => v.message);
  else if (e.status === "provisional") reasons = e.assumptions;
  else if (e.status === "needs_clarification") reasons = e.clarificationQuestions.length ? e.clarificationQuestions : e.assumptions;
  else if (e.package) reasons = [`Verified total ${eur(e.package.total)}.`];
  const first = reasons[0];
  return (
    <div className={`banner banner--${tone}`} role="status">
      <span className="banner__icon" aria-hidden>{ICON[e.status]}</span>
      <div>
        <p className="banner__head">
          <span className="banner__status">{STATUS_LABEL[e.status]}</span> {HEADLINE[e.status]}
        </p>
        {first && <p className="banner__reason">{first}{reasons.length > 1 && <span className="banner__more"> (+{reasons.length - 1} more)</span>}</p>}
        {reasons.length > 1 && (
          <ul className="banner__list">
            {reasons.slice(1).map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
