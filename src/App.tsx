import { useEffect, useState } from "react";
import { Alert } from "./components/Alert";
import { Composer } from "./components/Composer";
import { Evaluation } from "./components/Evaluation";
import { Header, type View } from "./components/Header";
import { Rail } from "./components/Rail";
import { RunView } from "./components/RunView";
import { Empty } from "./components/ui";
import { MOCK, useActions, useCases, useRun, useRuns } from "./data";
import type { Run } from "./types";

interface Draft { label: string; text: string }

export default function App() {
  const runs = useRuns();
  const cases = useCases();
  const actions = useActions();
  const [view, setView] = useState<View>("desk");
  const [selected, setSelected] = useState<string | null>(null);
  const [compose, setCompose] = useState<Draft | null>(null);
  const [chosen, setChosen] = useState<Record<string, string | null>>({});
  const [approved, setApproved] = useState<Record<string, boolean>>({});

  // Follow the newest run until the user opens one explicitly.
  const [pinned, setPinned] = useState(false);
  const newest = runs?.[0]?._id ?? null;
  useEffect(() => {
    if (!pinned) setSelected(newest);
  }, [newest, pinned]);

  const open = (id: string) => { setPinned(true); setSelected(id); setCompose(null); setView("desk"); };
  const started = (id: string) => { setPinned(true); setSelected(id); setCompose(null); };
  const runCase = async (label: string, text: string, caseId?: string, mode: "pipeline" | "baseline" = "pipeline") => {
    const id = await actions.start({ label, text, mode, caseId });
    if (id) { started(id); setView("desk"); }
  };
  const runAll = (mode: "pipeline" | "baseline") => { setPinned(false); void actions.evaluateAll(mode); };

  const run = useRun(selected);
  const current = run ?? undefined;
  const sibling = current && runs?.find((r) => r.label === current.label && r.mode !== current.mode);
  const composing = compose ?? (!selected && runs !== undefined ? { label: "", text: "" } : null);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header view={view} onView={setView} />
      {MOCK && <Alert tone="warning">Mock mode (?mock=1): showing dev fixtures, no backend calls.</Alert>}
      {view === "eval" ? (
        <main id="main" className="page">
          <Evaluation cases={cases} runs={runs} actions={actions} onRunAll={runAll} onOpenRun={open} onRunCase={(l, t, c) => void runCase(l, t, c)} />
        </main>
      ) : (
        <div className="layout">
          <Rail cases={cases} runs={runs} selected={selected} composing={compose ? compose.label : null} onOpenRun={open} onCompose={(label, text) => setCompose({ label, text })} onRunCase={(l, t, c) => void runCase(l, t, c)} />
          <main id="main" className="main">
            {runs === undefined ? (
              <Empty icon="…">Connecting to the backend…</Empty>
            ) : composing ? (
              <Composer key={`${composing.label}|${composing.text.length}`} actions={actions} initial={composing} onStarted={started} onCancel={selected ? () => setCompose(null) : undefined} />
            ) : run === undefined ? (
              <Empty icon="…">Loading…</Empty>
            ) : current ? (
              <RunView
                key={current._id}
                run={current}
                other={sibling ? { id: sibling._id, mode: sibling.mode } : undefined}
                chosenAlt={chosen[current._id] ?? null}
                approved={approved[current._id] ?? false}
                onChoose={(id) => setChosen((s) => ({ ...s, [current._id]: id }))}
                onApprove={(v) => setApproved((s) => ({ ...s, [current._id]: v }))}
                onOpen={open}
                onRerun={() => void runCase((current as Run).label, (current as Run).text, (current as Run).caseId, (current as Run).mode)}
              />
            ) : (
              <Empty icon="?">That run no longer exists.</Empty>
            )}
          </main>
        </div>
      )}
    </>
  );
}
