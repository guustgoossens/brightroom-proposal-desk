import type { Run } from "../types";
import { eur } from "../lib/format";
import { Badge, Card, Empty } from "./ui";

export function BaselinePanel({ run }: { run: Run }) {
  const b = run.baseline;
  return (
    <Card title="Baseline: single prompt" id="base-h" aside={<Badge tone="warning">no verification</Badge>}>
      {!b ? (
        <Empty icon="…">{run.status === "running" ? "Waiting for the single-prompt answer…" : "No baseline output."}</Empty>
      ) : (
        <>
          <div className="chips">
            <span className="chip chip--warning">
              Claimed total: <span className="num">{b.claimedTotal != null ? eur(b.claimedTotal) : "none"}</span>
            </span>
            <span className="chip chip--neutral">Claimed feasible: {b.claimedFeasible == null ? "not stated" : b.claimedFeasible ? "yes" : "no"}</span>
          </div>
          <div className="note note--warning">
            Single prompt, no verification. No catalogue lookup, no constraint check, no recomputed total, no Jev, no audit. Compare with the pipeline run of the same case.
          </div>
          <pre className="mail__body mail__body--plain">{b.text}</pre>
        </>
      )}
    </Card>
  );
}
