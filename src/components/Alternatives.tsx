import type { EngineResult, JevResult } from "../types";
import { eur, pct } from "../lib/format";
import { Badge, Card } from "./ui";

interface Props {
  engine?: EngineResult;
  jev?: JevResult;
  chosen: string | null;
  onChoose: (id: string | null) => void;
}

export function Alternatives({ engine, jev, chosen, onChoose }: Props) {
  const alts = engine?.alternatives ?? [];
  if (!engine || alts.length === 0) return null;
  return (
    <Card title="Alternatives" id="alt-h" aside={<span className="muted">each one gives something up, none is applied silently</span>}>
      <ul className="alts">
        {alts.map((a) => {
          const picked = jev?.pick?.altId === a.id;
          const isChosen = chosen === a.id;
          return (
            <li key={a.id} className={`alt ${isChosen ? "alt--chosen" : ""}`}>
              <div className="alt__main">
                <p className="alt__title">
                  {a.title}
                  {picked && jev?.pick && <Badge tone="accent">Jev recommends · {pct(jev.pick.confidence)}</Badge>}
                </p>
                <ul className="relax">
                  {a.relaxations.map((r, i) => (
                    <li key={i}><s>{r.from}</s> → <strong>{r.to}</strong><span className="muted"> · {r.tradeoff}</span></li>
                  ))}
                </ul>
              </div>
              <div className="alt__side">
                <span className="alt__total num">{eur(a.package.total)}</span>
                {a.withinBudget === true && <Badge tone="success">within budget</Badge>}
                {a.withinBudget === false && <Badge tone="danger">over budget</Badge>}
                <button type="button" className={isChosen ? "btn btn--soft" : "btn"} aria-pressed={isChosen} onClick={() => onChoose(isChosen ? null : a.id)}>
                  {isChosen ? "Chosen" : "Choose"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
