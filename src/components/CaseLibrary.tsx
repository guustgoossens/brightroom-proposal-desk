import { useRef, useState } from "react";
import type { Actions } from "../data";
import type { Case, CaseInput } from "../types";

// Starter cases ship in data/cases.json; glob keeps the build alive if the file is absent.
const starterFiles = import.meta.glob("../../data/cases.json", { eager: true, import: "default" }) as Record<string, CaseInput[]>;
const STARTER: CaseInput[] = Object.values(starterFiles)[0] ?? [];

function parseCases(raw: string): CaseInput[] {
  const data = JSON.parse(raw);
  const arr = Array.isArray(data) ? data : data?.cases;
  if (!Array.isArray(arr)) throw new Error("Expected a JSON array of cases.");
  for (const c of arr) if (typeof c?.label !== "string" || typeof c?.text !== "string") throw new Error("Every case needs a string label and text.");
  return arr;
}

interface Props {
  cases: Case[] | undefined;
  actions: Actions;
  onRunAll: (mode: "pipeline" | "baseline") => void;
}

export function CaseTools({ cases, actions, onRunAll }: Props) {
  const [paste, setPaste] = useState("");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const guard = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "success", text: ok });
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : String(e) });
    }
  };
  const importText = (raw: string) => guard(async () => { await actions.importCases(parseCases(raw)); setPaste(""); }, "Cases imported.");
  const onFile = async (f?: File) => {
    if (!f) return;
    await importText(await f.text());
    if (fileRef.current) fileRef.current.value = "";
  };
  const seed = () => guard(async () => {
    if (!STARTER.length) throw new Error("data/cases.json is missing or empty.");
    await actions.seedStarter(STARTER);
  }, "Starter cases loaded.");

  return (
    <div className="tools">
      <div className="actions">
        <button type="button" className="btn" onClick={seed}>Load starter cases</button>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Import JSON</button>
        <span className="tools__gap" />
        <button type="button" className="btn btn--primary" disabled={!cases?.length} onClick={() => guard(async () => onRunAll("pipeline"), "Started one pipeline run per case.")}>Run all</button>
        <button type="button" className="btn" disabled={!cases?.length} onClick={() => guard(async () => onRunAll("baseline"), "Started one single-prompt run per case.")}>Run all as single prompt</button>
      </div>
      {open && (
        <div className="import">
          <label className="field">
            <span>Upload a .json file</span>
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <label className="field">
            <span>Or paste JSON</span>
            <textarea rows={4} className="mono" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='[{"label":"Q1","text":"…","expectedStatus":"ready","expectedTotal":320}]' />
          </label>
          <button type="button" className="btn btn--primary" disabled={!paste.trim()} onClick={() => void importText(paste)}>Import pasted JSON</button>
        </div>
      )}
      {msg && <div className={`note note--${msg.tone}`} role={msg.tone === "danger" ? "alert" : "status"}>{msg.text}</div>}
    </div>
  );
}
