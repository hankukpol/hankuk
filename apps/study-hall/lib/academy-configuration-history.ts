import type { AcademyConfiguration } from "./academy-template";
export type AppliedConfiguration = { effectiveFrom: string; createdAt: string; status: string; before: AcademyConfiguration; after: AcademyConfiguration };
export function configurationForDate<T>(current: T, history: { effectiveFrom: string; createdAt: string; status: string; before: T }[], date: string): T {
  const next = history.filter(row => row.status === "APPLIED" && row.effectiveFrom > date)
    .sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt))[0];
  return next?.before ?? current;
}
