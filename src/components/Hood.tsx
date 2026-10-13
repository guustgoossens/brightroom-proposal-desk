import { useState } from "react";
import type { Run } from "../types";
import { BriefCard } from "./BriefCard";
import { JevPanel } from "./JevPanel";
import { Tabs } from "./Tabs";
import { Timeline } from "./Timeline";

type Tab = "lanes" | "brief" | "jev";

/** Everything about HOW the answer was produced, tucked behind three quiet tabs. */
export function Hood({ run }: { run: Run }) {
  const [tab, setTab] = useState<Tab>("lanes");
  const disagree = run.jev?.agreement?.filter((a) => !a.agrees).length ?? 0;
  return (
    <section className="hood" aria-label="How this was produced">
      <Tabs
        label="How this was produced"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "lanes", label: "How it ran" },
          { id: "brief", label: "Brief" },
          { id: "jev", label: "Jev vs LLM", badge: disagree > 0 ? `${disagree} differ` : undefined },
        ]}
      />
      <div className="hood__panel" role="tabpanel">
        {tab === "lanes" && <Timeline run={run} />}
        {tab === "brief" && <BriefCard brief={run.brief} loading={run.status === "running"} />}
        {tab === "jev" && <JevPanel run={run} />}
      </div>
    </section>
  );
}
