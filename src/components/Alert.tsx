import type { ReactNode } from "react";

export function Alert({ tone, children }: { tone: "warning" | "danger" | "info"; children: ReactNode }) {
  return <div className={`note note--${tone} note--bar`} role="status">{children}</div>;
}
