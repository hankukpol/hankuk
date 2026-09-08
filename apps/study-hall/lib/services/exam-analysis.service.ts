import { unstable_cache } from "next/cache";
import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { forbidden, notFound } from "@/lib/errors";
import { AnalysisAssemblyError, assembleRegularCohort, assembleRegularStudentReport, assembleRegularSessions, authorizeRegularViewer, selectRegularSessionIds } from "@/lib/exam-analysis-assembler";
import type { RegularRawSource, RegularRawBundle, RegularCohortAnalysis, RegularStudentReport, RegularSessionListItem, Viewer } from "@/lib/exam-analysis-types";
import { getExamAnalysisSettings } from "@/lib/services/settings.service";
import { listStudentExamResults } from "@/lib/services/exam.service";

async function translate<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    if (error instanceof AnalysisAssemblyError) throw error.status === 403 ? forbidden(error.message) : notFound(error.message);
    throw error;
  }
}
async function loadMock(divisionSlug: string, examTypeId: string, examDate?: string): Promise<RegularRawSource> {
  const state = await readMockState();
  const division = state.divisions.find(row => row.slug === divisionSlug);
  if (!division) throw notFound("지점을 찾을 수 없습니다.");
  const source: RegularRawSource = {
    divisionId: division.id, examTypes: state.examTypesByDivision[divisionSlug] ?? [],
    sessions: state.examSessionsByDivision[divisionSlug] ?? [], students: state.studentsByDivision[divisionSlug] ?? [],
    participants: state.examSessionParticipantsByDivision[divisionSlug] ?? [], items: [], responses: [], targets: state.scoreTargetsByDivision[divisionSlug] ?? [],
  };
  if (examDate === undefined) return source;
  const selection = selectRegularSessionIds(source, examTypeId, examDate);
  return { ...source,
    participants: source.participants.filter(row => selection.participantSessionIds.includes(row.sessionId)),
    items: (state.examSessionItemsByDivision[divisionSlug] ?? []).filter(row => row.sessionId === selection.currentId),
    responses: (state.examItemResponsesByDivision[divisionSlug] ?? []).filter(row => row.sessionId === selection.currentId),
  };
}
async function loadDb(divisionSlug: string, examTypeId: string, examDate?: string): Promise<RegularRawSource> {
  const { prisma } = await import("@/lib/prisma");
  const division = await prisma.division.findUnique({ where: { slug: divisionSlug }, select: { id: true } });
  if (!division) throw notFound("지점을 찾을 수 없습니다.");
  const divisionId = division.id;
  const [examTypes, sessions] = await Promise.all([
    prisma.examType.findMany({ where: { divisionId, id: examTypeId }, include: { subjects: { where: { examType: { divisionId } } } } }),
    prisma.examSession.findMany({ where: { divisionId, examTypeId }, select: { id: true, divisionId: true, examTypeId: true, examDate: true, primarySubjectId: true, topic: true, fullScore: true, itemCount: true, externalCohortSize: true, externalStats: true } }),
  ]);
  const metadata = { divisionId, examTypes, sessions };
  // The exact same selector runs for both loaders; dates are never interpreted in SQL.
  const selection = examDate === undefined ? null : selectRegularSessionIds(metadata, examTypeId, examDate);
  const sessionIds = selection?.participantSessionIds ?? sessions.map(row => row.id);
  const participants = await prisma.examSessionParticipant.findMany({ where: { divisionId, sessionId: { in: sessionIds } } });
  const studentIds = Array.from(new Set(participants.map(row => row.studentId)));
  const students = await prisma.student.findMany({ where: { divisionId, id: { in: studentIds } }, select: { id: true, divisionId: true, name: true, studentNumber: true } });
  if (!selection) return { ...metadata, participants: participants as RegularRawSource["participants"], students, items: [], responses: [], targets: [] };
  const [items, responses, targets] = await Promise.all([
    prisma.examSessionItem.findMany({ where: { divisionId, sessionId: selection.currentId } }),
    prisma.examItemResponse.findMany({ where: { divisionId, sessionId: selection.currentId } }),
    prisma.scoreTarget.findMany({ where: { examTypeId, examType: { divisionId }, student: { divisionId, id: { in: studentIds } } }, select: { studentId: true, examTypeId: true, targetScore: true } }),
  ]);
  return { ...metadata, students, targets, participants: participants as RegularRawSource["participants"], items: items as RegularRawSource["items"], responses };
}
async function loadRegularBundle(divisionSlug: string, examTypeId: string, examDate: string): Promise<RegularRawBundle> {
  if (isMockMode()) {
    const [source, settings] = await Promise.all([loadMock(divisionSlug, examTypeId, examDate), getExamAnalysisSettings(divisionSlug)]);
    return { ...source, examTypeId, examDate, settings };
  }
  const cached = unstable_cache(() => loadDb(divisionSlug, examTypeId, examDate), ["exam-analysis", divisionSlug, examTypeId, examDate], { tags: [`exam-analysis:${divisionSlug}`], revalidate: 300 });
  const [source, settings] = await Promise.all([cached(), getExamAnalysisSettings(divisionSlug)]);
  return { ...source, examTypeId, examDate, settings };
}
export async function listRegularSessions(divisionSlug: string, examTypeId: string, studentId?: string): Promise<RegularSessionListItem[]> {
  if (isMockMode()) return translate(async () => assembleRegularSessions(await loadMock(divisionSlug, examTypeId), examTypeId, studentId));
  return translate(async () => assembleRegularSessions(await loadDb(divisionSlug, examTypeId), examTypeId, studentId));
}
export async function getRegularCohortAnalysis(divisionSlug: string, examTypeId: string, examDate: string, wrongTopLimit: 10 | 20 = 10): Promise<RegularCohortAnalysis> {
  if (isMockMode()) return translate(async () => assembleRegularCohort(await loadRegularBundle(divisionSlug, examTypeId, examDate), wrongTopLimit));
  return translate(async () => assembleRegularCohort(await loadRegularBundle(divisionSlug, examTypeId, examDate), wrongTopLimit));
}
async function studentReport(divisionSlug: string, examTypeId: string, examDate: string, studentId: string, viewer: Viewer): Promise<RegularStudentReport> {
  return translate(async () => {
    authorizeRegularViewer(studentId, viewer);
    const bundle = await loadRegularBundle(divisionSlug, examTypeId, examDate);
    // Verify membership before invoking the legacy trend dependency.
    const selected = selectRegularSessionIds(bundle, examTypeId, examDate);
    const ownedStudent = bundle.students.some(row => row.id === studentId && row.divisionId === bundle.divisionId);
    const participated = bundle.participants.some(row => row.studentId === studentId && row.divisionId === bundle.divisionId && row.sessionId === selected.currentId);
    if (!ownedStudent || !participated) throw notFound("학생의 해당 시험일 성적을 찾을 수 없습니다.");
    const trend = await listStudentExamResults(divisionSlug, studentId);
    return assembleRegularStudentReport({ ...bundle, trend }, studentId, viewer);
  });
}
export async function getRegularStudentReport(divisionSlug: string, examTypeId: string, examDate: string, studentId: string, viewer: Viewer): Promise<RegularStudentReport> {
  if (isMockMode()) return studentReport(divisionSlug, examTypeId, examDate, studentId, viewer);
  return studentReport(divisionSlug, examTypeId, examDate, studentId, viewer);
}
