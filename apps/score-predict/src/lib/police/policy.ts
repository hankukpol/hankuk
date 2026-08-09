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

export function estimateApplicants(params: {
  applicantCount: number | null;
  recruitCount: number;
  multiplier?: number;
}): number {
  if (
    params.applicantCount !== null &&
    Number.isFinite(params.applicantCount) &&
    params.applicantCount >= 0
  ) {
    return Math.floor(params.applicantCount);
  }

  const recruitCount =
    Number.isFinite(params.recruitCount) && params.recruitCount > 0
      ? Math.floor(params.recruitCount)
      : 0;
  if (recruitCount < 1) return 0;

  const multiplier =
    params.multiplier !== undefined && Number.isFinite(params.multiplier) && params.multiplier > 0
      ? Math.round(params.multiplier)
      : DEFAULT_ESTIMATED_APPLICANT_MULTIPLIER;

  return recruitCount * multiplier;
}
