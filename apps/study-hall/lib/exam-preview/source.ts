import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { notFound } from "@/lib/errors";
import type { RegularRawSource } from "@/lib/exam-analysis-types";
import { ymd } from "./metrics";

/** Server-only adapter. Import tables and legacy score records remain the source of truth. */
export async function loadAnalysisSource(
  slug: string,
): Promise<RegularRawSource> {
  if (isMockMode()) {
    const state = await readMockState();
    const division = state.divisions.find((d) => d.slug === slug);
    if (!division) throw notFound("학원을 찾을 수 없습니다.");
    const divisionId = division.id;
    return {
      divisionId,
      examTypes: (state.examTypesByDivision[slug] ?? []).filter(
        (r) => r.divisionId === divisionId,
      ),
      students: (state.studentsByDivision[slug] ?? []).filter(
        (r) => r.divisionId === divisionId,
      ),
      sessions: (state.examSessionsByDivision[slug] ?? []).filter(
        (r) => r.divisionId === divisionId,
      ),
      items: (state.examSessionItemsByDivision[slug] ?? []).filter(
        (r) => r.divisionId === divisionId,
      ),
      participants: (
        state.examSessionParticipantsByDivision[slug] ?? []
      ).filter((r) => r.divisionId === divisionId),
      responses: (state.examItemResponsesByDivision[slug] ?? []).filter(
        (r) => r.divisionId === divisionId,
      ),
      targets: state.scoreTargetsByDivision[slug] ?? [],
    };
  }
  const { prisma } = await import("@/lib/prisma");
  const division = await prisma.division.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!division) throw notFound("학원을 찾을 수 없습니다.");
  const divisionId = division.id;
  const [
    examTypes,
    students,
    sessions,
    items,
    participants,
    responses,
    targets,
  ] = await Promise.all([
    prisma.examType.findMany({
      where: { divisionId },
      include: {
        subjects: {
          where: { examType: { divisionId } },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    prisma.student.findMany({
      where: { divisionId },
      select: { id: true, divisionId: true, name: true, studentNumber: true },
    }),
    prisma.examSession.findMany({
      where: { divisionId },
      select: {
        id: true,
        divisionId: true,
        examTypeId: true,
        examDate: true,
        primarySubjectId: true,
        topic: true,
        fullScore: true,
        itemCount: true,
        externalCohortSize: true,
        externalStats: true,
      },
    }),
    prisma.examSessionItem.findMany({ where: { divisionId } }),
    prisma.examSessionParticipant.findMany({ where: { divisionId } }),
    prisma.examItemResponse.findMany({ where: { divisionId } }),
    prisma.scoreTarget.findMany({
      where: { examType: { divisionId }, student: { divisionId } },
      select: { studentId: true, examTypeId: true, targetScore: true },
    }),
  ]);
  return {
    divisionId,
    examTypes,
    students,
    sessions,
    targets,
    items: items as RegularRawSource["items"],
    participants: participants as RegularRawSource["participants"],
    responses,
  };
}

export async function loadLegacyAnalysisScores(
  slug: string,
  divisionId: string,
  studentId?: string,
) {
  if (isMockMode()) {
    const state = await readMockState();
    return {
      regular: (state.examScoresByDivision[slug] ?? []).filter(
        (r) => !studentId || r.studentId === studentId,
      ),
      morning: (state.morningExamScoresByDivision[slug] ?? []).filter(
        (r) => !studentId || r.studentId === studentId,
      ),
    };
  }
  const { prisma } = await import("@/lib/prisma");
  const where = {
    ...(studentId ? { studentId } : {}),
    student: { divisionId },
    examType: { divisionId },
  };
  const [regular, morning] = await Promise.all([
    prisma.examScore.findMany({
      where,
      select: {
        id: true,
        studentId: true,
        examTypeId: true,
        examDate: true,
        scores: true,
          totalScore: true,
          rankInClass: true,
          notes: true,
      },
    }),
    prisma.morningExamScore.findMany({
      where,
      select: {
        id: true,
        studentId: true,
        examTypeId: true,
        subjectId: true,
        examDate: true,
        score: true,
      },
    }),
  ]);
  return {
    regular: regular.map((r) => ({
      ...r,
      examDate: r.examDate ? ymd(r.examDate) : null,
      scores: r.scores as Record<string, number>,
    })),
    morning: morning.map((r) => ({ ...r, examDate: ymd(r.examDate) })),
  };
}

export async function loadAnalysisCounseling(
  slug: string,
  divisionId: string,
  studentId: string,
  from: string,
  to: string,
) {
  let attendance: { status: string }[], phones: { status: string }[];
  if (isMockMode()) {
    const state = await readMockState();
    attendance = (state.attendanceByDivision[slug] ?? []).filter(
      (r) => r.studentId === studentId && r.date >= from && r.date <= to,
    );
    phones = (state.phoneSubmissionsByDivision[slug] ?? []).filter(
      (r) =>
        r.divisionId === divisionId &&
        r.studentId === studentId &&
        r.date >= from &&
        r.date <= to,
    );
  } else {
    const { prisma } = await import("@/lib/prisma");
    const where = {
      studentId,
      student: { divisionId },
      date: { gte: new Date(from), lte: new Date(to) },
    };
    [attendance, phones] = await Promise.all([
      prisma.attendance.findMany({ where, select: { status: true } }),
      prisma.phoneSubmission.findMany({
        where: { ...where, divisionId },
        select: { status: true },
      }),
    ]);
  }
  return {
    from,
    to,
    present: attendance.filter((r) => r.status === "PRESENT").length,
    tardy: attendance.filter((r) => r.status === "TARDY").length,
    absent: attendance.filter((r) => r.status === "ABSENT").length,
    other: attendance.filter(
      (r) => !["PRESENT", "TARDY", "ABSENT"].includes(r.status),
    ).length,
    submitted: phones.filter((r) => r.status === "SUBMITTED").length,
    notSubmitted: phones.filter((r) => r.status === "NOT_SUBMITTED").length,
    rented: phones.filter((r) => r.status === "RENTED").length,
  };
}
