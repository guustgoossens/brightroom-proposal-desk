export type View = "desk" | "eval";

export function Header({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__logo" aria-hidden>B</span>
        <h1 className="topbar__title">BrightRoom</h1>
        <nav className="topbar__nav" aria-label="Views">
          {(["desk", "eval"] as const).map((v) => (
            <button key={v} type="button" className={`topbar__tab ${view === v ? "topbar__tab--on" : ""}`} aria-current={view === v ? "page" : undefined} onClick={() => onView(v)}>
              {v === "desk" ? "Desk" : "Evaluation"}
            </button>
          ))}
        </nav>
      </div>
      <ul className="legend" aria-label="Processing lanes">
        <li><span className="legend__dot legend__dot--llm" />LLM</li>
        <li><span className="legend__dot legend__dot--jev" />Jev</li>
        <li><span className="legend__dot legend__dot--code" />Code</li>
      </ul>
    </header>
  );
}
