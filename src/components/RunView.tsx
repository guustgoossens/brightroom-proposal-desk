import type { Run } from "../types";
import { ms } from "../lib/format";
import { Alternatives } from "./Alternatives";
import { BaselinePanel } from "./BaselinePanel";
import { DraftPanel } from "./DraftPanel";
import { FeasibilityBanner } from "./FeasibilityBanner";
import { Hood } from "./Hood";
import { LaneStrip } from "./LaneStrip";
import { PackageCard } from "./PackageCard";

interface Props {
  run: Run;
  other?: { id: string; mode: "pipeline" | "baseline" };
  chosenAlt: string | null;
  approved: boolean;
  onChoose: (id: string | null) => void;
  onApprove: (v: boolean) => void;
  onOpen: (id: string) => void;
  onRerun: () => void;
}

export function RunView({ run, other, chosenAlt, approved, onChoose, onApprove, onOpen, onRerun }: Props) {
  const baseline = run.mode === "baseline";
  const e = run.engine;
  const hardnessDiffs = (run.jev?.agreement ?? []).filter((a) => !a.agrees && a.field.includes("hardness"));
  const hasLeft = !!e?.package || (e?.alternatives.length ?? 0) > 0;
  const took = run.finishedAt ? ` · ${ms(run.finishedAt - run.createdAt)}` : "";
  return (
    <div className="runview">
      <header className="runhead">
        <h2 className="runhead__title">{run.label}</h2>
        <span className="runhead__meta muted">{baseline ? "Single prompt" : "Pipeline"}{run.status === "running" ? " · running" : run.status === "error" ? " · failed" : took}</span>
        <button type="button" className="btn btn--soft runhead__again" onClick={onRerun} disabled={run.status === "running"}><span aria-hidden>▶</span> {run.status === "running" ? "Running…" : "Run again"}</button>
        {other && (
          <button type="button" className="link runhead__other" onClick={() => onOpen(other.id)}>
            {other.mode === "baseline" ? "See the single-prompt answer" : "Back to the pipeline run"}
          </button>
        )}
      </header>
      <p className="quote">{run.text}</p>
      <LaneStrip run={run} />
      {baseline ? (
        <>
          <div className="banner banner--warning" role="status">
            <span className="banner__icon" aria-hidden>!</span>
            <div><p className="banner__head"><span className="banner__status">Unverified</span> Nothing in this answer was checked</p></div>
          </div>
          <BaselinePanel run={run} />
        </>
      ) : (
        <>
          <FeasibilityBanner run={run} />
          {hardnessDiffs.length > 0 && (
            <div className="note note--warning" role="status">
              <strong>Check the must-haves.</strong> Jev and the LLM disagree: {hardnessDiffs.map((d) => `${d.field.replace(" hardness", "")} (LLM: ${d.llm}; Jev: ${d.jev})`).join("; ")}. Confirm with the client before relying on the package.
            </div>
          )}
          <div className={`deck ${hasLeft ? "" : "deck--single"}`}>
            {hasLeft && (
              <div className="deck__col">
                <PackageCard engine={e} budget={run.brief?.budgetEur ?? null} loading={run.status === "running"} />
                <Alternatives engine={e} jev={run.jev} chosen={chosenAlt} onChoose={onChoose} />
              </div>
            )}
            <div className="deck__col">
              <DraftPanel run={run} chosenAlt={chosenAlt} approved={approved} onApprove={onApprove} />
            </div>
          </div>
          <Hood run={run} />
        </>
      )}
    </div>
  );
}
