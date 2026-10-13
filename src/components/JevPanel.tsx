import type { JevResult, Run } from "../types";
import { SERVICE_NAMES, ms, pct } from "../lib/format";
import { Bar, Card, Empty } from "./ui";

const CHOICE_LABEL: Record<string, string> = {
  complete: "Complete enquiry",
  provisional_ok: "Provisional is OK",
  needs_clarification: "Needs clarification",
};

function jevStep(run: Run) {
  return run.steps.find((s) => s.key === "jev_triage");
}

export function JevPanel({ run }: { run: Run }) {
  const jev: JevResult | undefined = run.jev;
  const step = jevStep(run);
  const skipped = step?.status === "skipped";
  const failed = step?.status === "error";
  return (
    <Card title="Jev vs LLM" id="jev-h" aside={jev && <span className="muted num">{jev.model} · {ms(jev.latencyMs)}</span>}>
      <div className="vs">
        <div className="vs__col vs__col--llm"><span className="vs__tag">LLM processing</span> reads the text and writes the brief</div>
        <div className="vs__col vs__col--jev"><span className="vs__tag">Jev processing</span> judges it with calibrated probabilities</div>
      </div>
      {!jev ? (
        <Empty icon="◌">
          {skipped ? `Jev: ${step?.summary ?? "no key configured"}. The LLM-only path was used.`
            : failed ? `Jev failed: ${step?.error ?? "unknown error"}`
            : run.status === "running" ? "Jev is judging this enquiry…" : "No Jev output for this run."}
        </Empty>
      ) : (
        <>
          <section className="jsec">
            <h3>Triage: {CHOICE_LABEL[jev.triage.choice] ?? jev.triage.choice} <span className="num muted">({pct(jev.triage.confidence)})</span></h3>
            <ul className="probs">
              {Object.entries(jev.triage.probs ?? { [jev.triage.choice]: jev.triage.confidence }).map(([k, p]) => (
                <li key={k} className={k === jev.triage.choice ? "is-top" : ""}>
                  <span>{CHOICE_LABEL[k] ?? k}</span>
                  <Bar value={p} label={`Triage probability of ${k}`} />
                  <span className="num">{pct(p)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="jsec">
            <h3>Pressure to commit <span className="muted">(“confirm today”)</span></h3>
            <div className="probs"><div className="prob-row">
              <Bar value={jev.pressure.probability} tone={jev.pressure.probability >= 0.5 ? "warning" : "info"} label="Pressure probability" />
              <span className="num">{pct(jev.pressure.probability)}</span>
            </div></div>
          </section>
          <section className="jsec">
            <h3>How hard is each requirement? <span className="muted">(probability it is a must-have)</span></h3>
            <ul className="probs">
              {(Object.keys(jev.hardness) as (keyof JevResult["hardness"])[]).map((k) => (
                <li key={k}>
                  <span>{k === "wheelchair" ? SERVICE_NAMES[k] : `${k} ${SERVICE_NAMES[k]}`}</span>
                  <Bar value={jev.hardness[k].probability} marker={0.5} tone={jev.hardness[k].probability >= 0.5 ? "accent" : "info"} label={`Hardness of ${k}`} />
                  <span className="num">{pct(jev.hardness[k].probability)}</span>
                </li>
              ))}
            </ul>
          </section>
          {jev.pick && (
            <section className="jsec">
              <h3>Alternative pick: {jev.pick.altId} <span className="num muted">({pct(jev.pick.confidence)})</span></h3>
            </section>
          )}
          <section className="jsec">
            <h3>Agreement with the LLM brief</h3>
            {jev.agreement.length === 0 ? <p className="muted">Nothing to compare.</p> : (
              <ul className="agree">
                {jev.agreement.map((a, i) => (
                  <li key={i} className={a.agrees ? "agree--yes" : "agree--no"}>
                    <span className="agree__icon" aria-hidden>{a.agrees ? "✓" : "⚠"}</span>
                    <span className="sr-only">{a.agrees ? "Agree: " : "Disagree: "}</span>
                    <strong>{a.field}</strong>
                    <span className="muted">LLM: {a.llm} · Jev: {a.jev}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Card>
  );
}
