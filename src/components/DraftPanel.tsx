import { useState } from "react";
import type { Run } from "../types";
import { Badge, Card, Empty } from "./ui";

interface Props {
  run: Run;
  chosenAlt: string | null;
  approved: boolean;
  onApprove: (v: boolean) => void;
}

export function DraftPanel({ run, chosenAlt, approved, onApprove }: Props) {
  const [copied, setCopied] = useState(false);
  const { draft, audit, engine } = run;
  if (!draft) {
    return (
      <Card title="Draft email" id="draft-h">
        <Empty icon="✉">{run.status === "running" ? "The writer sub-agent is drafting…" : "No draft was produced."}</Empty>
      </Card>
    );
  }
  const status = engine?.status;
  const blocked = (status === "infeasible" || status === "needs_clarification") && !chosenAlt;
  const reason =
    status === "infeasible"
      ? "Not approvable as requested. Choose an alternative first."
      : "Key information is missing. Get answers from the client first.";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const codeBlocked = audit?.issues.some((i) => i.source === "code" && i.severity === "block");
  const llmNoted = audit?.issues.some((i) => i.source === "llm");
  return (
    <Card title="Draft email" id="draft-h" aside={<Badge tone="warning">Draft · availability unconfirmed</Badge>}>
      <article className="mail">
        <div className="mail__subject"><span className="muted">Subject</span> {draft.subject}</div>
        <pre className="mail__body">{draft.body}</pre>
      </article>
      {audit ? (
        <p className="auditline">
          <span className={codeBlocked ? "bad" : "ok"}>{codeBlocked ? "✕" : "✓"} Code checks</span>
          <span className={llmNoted ? "warn" : "ok"}>{llmNoted ? "!" : "✓"} LLM auditor</span>
          {audit.revised && <span className="muted">revised once</span>}
        </p>
      ) : <p className="auditline muted">Audit not available.</p>}
      {audit?.revised && audit.firstPass && audit.firstPass.length > 0 && (
        <details className="caught">
          <summary>The code check caught {audit.firstPass.length} problem{audit.firstPass.length > 1 ? "s" : ""} in the first draft; the writer revised it once</summary>
          <ul>{audit.firstPass.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
        </details>
      )}
      {audit && audit.issues.length > 0 && (
        <ul className="issues">
          {audit.issues.map((i, n) => (
            <li key={n} className={`issue issue--${i.severity}`}>
              <Badge tone={i.source === "code" ? "success" : "accent"}>{i.source === "code" ? "Code" : "LLM"}</Badge>
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="button" className="btn btn--primary" disabled={blocked} aria-describedby="approve-help" aria-pressed={approved} onClick={() => onApprove(!approved)}>
          {approved ? "Approved · undo" : "Approve draft"}
        </button>
        <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p id="approve-help" className="muted help">{blocked ? reason : "Approving only marks this draft here. Nothing is sent from this app."}</p>
    </Card>
  );
}
