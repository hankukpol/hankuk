import type { RegularSessionListItem } from './exam-analysis-types';
import type { StudentExamResultItem } from './services/exam.service';

/** Only the exact, unchanged score created by this import may inherit its rank. */
export function externalRankForRecord(record: StudentExamResultItem, session?: RegularSessionListItem): number | null {
  const imported = session?.importedScore;
  if (!imported || imported.id !== record.id || imported.total !== record.totalScore) return null;
  const scored = record.subjects.filter(subject => subject.score != null);
  if (scored.length !== Object.keys(imported.subjects).length || scored.some(subject => imported.subjects[subject.subjectId] !== subject.score)) return null;
  return session?.externalRank ?? null;
}
