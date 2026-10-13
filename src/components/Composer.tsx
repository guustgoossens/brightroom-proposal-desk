import { useState } from "react";
import type { Actions } from "../data";
import type { RunMode } from "../types";

interface Props {
  actions: Actions;
  initial: { label: string; text: string };
  onStarted: (id: string) => void;
  onCancel?: () => void;
}

export function Composer({ actions, initial, onStarted, onCancel }: Props) {
  const [label, setLabel] = useState(initial.label);
  const [text, setText] = useState(initial.text);
  const [busy, setBusy] = useState<RunMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: RunMode) => {
    if (!text.trim()) return;
    setBusy(mode);
    setError(null);
    try {
      const id = await actions.start({ label: label.trim() || "Untitled enquiry", text: text.trim(), mode });
      if (id) onStarted(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); void run("pipeline"); }}>
      <h2 className="composer__title">What did the client ask for?</h2>
      <p className="muted">Paste the message as it arrived. The desk extracts the brief, prices it from the catalogue and drafts a reply for you to approve.</p>
      <label className="field">
        <span>Name</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Acme offsite" />
      </label>
      <label className="field">
        <span>Enquiry</span>
        <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="10 people, 4 hours, coffee for everyone. Maximum budget €350." required autoFocus />
      </label>
      {error && <div className="note note--danger" role="alert">{error}</div>}
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={!text.trim() || busy !== null}>{busy === "pipeline" ? "Starting…" : "Prepare proposal"}</button>
        <button type="button" className="btn" disabled={!text.trim() || busy !== null} onClick={() => void run("baseline")} title="One prompt, no catalogue code, no Jev. For comparison.">
          {busy === "baseline" ? "Starting…" : "Try single prompt"}
        </button>
        {onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
