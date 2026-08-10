export const PUBLIC_SAMPLE_THRESHOLDS = {
  percentile: 15,
  average: 15,
  oneMultipleAbsolute: 30,
} as const;

export function canShowSamplePercentile(participantCount: number): boolean {
  return participantCount >= PUBLIC_SAMPLE_THRESHOLDS.percentile;
}

export function canShowSampleAverage(participantCount: number): boolean {
  return participantCount >= PUBLIC_SAMPLE_THRESHOLDS.average;
}

export function getOneMultipleDisclosureTarget(recruitCount: number): number {
  return Math.max(PUBLIC_SAMPLE_THRESHOLDS.oneMultipleAbsolute, Math.max(0, recruitCount));
}

export function canShowSampleOneMultiplePoint(
  participantCount: number,
  recruitCount: number
): boolean {
  if (recruitCount < 1) return false;
  return participantCount >= getOneMultipleDisclosureTarget(recruitCount);
}

export function calculateSampleTopPercent(rank: number, participantCount: number): number | null {
  if (!canShowSamplePercentile(participantCount)) return null;
  if (!Number.isInteger(rank) || rank < 1 || rank > participantCount) return null;
  return Number(((rank / participantCount) * 100).toFixed(1));
}
