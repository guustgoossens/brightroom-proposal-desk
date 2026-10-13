import type { Actions } from "../data";
import type { Case, Run } from "../types";
import { CaseTools } from "./CaseLibrary";
import { ResultsTable } from "./ResultsTable";
import { Spinner } from "./ui";

interface Props {
  cases: Case[] | undefined;
  runs: Run[] | undefined;
  actions: Actions;
  onRunAll: (mode: "pipeline" | "baseline") => void;
  onOpenRun: (id: string) => void;
  onRunCase: (label: string, text: string, caseId?: string) => void;
}

export function Evaluation({ cases, runs, actions, onRunAll, onOpenRun, onRunCase }: Props) {
  const running = runs?.filter((r) => r.status === "running").length ?? 0;
  return (
    <div className="eval">
      <header>
        <h2 className="eval__title">Evaluation</h2>
        <p className="muted">Run the whole case set through the pipeline and through a single prompt, then compare against the expected outcome for each case.</p>
      </header>
      <CaseTools cases={cases} actions={actions} onRunAll={onRunAll} />
      {running > 0 && <p className="progress" role="status"><Spinner label="" /> {running} running. Open a row to watch it live; results fill in below.</p>}
      <ResultsTable cases={cases} runs={runs} onSelect={onOpenRun} onRun={(c) => onRunCase(c.label, c.text, c._id)} />
    </div>
  );
}
