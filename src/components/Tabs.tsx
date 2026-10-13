import type { ReactNode } from "react";

export interface TabDef<T extends string> { id: T; label: string; badge?: ReactNode }

/** Minimal tab strip. Panels are rendered by the caller. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: TabDef<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? "tab--on" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge && <span className="tab__badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
