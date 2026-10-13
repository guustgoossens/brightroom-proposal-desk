import type { Lane, Run, Step } from "../types";
import { ms } from "../lib/format";
import { useNow } from "../lib/useNow";
import { Spinner } from "./ui";

const LANES: { lane: Lane; name: string; expected: string[] }[] = [
  { lane: "llm", name: "LLM", expected: ["extract", "write", "audit_llm"] },
  { lane: "jev", name: "Jev", expected: ["jev_triage"] },
  { lane: "code", name: "Code", expected: ["engine", "audit"] },
];

const LABEL: Record<string, string> = {
  extract: "Extract", write: "Write", revise: "Revise", audit_llm: "Audit",
  jev_triage: "Triage", jev_pick: "Pick", engine: "Price", audit: "Verify", baseline: "Answer",
};

function Item({ id, step, now, running }: { id: string; step?: Step; now: number; running: boolean }) {
  const state = step?.status ?? "pending";
  const elapsed = step ? (step.status === "running" ? Math.max(0, now - step.startedAt) : step.ms) : undefined;
  return (
    <li className={`strip__step strip__step--${state}`} title={step?.summary ?? step?.error ?? (running ? "Queued" : "Not run")}>
      {state === "running" ? <Spinner label="" /> : <span className={`dot dot--${state}`} aria-hidden />}
      <span>{LABEL[id] ?? id}</span>
      {elapsed != null && <span className="strip__ms num">{ms(elapsed)}</span>}
    </li>
  );
}

/** One-line live view of the three lanes. Details live in the "How it ran" tab. */
export function LaneStrip({ run }: { run: Run }) {
  const running = run.status === "running";
  const now = useNow(running);
  const byKey = new Map(run.steps.map((s) => [s.key, s]));
  const lanes = run.mode === "baseline" ? LANES.filter((l) => l.lane === "llm") : LANES;
  return (
    <div className="strip" aria-live="polite" aria-label="Pipeline progress">
      {lanes.map((l) => {
        const present = run.steps.filter((s) => s.lane === l.lane).map((s) => s.key);
        const ids = run.mode === "baseline" ? present : [...new Set([...l.expected, ...present])];
        return (
          <div key={l.lane} className={`strip__lane strip__lane--${l.lane}`}>
            <span className="strip__name">{l.name}</span>
            <ol className="strip__steps">{ids.map((id) => <Item key={id} id={id} step={byKey.get(id)} now={now} running={running} />)}</ol>
          </div>
        );
      })}
    </div>
  );
}
