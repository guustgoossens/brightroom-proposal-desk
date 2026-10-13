import type { Brief } from "../types";
import { eur } from "../lib/format";
import { Card, Empty, Tip } from "./ui";

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={`stat ${value == null ? "stat--missing" : ""}`}>
      <dt>{label}</dt>
      <dd className="num">{value ?? "not stated"}</dd>
    </div>
  );
}

const WHEEL: Record<string, string | null> = { required: "Required", preferred: "Preferred", not_needed: "Not needed", unknown: null };

export function BriefCard({ brief, loading }: { brief?: Brief; loading: boolean }) {
  if (!brief) {
    return (
      <Card title="Brief" id="brief-h">
        <Empty icon="…">{loading ? "Extracting the brief…" : "No brief was extracted for this run."}</Empty>
      </Card>
    );
  }
  // Evidence per item: services carry verbatim evidence from the enquiry.
  const evidence = new Map<string, string>();
  for (const s of brief.services) {
    evidence.set(s.id, s.evidence);
  }
  const evidenceFor = (text: string) => {
    for (const s of brief.services) {
      if (text.toLowerCase().includes(s.id.toLowerCase())) return s.evidence;
    }
    return undefined;
  };
  const List = ({ title, items, tone }: { title: string; items: string[]; tone: string }) => (
    <div className={`blist blist--${tone}`}>
      <h3>{title} <span className="count num">{items.length}</span></h3>
      {items.length === 0 ? <p className="muted">None</p> : (
        <ul>
          {items.map((t, i) => {
            const ev = evidenceFor(t);
            return <li key={i}>{ev ? <Tip text={`Evidence: ${ev}`}>{t}</Tip> : t}</li>;
          })}
        </ul>
      )}
    </div>
  );
  return (
    <Card title="Brief" id="brief-h" aside={<span className="muted">extracted by LLM</span>}>
      <dl className="stats">
        <Stat label="Headcount" value={brief.headcount != null ? String(brief.headcount) : null} />
        <Stat label="Duration" value={brief.durationHours != null ? `${brief.durationHours} h` : null} />
        <Stat label="Budget" value={brief.budgetEur != null ? eur(brief.budgetEur) : null} />
        <Stat label="Accessibility" value={WHEEL[brief.wheelchair] ?? null} />
        <Stat label="Date" value={brief.requestedDate} />
      </dl>
      <div className="blists">
        <List title="Confirmed" items={brief.confirmed} tone="success" />
        <List title="Preferences" items={brief.preferences} tone="info" />
        <List title="Missing" items={brief.missing} tone="warning" />
      </div>
      {(brief.services.length > 0 || brief.commitmentAsks.length > 0 || brief.unlistedRequests.length > 0) && (
        <div className="chips" aria-label="Requested services and flags">
          {brief.services.map((s) => (
            <Tip key={s.id} text={`Evidence: ${s.evidence}`}>
              <span className={`chip chip--${s.need === "required" ? "accent" : "neutral"}`}>{s.id} · {s.need}</span>
            </Tip>
          ))}
          {brief.commitmentAsks.map((c) => <span key={c} className="chip chip--danger" title="We must not make this commitment">asks: {c}</span>)}
          {brief.unlistedRequests.map((c) => <span key={c} className="chip chip--warning" title="Not in the catalogue">unlisted: {c}</span>)}
        </div>
      )}
    </Card>
  );
}
