import type { Case, Run } from "../types";
import { STATUS_LABEL, STATUS_TONE, eur } from "../lib/format";
import { judgeBaseline, judgePipeline, latestByCase, type Verdict } from "../lib/evaluate";
import { Badge, Card, Empty } from "./ui";

function Chip({ v, title }: { v: Verdict; title?: string }) {
  if (!v) return <span className="chip chip--sq chip--neutral">–</span>;
  return <span className={`chip chip--sq chip--${v.pass ? "success" : "danger"}`} title={title ?? v.checks.join(", ")}><span aria-hidden>{v.pass ? "✓" : "✕"}</span><span className="sr-only">{v.pass ? "pass" : "fail"}</span></span>;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className={`tile tile--${tone}`}>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
      <small>{sub}</small>
    </div>
  );
}

export function ResultsTable({ cases, runs, onSelect, onRun }: { cases: Case[] | undefined; runs: Run[] | undefined; onSelect: (id: string) => void; onRun: (c: Case) => void }) {
  if (!cases || !runs) return <Card title="Results" id="res-h"><Empty icon="…">Loading…</Empty></Card>;
  const latest = latestByCase(runs);
  const rows = cases.map((c) => {
    const l = latest.get(c._id) ?? {};
    return { c, p: l.pipeline, b: l.baseline, pv: judgePipeline(c, l.pipeline), bv: judgeBaseline(c, l.baseline) };
  });
  const score = (key: "pv" | "bv") => {
    const done = rows.filter((r) => r[key]);
    return { pass: done.filter((r) => r[key]!.pass).length, total: done.length };
  };
  const P = score("pv");
  const B = score("bv");
  const rate = (s: { pass: number; total: number }) => (s.total ? `${Math.round((100 * s.pass) / s.total)}%` : "–");

  return (
    <Card title="Results" id="res-h" aside={<span className="muted">newest run per case</span>}>
      <dl className="tiles">
        <Tile label="Pipeline pass rate" value={rate(P)} sub={`${P.pass} of ${P.total} judged`} tone="accent" />
        <Tile label="Baseline pass rate" value={rate(B)} sub={`${B.pass} of ${B.total} judged`} tone="warning" />
        <Tile label="Cases" value={String(cases.length)} sub={`${rows.filter((r) => r.c.expectedStatus).length} with expectations`} tone="neutral" />
      </dl>
      {rows.length === 0 ? <Empty icon="▤">Add cases, then press Run all.</Empty> : (
        <div className="tablewrap">
          <table className="table table--results">
            <thead>
              <tr><th scope="col">Case</th><th scope="col">Expected</th><th scope="col">Pipeline</th><th scope="col">Baseline</th><th scope="col" title="Pipeline, then baseline">P / B</th></tr>
            </thead>
            <tbody>
              {rows.map(({ c, p, b, pv, bv }) => (
                <tr key={c._id}>
                  <th scope="row">{c.label}</th>
                  <td>
                    {c.expectedStatus ? <Badge tone={STATUS_TONE[c.expectedStatus] ?? "neutral"}>{STATUS_LABEL[c.expectedStatus] ?? c.expectedStatus}</Badge> : <span className="muted">–</span>}
                    {c.expectedTotal != null && <span className="num"> {eur(c.expectedTotal)}</span>}
                  </td>
                  <td>
                    {!p ? <button type="button" className="link" onClick={() => onRun(c)}>Run ▸</button> : p.status === "running" ? <span className="muted">running…</span> : p.engine ? (
                      <button type="button" className="link" onClick={() => onSelect(p._id)}>
                        <Badge tone={STATUS_TONE[p.engine.status] ?? "neutral"}>{STATUS_LABEL[p.engine.status]}</Badge>
                        {p.engine.package && <span className="num"> {eur(p.engine.package.total)}</span>}
                      </button>
                    ) : <button type="button" className="link" onClick={() => onSelect(p._id)}>error</button>}
                  </td>
                  <td>
                    {!b ? <span className="muted">not run</span> : b.status === "running" ? <span className="muted">running…</span> : (
                      <button type="button" className="link" onClick={() => onSelect(b._id)}>
                        <span className="num">{b.baseline?.claimedTotal != null ? eur(b.baseline.claimedTotal) : "no total"}</span>
                        <span className="muted"> {b.baseline?.claimedFeasible == null ? "" : b.baseline.claimedFeasible ? "feasible" : "infeasible"}</span>
                      </button>
                    )}
                  </td>
                  <td className="chipcell"><Chip v={pv} /> <Chip v={bv} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted legend-note">Check column: pipeline chip, then baseline chip. Hover for details.</p>
        </div>
      )}
    </Card>
  );
}
