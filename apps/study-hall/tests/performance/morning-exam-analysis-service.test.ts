import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as assembler from '../../lib/morning-exam-analysis-assembler';
import * as regularAssembler from '../../lib/exam-analysis-assembler';
import * as schemas from '../../lib/morning-exam-analysis-schemas';
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from '../../lib/exam-analysis-settings';
import type { MorningRawSource } from '../../lib/morning-exam-analysis-types';
function harness(mock: boolean) {
 const raw: MorningRawSource = { divisionId: 'd', examTypes: [{ id: 'e', name: '시험', category: 'MORNING', studyTrack: null, subjects: [{ id: 'a', name: '과목', totalItems: 20, pointsPerItem: 5, isActive: true }] }],
 sessions: Array.from({ length: 4 }, (_, i) => ({ id: `session${i}`, divisionId: 'd', examTypeId: 'e', examDate: `2026-09-${String(1 + i * 7).padStart(2, '0')}`, primarySubjectId: 'a', topic: '단원', fullScore: 100, itemCount: 1, externalCohortSize: 2, externalStats: { mean: 70, count: 2 } })),
 students: [{ id: 's', divisionId: 'd', name: '실명', studentNumber: '00123', status: 'ACTIVE', studyTrack: null }, { id: 'p', divisionId: 'd', name: '동료', studentNumber: '00456', status: 'ACTIVE', studyTrack: null }],
 participants: [], items: [], responses: [], weeklyRankings: [] };
 for (const session of raw.sessions) for (const student of raw.students) {
  raw.participants.push({ divisionId: 'd', sessionId: session.id, studentId: student.id, region: null, externalRank: student.id === 's' ? 2 : 1, externalPercentile: 50, regionalRank: null, subjectScores: { a: student.id === 's' ? 50 : 80 }, totalScore: student.id === 's' ? 50 : 80, isPartial: false });
 }
 const calls: Array<{ model: string; args: { where: Record<string, unknown> } }> = [], cacheCalls: Array<{ key: string[]; options: unknown }> = [];
 let settings = structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS), reads = 0, settingsReads = 0, weekReads = 0;
 const state = { divisions: [{ id: 'd', slug: 'tenant' }], examTypesByDivision: { tenant: raw.examTypes }, examSessionsByDivision: { tenant: raw.sessions }, studentsByDivision: { tenant: raw.students }, examSessionParticipantsByDivision: { tenant: raw.participants }, examSessionItemsByDivision: { tenant: raw.items }, examItemResponsesByDivision: { tenant: raw.responses } };
 const model = (name: string, rows: unknown[]) => ({ findMany: async (args: { where: Record<string, unknown> }) => { calls.push({ model: name, args }); const w = args.where; return rows.filter(value => { const row = value as Record<string, unknown>; return (name === 'examType' || row.divisionId === w.divisionId) && (!w.examTypeId || row.examTypeId === w.examTypeId) && (!w.sessionId || (w.sessionId as { in: string[] }).in.includes(row.sessionId as string)); }); } });
 const prisma = { division: { findUnique: async (args: { where: { slug: string } }) => { calls.push({ model: 'division', args }); return args.where.slug === 'tenant' ? { id: 'd' } : null; } }, examType: model('examType', raw.examTypes), examSession: model('examSession', raw.sessions), student: model('student', raw.students), examSessionParticipant: model('examSessionParticipant', raw.participants), examSessionItem: model('examSessionItem', raw.items), examItemResponse: model('examItemResponse', raw.responses) };
 const cache = new Map<string, Promise<unknown>>();
 const dependencies: Record<string, unknown> = {
  'next/cache': { unstable_cache: (fn: () => Promise<unknown>, key: string[], options: unknown) => { cacheCalls.push({ key, options }); return () => { const k = JSON.stringify(key); if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); }; } },
  '@/lib/mock-data': { isMockMode: () => mock }, '@/lib/mock-store': { readMockState: async () => { reads++; return state; } }, '@/lib/prisma': { prisma },
  '@/lib/errors': Object.fromEntries([['badRequest', 400], ['forbidden', 403], ['notFound', 404]].map(([name, status]) => [name, (message: string) => Object.assign(new Error(message), { status })])),
  '@/lib/exam-analysis-assembler': regularAssembler, '@/lib/morning-exam-analysis-assembler': assembler, '@/lib/morning-exam-analysis-schemas': schemas,
  '@/lib/services/settings.service': { getExamAnalysisSettings: async () => { settingsReads++; return settings; } },
  '@/lib/services/morning-exam.service': { getMorningExamWeeklySummary: async (slug: string, typeId: string, weekYear: number, weekNumber: number) => { assert.equal(slug, 'tenant'); assert.equal(typeId, 'e'); weekReads++; return { weekYear, weekNumber, rankings: [{ studentId: 's', weeklyRank: 2 }, { studentId: 'p', weeklyRank: 1 }] }; } },
 };
 const code = ts.transpileModule(readFileSync(new URL('../../lib/services/morning-exam-analysis.service.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const serviceModule = { exports: {} }; new Function('require', 'module', 'exports', code)((name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, serviceModule, serviceModule.exports);
 return { raw, calls, cacheCalls, service: serviceModule.exports as typeof import('../../lib/services/morning-exam-analysis.service'), setSettings: (value: typeof settings) => { settings = value; }, counts: () => ({ reads, settingsReads, weekReads }) };
}
const range = { from: '2026-09-01', to: '2026-09-30' };
test('morning service mock/DB assemble identical cohort and masked student report', async () => {
 const a = harness(true), b = harness(false);
 assert.deepEqual(await a.service.getMorningCohortAnalysis('tenant', 'e', range), await b.service.getMorningCohortAnalysis('tenant', 'e', range));
 const viewer = { role: 'STUDENT', studentId: 's' } as const;
 const r = await a.service.getMorningStudentReport('tenant', 'e', 's', range, viewer);
 assert.deepEqual(r, await b.service.getMorningStudentReport('tenant', 'e', 's', range, viewer)); assert.equal(r.student.name, null); assert.ok(!JSON.stringify(r).includes('실명')); assert.match(r.student.studentNumber, /^\d{2}\*+$/);
 assert.equal(a.calls.length, 0);
});
test('morning raw cache retains tenant/range tags while settings changes immediately affect declines', async () => {
 const h = harness(false), changed = structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS);
 changed.morning.classGapPercent = 20; h.setSettings(changed);
 assert.equal((await h.service.getMorningCohortAnalysis('tenant', 'e', range)).declines.length, 0);
 const count = h.calls.length, weeks = h.counts().weekReads;
 changed.morning.classGapPercent = 15;
 assert.equal((await h.service.getMorningCohortAnalysis('tenant', 'e', range)).declines.length, 1);
 assert.equal(h.calls.length, count); assert.equal(h.counts().weekReads, weeks); assert.equal(weeks, 4); assert.equal(h.counts().settingsReads, 2);
 assert.deepEqual(h.cacheCalls[0], { key: ['morning-exam-analysis', 'tenant', 'e', range.from, range.to], options: { tags: ['exam-analysis:tenant'], revalidate: 300 } });
 for (const c of h.calls) if (c.model === 'division') assert.equal(c.args.where.slug, 'tenant'); else assert.equal(c.args.where.divisionId, 'd');
 assert.equal(h.calls.filter(c => c.model === 'examItemResponse').length, 1);
});
test('morning service rejects IDOR/assistants before reads and invalid range before database loads', async () => {
 for (const mock of [true, false]) { const h = harness(mock);
  await assert.rejects(h.service.getMorningStudentReport('tenant', 'e', 's', range, { role: 'STUDENT', studentId: 'p' }), (e: unknown) => (e as { status: number }).status === 403);
  await assert.rejects(h.service.getMorningStudentReport('tenant', 'e', 's', range, { role: 'ASSISTANT' }), (e: unknown) => (e as { status: number }).status === 403);
  await assert.rejects(h.service.getMorningCohortAnalysis('tenant', 'e', { from: '2026-02-30', to: '2026-09-30' }), (e: unknown) => (e as { status: number }).status === 400);
  assert.equal(h.calls.length, 0); assert.equal(h.counts().reads, 0);
 }
});
test('both loaders preserve past alternate choice evidence without using future attempts', async () => {
 for (const mock of [true, false]) { const h = harness(mock); h.raw.examTypes[0].subjects[0].alternateGroup = 'choice';
  h.raw.sessions.unshift({ ...h.raw.sessions[0], id: 'history', examDate: '2026-08-25' });
  const past = { ...h.raw.participants[0], sessionId: 'history' }; // Keep the array captured by both loader stubs.
  h.raw.participants.splice(0, h.raw.participants.length, past);
  const r = await h.service.getMorningStudentReport('tenant', 'e', 's', range, { role: 'ADMIN' });
  assert.equal(r.subjects[0].expected, 4); assert.equal(r.subjects[0].attended, 0); assert.equal(r.subjects[0].flags[0].kind, 'lowAttendance');
 }
});
