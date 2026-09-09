import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleMorningCohort, assembleMorningStudentReport } from '../../lib/morning-exam-analysis-assembler';
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from '../../lib/exam-analysis-settings';
import type { MorningRawBundle } from '../../lib/morning-exam-analysis-types';
export function morningFixture(): MorningRawBundle {
 return { divisionId: 'd', examTypeId: 'e', range: { from: '2026-08-01', to: '2026-09-30' }, settings: structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS),
 examTypes: [{ id: 'e', name: '시험', category: 'MORNING', subjects: [{ id: 'a', name: '과목A', totalItems: 20, pointsPerItem: 5, isActive: true, alternateGroup: 'choice' }, { id: 'b', name: '과목B', totalItems: 20, pointsPerItem: 5, isActive: true, alternateGroup: 'choice' }, { id: 'c', name: '누적', totalItems: 100, pointsPerItem: 1, isActive: true }] }],
 students: [{ id: 's', divisionId: 'd', name: '본인실명', studentNumber: '00123' }, { id: 'p', divisionId: 'd', name: '동료실명', studentNumber: '00456' }],
 sessions: [{ id: 'one', divisionId: 'd', examTypeId: 'e', examDate: '2026-09-08', primarySubjectId: 'a', topic: '단원', fullScore: 100, itemCount: 1, externalCohortSize: 10, externalStats: { mean: 80, count: 10 } }],
 participants: [{ divisionId: 'd', sessionId: 'one', studentId: 's', region: null, externalRank: 3, externalPercentile: 75, regionalRank: null, subjectScores: { a: 50 }, totalScore: 50, isPartial: false }, { divisionId: 'd', sessionId: 'one', studentId: 'p', region: null, externalRank: 1, externalPercentile: 95, regionalRank: null, subjectScores: { a: 100 }, totalScore: 100, isPartial: false }],
 items: [{ divisionId: 'd', sessionId: 'one', subjectId: 'a', itemNo: 1, position: 1, answerKey: '1', points: 5, correctRatePct: 80, choiceRates: {}, mostCommonWrong: '2' }],
 responses: [{ divisionId: 'd', sessionId: 'one', studentId: 's', subjectId: 'a', itemNo: 1, answer: '2', isCorrect: false }, { divisionId: 'd', sessionId: 'one', studentId: 'p', subjectId: 'a', itemNo: 1, answer: '1', isCorrect: true }], weeklyRankings: [] };
}
function report(b: MorningRawBundle) { return assembleMorningStudentReport(b, 's', { role: 'STUDENT', studentId: 's' }); }
test('first morning session withholds decline and slope; whole grading and external position remain public to owner', () => {
 const b = morningFixture(), r = report(b), c = assembleMorningCohort(b);
 assert.equal(r.student.name, null); assert.match(r.student.studentNumber, /^\d{2}\*+$/); assert.ok(!JSON.stringify(r).includes('실명'));
 assert.equal(r.subjects[0].insufficientSample, true); assert.equal(r.subjects[0].slope, null); assert.deepEqual(c.declines, []);
 assert.equal(r.dailyItems[0].diagnostics.list.length, 1); assert.equal(r.dailyItems[0].external.rank, 3); assert.equal(r.dailyItems[0].external.topPercent, 30);
 assert.equal(c.topics[0].count, 1); assert.equal(c.topics[0].internalAvg, 75);
});
test('alternate sibling does not increase attendance denominator or produce twenty wrong answers', () => {
 const b = morningFixture(); b.sessions.push({ ...b.sessions[0], id: 'sibling', primarySubjectId: 'b', examDate: '2026-09-09' });
 const r = report(b); assert.equal(r.summary.expected, 1); assert.equal(r.summary.attendanceRatePercent, 100); assert.ok(!r.subjects.some(s => s.subjectId === 'b')); assert.equal(r.dailyItems.length, 1);
});
test('foreign tenant rows and responses without participation cannot affect scores, items or counts', () => {
 const b = morningFixture(), expected = report(b);
 b.sessions.push({ ...b.sessions[0], id: 'foreign', divisionId: 'foreign' });
 b.participants.push({ ...b.participants[0], divisionId: 'foreign', totalScore: 999 });
 b.responses.push({ ...b.responses[0], divisionId: 'foreign', isCorrect: true }, { ...b.responses[0], studentId: 'unknown', isCorrect: true });
 b.items.push({ ...b.items[0], divisionId: 'foreign', itemNo: 999 });
 assert.deepEqual(report(b), expected);
});
test('low attendance suppresses all other decline kinds and configuration changes sample visibility', () => {
 const b = morningFixture(); for (let i = 1; i < 4; i++) b.sessions.push({ ...b.sessions[0], id: `missing${i}`, examDate: `2026-09-${10 + i}` });
 const s = report(b).subjects[0]; assert.deepEqual(s.flags.map(f => f.kind), ['lowAttendance']); assert.equal(s.slope, null);
 b.settings.morning.attendanceRatePercent = 0; assert.deepEqual(report(b).subjects[0].flags, []);
});
test('cumulative comparisons pair only same-week progress and skip unpaired weeks', () => {
 const b = morningFixture();
 b.sessions.push({ ...b.sessions[0], id: 'cum', primarySubjectId: 'c', examDate: '2026-09-11' }, { ...b.sessions[0], id: 'unpaired', primarySubjectId: 'c', examDate: '2026-09-18' });
 b.participants.push({ ...b.participants[0], sessionId: 'cum', subjectScores: { c: 70 }, totalScore: 70 }, { ...b.participants[0], sessionId: 'unpaired', subjectScores: { c: 0 }, totalScore: 0 });
 assert.deepEqual(report(b).cumulativeGap, { cumulativeAvg: 70, progressAvg: 50, gap: 20, pairedWeeks: 1 });
});
test('empty range retains missing-data nulls, empty lists and rejects assistants and other students', () => {
 const b = morningFixture(); b.sessions = []; b.weeklyRankings = [];
 const r = report(b); assert.equal(r.summary.average, null); assert.equal(r.summary.attendanceRatePercent, null); assert.deepEqual(r.dailyItems, []); assert.equal(r.cumulativeGap, null);
 assert.throws(() => assembleMorningStudentReport(b, 's', { role: 'ASSISTANT' }), /본인/);
 assert.throws(() => assembleMorningStudentReport(b, 's', { role: 'STUDENT', studentId: 'other' }), /본인/);
});

test('external rank denominator uses graded cohort rather than advertised Moon headcount', () => {
 const b = morningFixture(); b.sessions[0].externalCohortSize = 4; b.sessions[0].externalStats = { count: 3, distribution: [{ score: 50, count: 3 }] }; b.participants[0].externalRank = 1;
 assert.equal(report(b).dailyItems[0].external.count, 3); assert.equal(report(b).dailyItems[0].external.topPercent, 33.3);
});
test('historical alternate choice is retained but future and foreign evidence cannot select a sibling', () => {
 const b = morningFixture(); b.participants = b.participants.filter(p => p.studentId !== 's');
 b.sessions.push({ ...b.sessions[0], id: 'common', primarySubjectId: 'c', examDate: '2026-09-09' });
 b.participants.push({ ...b.participants[0], studentId: 's', sessionId: 'common', subjectScores: { c: 70 } });
 b.choiceEvidence = [{ divisionId: 'd', examTypeId: 'e', studentId: 's', subjectId: 'a', examDate: '2026-07-01' }, { divisionId: 'other', examTypeId: 'e', studentId: 's', subjectId: 'b', examDate: '2026-07-01' }, { divisionId: 'd', examTypeId: 'e', studentId: 's', subjectId: 'b', examDate: '2026-10-01' }];
 const r = report(b); assert.equal(r.summary.expected, 2); assert.equal(r.summary.attendanceRatePercent, 50); assert.deepEqual(r.subjects.find(s => s.subjectId === 'a')?.flags.map(f => f.kind), ['lowAttendance']); assert.ok(!r.subjects.some(s => s.subjectId === 'b'));
});
test('zero-attempt other-track and withdrawn students excluded from cohort attendance; old actual takers retained', () => {
 const b = morningFixture(); b.examTypes[0].studyTrack = 'target';
 b.students.push({ id: 'other', divisionId: 'd', name: 'other', studentNumber: '00222', studyTrack: 'other', status: 'ACTIVE' }, { id: 'withdrawn', divisionId: 'd', name: 'withdrawn', studentNumber: '00333', studyTrack: 'target', status: 'WITHDRAWN' }, { id: 'active', divisionId: 'd', name: 'active', studentNumber: '00555', studyTrack: 'target', status: 'ACTIVE' });
 const rows = assembleMorningCohort(b).studentSubjects; assert.ok(!rows.some(r => ['other', 'withdrawn'].includes(r.studentId))); assert.ok(rows.some(r => r.studentId === 'active')); assert.ok(rows.some(r => r.studentId === 's'));
});
