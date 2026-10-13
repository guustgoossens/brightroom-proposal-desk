import type { Lane, Run, Step } from "../types";
import { ms } from "../lib/format";
import { useNow } from "../lib/useNow";
import { Card, Spinner } from "./ui";

const LANES: { lane: Lane; name: string; who: string; expected: { key: string; title: string }[] }[] = [
  { lane: "llm", name: "LLM", who: "Claude Sonnet sub-agents", expected: [
    { key: "extract", title: "Extract brief" }, { key: "write", title: "Write draft" }, { key: "audit", title: "Audit draft" },
  ] },
  { lane: "jev", name: "Jev", who: "Typed decision API", expected: [
    { key: "jev_triage", title: "Triage + hardness" }, { key: "jev_pick", title: "Pick alternative" },
  ] },
  { lane: "code", name: "Code", who: "Deterministic engine", expected: [
    { key: "engine", title: "Price & verify" },
  ] },
];

const STATUS_TEXT = { running: "running", done: "done", skipped: "skipped", error: "failed" } as const;

function StepRow({ step, now }: { step: Step; now: number }) {
  const elapsed = step.status === "running" ? Math.max(0, now - step.startedAt) : step.ms;
  return (
    <li className={`step step--${step.status}`}>
      <span className="step__mark" aria-hidden>
        {step.status === "running" ? <Spinner label="" /> : <span className={`dot dot--${step.status}`} />}
      </span>
      <div className="step__body">
        <div className="step__row">
          <span className="step__title">{step.title}</span>
          <span className="step__ms num">{elapsed != null ? ms(elapsed) : ""}</span>
        </div>
        <p className="step__sum">
          <span className="sr-only">{STATUS_TEXT[step.status]}: </span>
          {step.status === "error" ? (step.error ?? "Step failed") : (step.summary ?? (step.status === "running" ? "Working…" : ""))}
        </p>
      </div>
    </li>
  );
}

export function Timeline({ run }: { run: Run }) {
  const running = run.status === "running";
  const now = useNow(running);
  const byKey = new Map(run.steps.map((s) => [s.key, s]));
  const known = new Set(LANES.flatMap((l) => l.expected.map((e) => e.key)));
  const extras = run.steps.filter((s) => !known.has(s.key));
  const lanes = run.mode === "baseline" ? LANES.filter((l) => l.lane === "llm") : LANES;

  return (
    <Card title="Three-lane timeline" id="timeline-h" aside={<span className="muted">{running ? "live" : run.status === "error" ? "stopped" : "complete"}</span>}>
      <div className="lanes" aria-live="polite" aria-relevant="additions text">
        {lanes.map((l) => {
          const steps = [
            ...l.expected.map((e) => byKey.get(e.key) ?? { placeholder: true as const, ...e }),
            ...extras.filter((s) => s.lane === l.lane),
          ].filter((s) => run.mode !== "baseline" || !("placeholder" in s));
          return (
            <div key={l.lane} className={`lane lane--${l.lane}`}>
              <div className="lane__head">
                <span className="lane__name">{l.name}</span>
                <span className="lane__who">{l.who}</span>
              </div>
              <ol className="lane__steps">
                {steps.map((s) =>
                  "placeholder" in s ? (
                    <li key={s.key} className="step step--pending">
                      <span className="step__mark" aria-hidden><span className="dot dot--pending" /></span>
                      <div className="step__body">
                        <div className="step__row"><span className="step__title">{s.title}</span></div>
                        <p className="step__sum">{running ? "Queued" : "Not run"}</p>
                      </div>
                    </li>
                  ) : (
                    <StepRow key={s.key} step={s} now={now} />
                  ),
                )}
              </ol>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
