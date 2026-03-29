export const SUBJECT_CUTOFF_RATE = 0.4;
export const DEFAULT_ESTIMATED_APPLICANT_MULTIPLIER = 20;

export function parseEstimatedApplicantsMultiplier(value: string | undefined): number {
  if (!value) {
    return DEFAULT_ESTIMATED_APPLICANT_MULTIPLIER;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ESTIMATED_APPLICANT_MULTIPLIER;
  }

  return Math.max(1, Math.round(parsed));
}
