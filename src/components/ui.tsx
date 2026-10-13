import type { ReactNode } from "react";

export type Tone = "success" | "warning" | "danger" | "info" | "accent" | "neutral";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Spinner({ label = "Running" }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Card({
  title,
  aside,
  children,
  className = "",
  id,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`card ${className}`} aria-labelledby={id}>
      {(title || aside) && (
        <header className="card__head">
          {title && (
            <h2 className="card__title" id={id}>
              {title}
            </h2>
          )}
          {aside && <div className="card__aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Horizontal probability bar. Value 0..1. */
export function Bar({
  value,
  tone = "accent",
  label,
  marker,
}: {
  value: number;
  tone?: "accent" | "success" | "warning" | "danger" | "info";
  label: string;
  marker?: number;
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className={`bar__fill bar__fill--${tone}`} style={{ width: `${v * 100}%` }} />
      {marker != null && <div className="bar__marker" style={{ left: `${Math.min(1, marker) * 100}%` }} />}
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon" aria-hidden>{icon}</div>}
      <div>{children}</div>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="note note--danger" role="alert">
      {children}
    </div>
  );
}

/** Focusable inline term with a CSS tooltip (also exposed through title for screen readers). */
export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="tip" tabIndex={0} data-tip={text} title={text}>
      {children}
    </span>
  );
}
