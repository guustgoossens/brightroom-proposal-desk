import type { EngineResult } from "../types";
import { eur } from "../lib/format";
import { Badge, Bar, Card, Empty } from "./ui";

export function PackageCard({ engine, budget, loading }: { engine?: EngineResult; budget: number | null; loading: boolean }) {
  const pkg = engine?.package;
  if (!pkg) {
    return (
      <Card title="Package" id="pkg-h">
        <Empty icon="€">
          {loading && !engine ? "Waiting for the engine…" : "No package satisfies every requirement. See the alternatives below."}
        </Empty>
      </Card>
    );
  }
  const over = budget != null && pkg.total > budget;
  const ratio = budget ? pkg.total / budget : 0;
  return (
    <Card
      title="Package"
      id="pkg-h"
      aside={engine?.totalVerified ? <Badge tone="success" title="Total recomputed by code from catalogue prices">recomputed ✓</Badge> : <Badge tone="danger">total not verified</Badge>}
    >
      <table className="table">
        <thead>
          <tr><th scope="col">Item</th><th scope="col">Basis</th><th scope="col" className="r">Amount</th></tr>
        </thead>
        <tbody>
          {pkg.lines.map((l) => (
            <tr key={l.id}>
              <th scope="row">{l.name}</th>
              <td className="muted">{l.basis}</td>
              <td className="r num">{eur(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th scope="row" colSpan={2}>Verified total</th><td className="r num total">{eur(pkg.total)}</td></tr>
        </tfoot>
      </table>
      {budget != null ? (
        <div className="budget">
          <div className="budget__row">
            <span>{over ? `Over budget by ${eur(pkg.total - budget)}` : `Within budget, ${eur(budget - pkg.total)} to spare`}</span>
            <span className="num muted">{eur(pkg.total)} of {eur(budget)}</span>
          </div>
          <Bar value={Math.min(ratio, 1)} tone={over ? "danger" : "success"} label="Total as share of budget" />
        </div>
      ) : (
        <p className="muted budget__none">No budget stated.</p>
      )}
      {engine && engine.optionalAddOns.length > 0 && (
        <div className="addons">
          <h3>Optional add-ons <span className="muted">· not included in total</span></h3>
          <ul>
            {engine.optionalAddOns.map((a) => (
              <li key={a.id} className="addon">
                <span>{a.name} <span className="muted">({a.basis})</span></span>
                <span className="num">+{eur(a.amount)}{a.withinBudgetWithPackage === false && <Badge tone="warning">exceeds budget</Badge>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
