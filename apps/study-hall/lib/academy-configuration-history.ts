import type { AcademyConfiguration } from "./academy-template";
import { mergeConfigurationEdits } from "./academy-template";
export type AppliedConfiguration = { effectiveFrom: string; createdAt: string; status: string; before: AcademyConfiguration; after: AcademyConfiguration };
export function configurationForDate<T>(current: T, history: { effectiveFrom: string; createdAt: string; status: string; before: T; after?: T }[], date: string): T {
  const applied = history.filter(row => row.status === "APPLIED").sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  if (!applied.length) return current;
  // Backward-compatible callers without after snapshots keep the original behavior.
  if (applied.some(row => row.after === undefined)) {
    const next = applied.filter(row => row.effectiveFrom > date).sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt))[0];
    return next?.before ?? current;
  }
  let result = applied[0].before;
  for (const row of applied) if (row.effectiveFrom <= date) result = mergeConfigurationEdits(row.before, row.after!, result);
  return result;
}
