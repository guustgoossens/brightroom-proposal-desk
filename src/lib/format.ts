export const eur = (n: number) => `€${n.toLocaleString("en-IE")}`;

export const pct = (p: number) => `${Math.round(p * 100)}%`;

export const ms = (n?: number) =>
  n == null ? "" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`;

export const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  provisional: "Provisional",
  infeasible: "Infeasible",
  needs_clarification: "Needs clarification",
};

export const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  ready: "success",
  provisional: "warning",
  infeasible: "danger",
  needs_clarification: "info",
};

export const SERVICE_NAMES: Record<string, string> = {
  S1: "Coffee break",
  S2: "Lunch",
  S3: "Projector",
  S4: "Facilitator",
  wheelchair: "Wheelchair access",
};
