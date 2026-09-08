export type FullScoreSubject = {
  totalItems?: number | null;
  pointsPerItem?: number | null;
  alternateGroup?: string | null;
  isActive?: boolean;
};

/** Active mandatory subjects plus the largest full score in each choose-one group. */
export function computeFullScore(subjects: readonly FullScoreSubject[]): number {
  let total = 0;
  const groups = new Map<string, number>();
  for (const subject of subjects) {
    if (subject.isActive === false) continue;
    const score = (subject.totalItems ?? 0) * (subject.pointsPerItem ?? 0);
    if (!Number.isFinite(score) || score < 0) continue;
    const group = subject.alternateGroup?.trim();
    if (group) groups.set(group, Math.max(groups.get(group) ?? 0, score));
    else total += score;
  }
  return total + Array.from(groups.values()).reduce((sum, score) => sum + score, 0);
}
