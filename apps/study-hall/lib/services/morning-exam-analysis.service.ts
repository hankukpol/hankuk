import { unstable_cache } from 'next/cache';
import { isMockMode } from '@/lib/mock-data';
import { readMockState } from '@/lib/mock-store';
import { badRequest, forbidden, notFound } from '@/lib/errors';
import { AnalysisAssemblyError, authorizeRegularViewer } from '@/lib/exam-analysis-assembler';
import { assembleMorningCohort, assembleMorningStudentReport, morningWeek, selectMorningChoiceEvidence, selectMorningSessions } from '@/lib/morning-exam-analysis-assembler';
import { defaultMorningAnalysisRange, morningAnalysisRangeSchema } from '@/lib/morning-exam-analysis-schemas';
import { getExamAnalysisSettings } from '@/lib/services/settings.service';
import { getMorningExamWeeklySummary } from '@/lib/services/morning-exam.service';
import type { MorningRawSource, MorningRawBundle, MorningRange, MorningCohortAnalysis, MorningStudentReport } from '@/lib/morning-exam-analysis-types';
import type { Viewer } from '@/lib/exam-analysis-types';
async function translate<T>(work: () => Promise<T>): Promise<T> {
 try { return await work(); } catch (error) {
  if (error instanceof AnalysisAssemblyError) throw error.status === 403 ? forbidden(error.message) : notFound(error.message);
  throw error;
 }
}
function validateRange(range: MorningRange) { const parsed = morningAnalysisRangeSchema.safeParse(range); if (!parsed.success) throw badRequest('조회 기간을 확인해주세요. 최대 92일까지 조회할 수 있습니다.'); return parsed.data; }
async function weeklyRows(slug: string, typeId: string, source: MorningRawSource, range: MorningRange): Promise<MorningRawSource['weeklyRankings']> {
 const weeks = new Map<string, ReturnType<typeof morningWeek>>();
 for (const session of selectMorningSessions(source, typeId, range)) { const date = session.examDate instanceof Date ? session.examDate.toISOString().slice(0, 10) : session.examDate.slice(0, 10); const week = morningWeek(date); weeks.set(`${week.weekYear}-${week.weekNumber}`, week); }
 // One existing summary per distinct week, never per student. Keep only scalar rankings in the cache.
 const results = await Promise.all(Array.from(weeks.values()).map(async week => {
  const summary = await getMorningExamWeeklySummary(slug, typeId, week.weekYear, week.weekNumber);
  const ranked = summary.rankings.filter(r => r.weeklyRank !== null);
  return ranked.map(r => ({ studentId: r.studentId, ...week, rank: r.weeklyRank!, count: ranked.length }));
 }));
 return results.flat();
}
async function loadMock(slug: string, typeId: string, range: MorningRange): Promise<MorningRawSource> {
 const state = await readMockState(), division = state.divisions.find(d => d.slug === slug);
 if (!division) throw notFound('지점을 찾을 수 없습니다.');
 const metadata = { divisionId: division.id, examTypes: state.examTypesByDivision[slug] ?? [], sessions: state.examSessionsByDivision[slug] ?? [] };
 const selected = selectMorningSessions(metadata, typeId, range), ids = new Set(selected.map(s => s.id));
 const historical = state.examSessionParticipantsByDivision[slug] ?? [];
 const choiceEvidence = selectMorningChoiceEvidence({ ...metadata, participants: historical }, typeId, range.to);
 const source: MorningRawSource = { ...metadata, choiceEvidence, sessions: selected, students: state.studentsByDivision[slug] ?? [], participants: (state.examSessionParticipantsByDivision[slug] ?? []).filter(p => ids.has(p.sessionId)), items: (state.examSessionItemsByDivision[slug] ?? []).filter(i => ids.has(i.sessionId)), responses: (state.examItemResponsesByDivision[slug] ?? []).filter(r => ids.has(r.sessionId)), weeklyRankings: [] };
 return { ...source, weeklyRankings: await weeklyRows(slug, typeId, source, range) };
}
async function loadDb(slug: string, typeId: string, range: MorningRange): Promise<MorningRawSource> {
 const { prisma } = await import('@/lib/prisma');
 const division = await prisma.division.findUnique({ where: { slug }, select: { id: true } });
 if (!division) throw notFound('지점을 찾을 수 없습니다.');
 const divisionId = division.id;
 const [examTypes, sessions] = await Promise.all([
  prisma.examType.findMany({ where: { divisionId, id: typeId }, include: { subjects: { where: { examType: { divisionId } }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] } } }),
  prisma.examSession.findMany({ where: { divisionId, examTypeId: typeId }, select: { id: true, divisionId: true, examTypeId: true, examDate: true, primarySubjectId: true, topic: true, fullScore: true, itemCount: true, externalCohortSize: true, externalStats: true } }),
 ]);
 const metadata = { divisionId, examTypes, sessions }, selected = selectMorningSessions(metadata, typeId, range), ids = selected.map(s => s.id);
 const historicalIds = sessions.filter(s => (s.examDate instanceof Date ? s.examDate.toISOString().slice(0, 10) : String(s.examDate).slice(0, 10)) <= range.to).map(s => s.id);
 const [participants, items, responses, students] = await Promise.all([
  prisma.examSessionParticipant.findMany({ where: { divisionId, sessionId: { in: historicalIds } } }),
  prisma.examSessionItem.findMany({ where: { divisionId, sessionId: { in: ids } } }),
  prisma.examItemResponse.findMany({ where: { divisionId, sessionId: { in: ids } } }),
  prisma.student.findMany({ where: { divisionId }, select: { id: true, divisionId: true, name: true, studentNumber: true, status: true, studyTrack: true } }),
 ]);
 const source: MorningRawSource = { ...metadata, choiceEvidence: selectMorningChoiceEvidence({ ...metadata, participants: participants as MorningRawSource['participants'] }, typeId, range.to), sessions: selected, students, participants: participants.filter(p => ids.includes(p.sessionId)) as MorningRawSource['participants'], items: items as MorningRawSource['items'], responses, weeklyRankings: [] };
 return { ...source, weeklyRankings: await weeklyRows(slug, typeId, source, range) };
}
async function loadBundle(slug: string, typeId: string, range: MorningRange): Promise<MorningRawBundle> {
 const valid = validateRange(range);
 if (isMockMode()) { const [source, settings] = await Promise.all([loadMock(slug, typeId, valid), getExamAnalysisSettings(slug)]); return { ...source, examTypeId: typeId, range: valid, settings }; }
 const cached = unstable_cache(() => loadDb(slug, typeId, valid), ['morning-exam-analysis', slug, typeId, valid.from, valid.to], { tags: [`exam-analysis:${slug}`], revalidate: 300 });
 const [source, settings] = await Promise.all([cached(), getExamAnalysisSettings(slug)]);
 return { ...source, examTypeId: typeId, range: valid, settings };
}
export async function getMorningCohortAnalysis(slug: string, typeId: string, range: MorningRange = defaultMorningAnalysisRange()): Promise<MorningCohortAnalysis> {
 if (isMockMode()) return translate(async () => assembleMorningCohort(await loadBundle(slug, typeId, range)));
 return translate(async () => assembleMorningCohort(await loadBundle(slug, typeId, range)));
}
export async function getMorningStudentReport(slug: string, typeId: string, studentId: string, range: MorningRange, viewer: Viewer): Promise<MorningStudentReport> {
 const work = async () => { authorizeRegularViewer(studentId, viewer); return assembleMorningStudentReport(await loadBundle(slug, typeId, range), studentId, viewer); };
 if (isMockMode()) return translate(work);
 return translate(work);
}
