import assert from 'node:assert/strict';
import test from 'node:test';
import { externalRankForRecord } from '../../lib/exam-record-rank';
import type { StudentExamResultItem } from '../../lib/services/exam.service';

test('rank belongs only to the exact imported, unchanged score record', () => {
  const record: StudentExamResultItem = { id: 'imported', examTypeId: 'exam', examTypeName: '시험', examRound: 1, examDate: '2026-09-01', totalScore: 80, rankInClass: 2, notes: null, subjects: [{ subjectId: 'a', name: '과목', totalItems: 20, pointsPerItem: 5, maxScore: 100, score: 80 }] };
  const session = { sessionId: 'session', examDate: record.examDate!, participantCount: 5, externalRank: 57, importedScore: { id: 'imported', total: 80, subjects: { a: 80 } } };
  assert.equal(externalRankForRecord(record, session), 57);
  assert.equal(externalRankForRecord({ ...record, id: 'manual-same-day' }, session), null);
  assert.equal(externalRankForRecord({ ...record, totalScore: 85 }, session), null);
  assert.equal(externalRankForRecord({ ...record, subjects: [{ ...record.subjects[0], subjectId: 'different' }] }, session), null);
  assert.equal(externalRankForRecord(record, { ...session, importedScore: null }), null);
  assert.equal(externalRankForRecord(record), null);
  assert.equal(record.rankInClass, 2);
});
