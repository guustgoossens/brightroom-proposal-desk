// Single data layer for the UI. `?mock=1` swaps Convex for dev fixtures (src/dev/mock.ts).
import { useQuery, useMutation } from "convex/react";
import { api } from "./api";
import { MOCK_CASES, MOCK_RUNS } from "./dev/mock";
import type { Case, CaseInput, Run, RunMode } from "./types";

export const MOCK = typeof location !== "undefined" && new URLSearchParams(location.search).has("mock");

export function useRuns(): Run[] | undefined {
  const live = useQuery(api.runs.list, MOCK ? "skip" : {});
  return MOCK ? MOCK_RUNS : live;
}

export function useRun(id: string | null): Run | null | undefined {
  const live = useQuery(api.runs.get, MOCK || !id ? "skip" : { id });
  if (!id) return null;
  return MOCK ? (MOCK_RUNS.find((r) => r._id === id) ?? null) : live;
}

export function useCases(): Case[] | undefined {
  const live = useQuery(api.cases.list, MOCK ? "skip" : {});
  return MOCK ? MOCK_CASES : live;
}

export interface Actions {
  start(args: { label: string; text: string; mode?: RunMode; caseId?: string }): Promise<string | null>;
  evaluateAll(mode?: RunMode): Promise<void>;
  importCases(cases: CaseInput[]): Promise<void>;
  seedStarter(cases: CaseInput[]): Promise<void>;
  removeCase(id: string): Promise<void>;
}

export function useActions(): Actions {
  const start = useMutation(api.runs.start);
  const evaluateAll = useMutation(api.runs.evaluateAll);
  const importJson = useMutation(api.cases.importJson);
  const seed = useMutation(api.cases.seedStarter);
  const remove = useMutation(api.cases.remove);
  if (MOCK) {
    const noop = async () => {
      console.info("[mock mode] action ignored");
    };
    return {
      start: async () => null,
      evaluateAll: noop,
      importCases: noop,
      seedStarter: noop,
      removeCase: noop,
    };
  }
  return {
    start: (a) => start(a),
    evaluateAll: async (mode) => void (await evaluateAll(mode ? { mode } : {})),
    importCases: async (cases) => void (await importJson({ cases })),
    seedStarter: async (cases) => {
      try {
        await seed({ cases });
      } catch {
        await seed({}); // backend variant that takes no argument
      }
    },
    removeCase: async (id) => void (await remove({ id })),
  };
}
