import type { Case, Run } from "../types";
import { STATUS_TONE, eur } from "../lib/format";
import { Spinner } from "./ui";

interface Item { key: string; label: string; text: string; caseId?: string; run?: Run }

interface Props {
  cases: Case[] | undefined;
  runs: Run[] | undefined;
  selected: string | null;
  composing: string | null;
  onOpenRun: (id: string) => void;
  onCompose: (label: string, text: string) => void;
  onRunCase: (label: string, text: string, caseId?: string) => void;
}

/** One flat list: newest pipeline run per label, plus cases that have not been run yet. */
export function Rail({ cases, runs, selected, composing, onOpenRun, onCompose, onRunCase }: Props) {
  const latest = new Map<string, Run>();
  for (const r of runs ?? []) if (r.mode === "pipeline" && !latest.has(r.label)) latest.set(r.label, r);
  const known = new Set((cases ?? []).map((c) => c.label));
  const adhoc: Item[] = [...latest.values()].filter((r) => !known.has(r.label)).map((r) => ({ key: r._id, label: r.label, text: r.text, run: r }));
  const fromCases: Item[] = (cases ?? []).map((c) => ({ key: c._id, label: c.label, text: c.text, caseId: c._id, run: latest.get(c.label) }));
  const items = [...adhoc, ...fromCases];

  return (
    <nav className="rail" aria-label="Enquiries">
      <button type="button" className="btn btn--primary rail__new" onClick={() => onCompose("", "")} aria-pressed={composing !== null}>New enquiry</button>
      {runs === undefined ? <p className="rail__empty muted">Loading…</p> : items.length === 0 ? (
        <p className="rail__empty muted">No enquiries yet. Write one above, or load the starter cases in Evaluation.</p>
      ) : (
        <ul className="rail__list">
          {items.map((it) => {
            const status = it.run?.engine?.status;
            const active = !!it.run && it.run._id === selected && composing === null;
            return (
              <li key={it.key} className={`rail__row ${active ? "rail__row--on" : ""}`}>
                <button type="button" className="rail__item" aria-current={active} onClick={() => (it.run ? onOpenRun(it.run._id) : onRunCase(it.label, it.text, it.caseId))}>
                  <span className="rail__mark" aria-hidden>
                    {it.run?.status === "running" ? <Spinner label="" /> : <span className={`sdot sdot--${status ? STATUS_TONE[status] : it.run?.status === "error" ? "danger" : "none"}`} />}
                  </span>
                  <span className="rail__label">{it.label}</span>
                  <span className="rail__total num">{it.run?.engine?.package ? eur(it.run.engine.package.total) : ""}</span>
                </button>
                <button type="button" className="rail__play" aria-label={`Run ${it.label}`} title={it.run ? "Run again, live" : "Run, live"} disabled={it.run?.status === "running"} onClick={() => onRunCase(it.label, it.text, it.caseId)}>▶</button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
