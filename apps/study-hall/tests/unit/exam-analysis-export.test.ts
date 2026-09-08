import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { assembleRegularCohort } from '../../lib/exam-analysis-assembler';
import { assembleMorningCohort } from '../../lib/morning-exam-analysis-assembler';
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from '../../lib/exam-analysis-settings';
import type { RegularRawBundle } from '../../lib/exam-analysis-types';
import { regularAnalysisExportRows, morningAnalysisExportRows } from '../../lib/exam-analysis-export-meta';
import * as exportMeta from '../../lib/exam-analysis-export-meta';
import * as exportSchemas from '../../lib/exam-analysis-export-schemas';

function fixture(): RegularRawBundle {
  const current = { id: 'current', divisionId: 'd', examTypeId: 'e', examDate: '2026-09-08', primarySubjectId: null, topic: null, fullScore: 100, itemCount: 25, externalCohortSize: 2, externalStats: { count: 2, mean: 60, distribution: [{ score: 40, count: 1 }, { score: 80, count: 1 }], subjects: {}, regions: {} } };
  const participant = { divisionId: 'd', sessionId: 'current', studentId: 's', totalScore: 40, subjectScores: { a: 40 }, isPartial: false, region: null, externalRank: 2, externalPercentile: 25, regionalRank: null };
  return {
    divisionId: 'd', examTypeId: 'e', examDate: current.examDate, settings: structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS),
    examTypes: [{ id: 'e', name: '설정된 시험', category: 'REGULAR', subjects: [{ id: 'a', name: '설정된 과목', totalItems: 25, pointsPerItem: 4, isActive: true }] }],
    sessions: [current, { ...current, id: 'previous', examDate: '2026-08-08' }],
    students: [{ id: 's', divisionId: 'd', name: '=관리자용 실명', studentNumber: '00123' }],
    participants: [participant, { ...participant, sessionId: 'previous', totalScore: 70, subjectScores: { a: 70 } }],
    items: Array.from({ length: 25 }, (_, i) => ({ divisionId: 'd', sessionId: 'current', subjectId: 'a', itemNo: i + 1, position: i + 1, answerKey: i === 0 ? '1,2' : '2', points: 4, correctRatePct: 75, choiceRates: {}, mostCommonWrong: '1' })),
    responses: Array.from({ length: 25 }, (_, i) => ({ divisionId: 'd', sessionId: 'current', studentId: 's', subjectId: 'a', itemNo: i + 1, answer: '1', isCorrect: false })), targets: [],
  };
}
function morning() {
  const raw = fixture();
  return assembleMorningCohort({ ...raw, examTypes: raw.examTypes.map(e => ({ ...e, category: 'MORNING' })), sessions: raw.sessions.filter(s => s.id === 'current').map(s => ({ ...s, primarySubjectId: 'a', topic: '기본 단원' })), weeklyRankings: [], range: { from: '2026-09-01', to: '2026-09-30' } });
}
test('regular export produces three sheets, unmasked names/numbers, previous-date deltas and twenty wrong items', () => {
  const raw = fixture();
  assert.equal(assembleRegularCohort(raw).classWrongTop.length, 10, 'existing UI remains TOP10');
  const cohort = assembleRegularCohort(raw, 20), before = structuredClone(cohort), result = regularAnalysisExportRows(cohort);
  assert.equal(result.sheets.length, 3); assert.deepEqual(result.sheets.map(s => s.rows.length), [1, 1, 20]);
  assert.deepEqual(result.sheets.map(s => s.name), ['정기 석차표', '정기 과목 평균', '정기 반 오답 TOP20']);
  const ranking = result.sheets[0], row = ranking.rows[0];
  assert.equal(row[ranking.header.indexOf('이름')], '=관리자용 실명');
  assert.equal(row[ranking.header.indexOf('수험번호')], '00123');
  assert.equal(row[ranking.header.indexOf('직전 대비 총점')], -30);
  assert.equal(row[ranking.header.indexOf('직전 대비 석차')], 0);
  assert.equal(result.sheets[2].rows[0][3], '1,2'); assert.equal(result.sheets[2].rows.at(-1)?.[2], 20);
  for (const sheet of result.sheets) assert.ok(sheet.rows.every(r => r.length === sheet.header.length));
  assert.deepEqual(cohort, before);
});
test('first exam and untaken alternate export null rather than invented zero values', () => {
  const raw = fixture(); raw.sessions = raw.sessions.filter(s => s.id === 'current');
  raw.examTypes[0].subjects[0].alternateGroup = 'choice'; raw.examTypes[0].subjects.push({ ...raw.examTypes[0].subjects[0], id: 'b', name: '다른 선택 과목' });
  raw.items.push({ ...raw.items[0], subjectId: 'b' });
  const result = regularAnalysisExportRows(assembleRegularCohort(raw, 20)), ranking = result.sheets[0];
  assert.equal(ranking.rows[0][ranking.header.indexOf('직전 대비 총점')], null);
  assert.equal(ranking.rows[0][ranking.header.indexOf('직전 대비 석차')], null);
  assert.equal(ranking.rows[0][ranking.header.indexOf('다른 선택 과목')], null);
});
test('morning export reuses student-subject, date-subject and topic counts and preserves administrator identity', () => {
  const cohort = morning(), before = structuredClone(cohort), result = morningAnalysisExportRows(cohort);
  assert.equal(result.sheets.length, 3); assert.deepEqual(result.sheets.map(s => s.rows.length), [1, 1, 1]);
  assert.deepEqual(result.sheets.map(s => s.name), ['아침 학생 과목 평균', '아침 날짜 과목 평균', '아침 단원 평균']);
  assert.deepEqual(result.sheets[0].rows[0], ['2026-09-01', '2026-09-30', '=관리자용 실명', '00123', '설정된 과목', 40, 1, 1, 100]);
  assert.equal(result.sheets[2].rows[0][4], 1); assert.equal(result.sheets[2].rows[0][3], '기본 단원');
  for (const sheet of result.sheets) assert.ok(sheet.rows.every(r => r.length === sheet.header.length));
  assert.deepEqual(cohort, before);
});
test('empty morning cohort keeps three named sheets with headers and no fabricated rows', () => {
  const cohort = morning(); cohort.studentSubjects = []; cohort.heatmap = []; cohort.topics = [];
  const result = morningAnalysisExportRows(cohort);
  assert.equal(result.sheets.length, 3); assert.ok(result.sheets.every(s => s.header.length && !s.rows.length));
});
function serviceHarness() {
  const regular = assembleRegularCohort(fixture(), 20), morningReport = morning();
  const calls: Array<{ kind: string; args: unknown[] }> = [];
  const dependencies: Record<string, unknown> = {
    '@/lib/exam-analysis-export-meta': exportMeta,
    '@/lib/exam-analysis-export-schemas': exportSchemas,
    '@/lib/services/exam-analysis.service': { getRegularCohortAnalysis: async (...args: unknown[]) => { calls.push({ kind: 'regular', args }); return regular; } },
    '@/lib/services/morning-exam-analysis.service': { getMorningCohortAnalysis: async (...args: unknown[]) => { calls.push({ kind: 'morning', args }); return morningReport; } },
  };
  const code = ts.transpileModule(readFileSync(new URL('../../lib/services/exam-analysis-export.service.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const serviceModule = { exports: {} };
  new Function('require', 'module', 'exports', code)((name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, serviceModule, serviceModule.exports);
  return { calls, service: serviceModule.exports as typeof import('../../lib/services/exam-analysis-export.service') };
}
test('export service forwards tenant/date and fixed TOP20 once, morning uses one cohort call without student N+1', async () => {
  const h = serviceHarness();
  assert.equal((await h.service.getExamAnalysisExportRows('tenant', { kind: 'regular', examTypeId: 'e', examDate: '2026-09-08' })).sheets[2].rows.length, 20);
  assert.equal((await h.service.getExamAnalysisExportRows('tenant', { kind: 'morning', examTypeId: 'e', from: '2026-09-01', to: '2026-09-30' })).sheets.length, 3);
  assert.deepEqual(h.calls, [{ kind: 'regular', args: ['tenant', 'e', '2026-09-08', 20] }, { kind: 'morning', args: ['tenant', 'e', { from: '2026-09-01', to: '2026-09-30' }] }]);
});
test('export rejects impossible dates, empty exam types and excessive ranges before any data query', async () => {
  const h = serviceHarness();
  await assert.rejects(h.service.getExamAnalysisExportRows('tenant', { kind: 'regular', examTypeId: 'e', examDate: '2026-02-30' }));
  await assert.rejects(h.service.getExamAnalysisExportRows('tenant', { kind: 'regular', examTypeId: ' ', examDate: '2026-09-08' }));
  await assert.rejects(h.service.getExamAnalysisExportRows('tenant', { kind: 'morning', examTypeId: 'e', from: '2026-01-01', to: '2026-09-30' }));
  assert.deepEqual(h.calls, []);
});
