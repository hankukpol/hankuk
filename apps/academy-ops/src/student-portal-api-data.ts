import {
  AbsenceCategory,
  AbsenceStatus,
  AttendType,
  ExamType,
  ScoreSource,
  StudentStatus,
  Subject,
  type Prisma,
} from "@prisma/client";
import {
  getDailyAnalysis,
  getMonthlyStudentAnalysis,
  getStudentCumulativeAnalysis,
  getSubjectTrendAnalysis,
  parseTargetScores,
} from "@/lib/analytics/analysis";
import { recalculateStatusCache } from "@/lib/analytics/service";
import { buildAbsenceNoteSystemNote } from "@/lib/absence-notes/system-note";
import { resolveAcademyByHostname } from "@/lib/academy";
import { EXAM_TYPE_SUBJECTS, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { countsAsConfiguredAttendance } from "@/lib/scores/calculation";
import type { AttendanceDayStatus } from "@/components/student-portal/attendance-calendar";

type StudentPortalProfile = {
  examNumber: string;
  academyId: number | null;
  name: string;
  examType: ExamType;
  className: string | null;
  generation: number | null;
  currentStatus: StudentStatus;
  targetScores: ReturnType<typeof parseTargetScores>;
  isActive: boolean;
};

type StudentPortalScoreFilters = {
  examNumber: string;
  periodId?: number;
  date?: string;
  monthKey?: string;
  subject?: Subject;
};



function parseMonthKey(value?: string | null) {
  if (!value) {
    return null;
  }

  const [year, month] = value.split("-").map((item) => Number(item));

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  return { year, month };
}

function monthKey(year: number, month: number) {
  return `${year}-${month}`;
}

function sortDateValues(values: string[]) {
  return [...values].sort((left, right) => right.localeCompare(left));
}

function resolveSelectedPeriod<T extends { id: number; isActive: boolean }>(
  periods: T[],
  requestedPeriodId?: number,
) {
  return (
    periods.find((period) => period.id === requestedPeriodId) ??
    periods.find((period) => period.isActive) ??
    periods[0] ??
    null
  );
}

function subjectOptionsForExamType(examType: ExamType, subjects: Subject[]) {
  const preferred = EXAM_TYPE_SUBJECTS[examType];
  const subjectSet = new Set([...preferred, ...subjects]);
  return Array.from(subjectSet);
}

function resolveStudentAbsenceAttendanceOptions(absenceCategory: AbsenceCategory) {
  if (absenceCategory === AbsenceCategory.MILITARY) {
    return {
      attendCountsAsAttendance: true,
      attendGrantsPerfectAttendance: true,
    };
  }

  return {
    attendCountsAsAttendance: false,
    attendGrantsPerfectAttendance: false,
  };
}

function startOfTomorrow() {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

async function loadStudentPortalProfile(examNumber: string): Promise<StudentPortalProfile | null> {
  const student = await getPrisma().student.findUnique({
    where: {
      examNumber,
    },
    select: {
      examNumber: true,
      academyId: true,
      name: true,
      examType: true,
      className: true,
      generation: true,
      currentStatus: true,
      targetScores: true,
      isActive: true,
    },
  });

  if (!student || !student.isActive) {
    return null;
  }

  const academyId = student.academyId ?? (await resolveAcademyByHostname());

  return {
    ...student,
    academyId,
    targetScores: parseTargetScores(student.targetScores),
  };
}

async function loadStudentPortalScorePeriods(student: StudentPortalProfile) {
  return getPrisma().examPeriod.findMany({
    where: {
      academyId: student.academyId,
      sessions: {
        some: {
          examType: student.examType,
          scores: {
            some: {
              examNumber: student.examNumber,
            },
          },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });
}

async function loadStudentPortalAttendancePeriods(student: StudentPortalProfile) {
  return getPrisma().examPeriod.findMany({
    where: {
      academyId: student.academyId,
      OR: [
        {
          sessions: {
            some: {
              examType: student.examType,
              OR: [
                {
                  scores: {
                    some: {
                      academyId: student.academyId,
                      examNumber: student.examNumber,
                    },
                  },
                },
                {
                  absenceNotes: {
                    some: {
                      academyId: student.academyId,
                      examNumber: student.examNumber,
                    },
                  },
                },
              ],
            },
          },
        },
        {
          weeklyStatusSnapshots: {
            some: {
              examNumber: student.examNumber,
              examType: student.examType,
            },
          },
        },
      ],
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });
}

async function loadStudentPortalAbsenceNotePeriods(student: StudentPortalProfile) {
  return getPrisma().examPeriod.findMany({
    where: {
      academyId: student.academyId,
      OR: [
        {
          enrollments: {
            some: {
              examNumber: student.examNumber,
            },
          },
        },
        {
          sessions: {
            some: {
              examType: student.examType,
              OR: [
                {
                  scores: {
                    some: {
                      academyId: student.academyId,
                      examNumber: student.examNumber,
                    },
                  },
                },
                {
                  absenceNotes: {
                    some: {
                      academyId: student.academyId,
                      examNumber: student.examNumber,
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });
}

async function hasStudentPortalPeriodAccess(
  prisma: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  input: {
    academyId: number | null;
    examNumber: string;
    examType: ExamType;
    periodId: number;
  },
) {
  const [enrollment, score, absenceNote] = await Promise.all([
    prisma.periodEnrollment.findFirst({
      where: {
        periodId: input.periodId,
        examNumber: input.examNumber,
        period: {
          academyId: input.academyId,
        },
      },
      select: {
        id: true,
      },
    }),
    prisma.score.findFirst({
      where: {
        academyId: input.academyId,
        examNumber: input.examNumber,
        session: {
          periodId: input.periodId,
          examType: input.examType,
        },
      },
      select: {
        id: true,
      },
    }),
    prisma.absenceNote.findFirst({
      where: {
        academyId: input.academyId,
        examNumber: input.examNumber,
        session: {
          periodId: input.periodId,
          examType: input.examType,
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  return Boolean(enrollment || score || absenceNote);
}

async function buildStudentPortalAttendancePeriodData(
  student: StudentPortalProfile,
  requestedPeriodId?: number,
) {
  const prisma = getPrisma();
  const periods = await loadStudentPortalAttendancePeriods(student);
  const selectedPeriod = resolveSelectedPeriod(periods, requestedPeriodId);

  if (!selectedPeriod) {
    const cumulative = await getStudentCumulativeAnalysis(student.examNumber);

    return {
      student,
      periods,
      selectedPeriod: null,
      currentStatus: cumulative?.student.currentStatus ?? student.currentStatus,
      thisWeekAbsences: 0,
      thisMonthAbsences: 0,
      totalSessions: cumulative?.totalSessions ?? 0,
      attendedSessions: cumulative?.attendedCount ?? 0,
      attendanceRate: cumulative?.attendanceRate ?? 0,
      attendanceIncludedSessionIds: new Set<number>(),
      scoreBySessionId: new Map<number, {
        sessionId: number;
        attendType: AttendType;
        finalScore: number | null;
      }>(),
      approvedAbsenceBySessionId: new Map<number, {
        sessionId: number;
        status: AbsenceStatus;
        reason: string;
        absenceCategory: AbsenceCategory | null;
        attendCountsAsAttendance: boolean;
      }>(),
      sessionIds: [] as number[],
    };
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      periodId: selectedPeriod.id,
      examType: student.examType,
      isCancelled: false,
      period: {
        academyId: student.academyId,
      },
      examDate: {
        lt: startOfTomorrow(),
      },
    },
    select: {
      id: true,
    },
  });

  const sessionIds = sessions.map((session) => session.id);
  const [scores, approvedAbsences, latestSnapshot] = await Promise.all([
    sessionIds.length > 0
      ? prisma.score.findMany({
          where: {
            academyId: student.academyId,
            examNumber: student.examNumber,
            sessionId: {
              in: sessionIds,
            },
          },
          select: {
            sessionId: true,
            attendType: true,
            finalScore: true,
          },
        })
      : Promise.resolve([]),
    sessionIds.length > 0
      ? prisma.absenceNote.findMany({
          where: {
            academyId: student.academyId,
            examNumber: student.examNumber,
            status: AbsenceStatus.APPROVED,
            sessionId: {
              in: sessionIds,
            },
          },
          select: {
            sessionId: true,
            status: true,
            reason: true,
            absenceCategory: true,
            attendCountsAsAttendance: true,
          },
        })
      : Promise.resolve([]),
    prisma.weeklyStatusSnapshot.findFirst({
      where: {
        periodId: selectedPeriod.id,
        examNumber: student.examNumber,
        examType: student.examType,
      },
      orderBy: [{ weekStartDate: "desc" }, { weekKey: "desc" }],
      select: {
        status: true,
        weekAbsenceCount: true,
        monthAbsenceCount: true,
      },
    }),
  ]);

  const scoreBySessionId = new Map(scores.map((score) => [score.sessionId, score]));
  const approvedAbsenceBySessionId = new Map(
    approvedAbsences.map((absence) => [absence.sessionId, absence]),
  );
  const attendanceIncludedSessionIds = new Set(
    approvedAbsences
      .filter((absence) => absence.attendCountsAsAttendance)
      .map((absence) => absence.sessionId),
  );

  const attendedSessions = sessions.filter((session) =>
    countsAsConfiguredAttendance(
      scoreBySessionId.get(session.id)?.attendType ?? AttendType.ABSENT,
      attendanceIncludedSessionIds.has(session.id),
    ),
  ).length;

  return {
    student,
    periods,
    selectedPeriod,
    currentStatus: latestSnapshot?.status ?? student.currentStatus,
    thisWeekAbsences: latestSnapshot?.weekAbsenceCount ?? 0,
    thisMonthAbsences: latestSnapshot?.monthAbsenceCount ?? 0,
    totalSessions: sessions.length,
    attendedSessions,
    attendanceRate:
      sessions.length === 0 ? 0 : Math.round((attendedSessions / sessions.length) * 1000) / 10,
    attendanceIncludedSessionIds,
    scoreBySessionId,
    approvedAbsenceBySessionId,
    sessionIds,
  };
}

async function applyApprovedStudentAbsenceNote(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0],
  note: {
    id: number;
    academyId: number | null;
    examNumber: string;
    sessionId: number;
    reason: string;
  },
) {
  const score = await tx.score.findFirst({
    where: {
      academyId: note.academyId,
      examNumber: note.examNumber,
      sessionId: note.sessionId,
    },
  });

  if (score && (score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE)) {
    throw new Error("SESSION_ALREADY_SCORED");
  }

  const systemNote = buildAbsenceNoteSystemNote(note.id, note.reason);

  if (!score) {
    await tx.score.create({
      data: {
        academyId: note.academyId,
        examNumber: note.examNumber,
        sessionId: note.sessionId,
        rawScore: null,
        oxScore: null,
        finalScore: null,
        attendType: AttendType.EXCUSED,
        sourceType: ScoreSource.MANUAL_INPUT,
        note: systemNote,
      },
    });
    return;
  }

  await tx.score.update({
    where: {
      id: score.id,
    },
    data: {
      attendType: AttendType.EXCUSED,
      note: systemNote,
    },
  });
}

export async function getStudentPortalScoresData(input: StudentPortalScoreFilters) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const periods = await loadStudentPortalScorePeriods(student);
  const selectedPeriod = resolveSelectedPeriod(periods, input.periodId);

  const sessions = selectedPeriod
    ? await prisma.examSession.findMany({
        where: {
          periodId: selectedPeriod.id,
          examType: student.examType,
          isCancelled: false,
          period: {
            academyId: student.academyId,
          },
          scores: {
            some: {
              academyId: student.academyId,
              examNumber: student.examNumber,
            },
          },
        },
        orderBy: [{ examDate: "desc" }, { subject: "asc" }],
        select: {
          id: true,
          week: true,
          subject: true,
          examDate: true,
        },
      })
    : [];

  const dateOptions = sortDateValues(
    Array.from(new Set(sessions.map((session) => formatDate(session.examDate)))),
  );
  const monthOptions = Array.from(
    new Map(
      sessions.map((session) => {
        const year = session.examDate.getFullYear();
        const month = session.examDate.getMonth() + 1;
        return [monthKey(year, month), { year, month }];
      }),
    ).values(),
  ).sort((left, right) => right.year - left.year || right.month - left.month);
  const subjectOptions = subjectOptionsForExamType(
    student.examType,
    Array.from(new Set(sessions.map((session) => session.subject))),
  );

  const selectedDate = dateOptions.includes(input.date ?? "") ? input.date ?? "" : dateOptions[0] ?? "";
  const requestedMonth = parseMonthKey(input.monthKey);
  const selectedMonth =
    monthOptions.find(
      (option) =>
        option.year === requestedMonth?.year && option.month === requestedMonth?.month,
    ) ?? monthOptions[0] ?? null;
  const selectedSubject = input.subject && subjectOptions.includes(input.subject)
    ? input.subject
    : subjectOptions[0];

  const [dailyAnalysis, monthlyAnalysis, subjectAnalysis, wrongNoteBookmarks] =
    await Promise.all([
      selectedDate
        ? getDailyAnalysis({
            periodId: selectedPeriod?.id,
            examType: student.examType,
            date: selectedDate,
            search: student.examNumber,
          }).then((rows) => rows.filter((row) => row.searchedStudent))
        : Promise.resolve([]),
      selectedMonth
        ? getMonthlyStudentAnalysis({
            periodId: selectedPeriod?.id,
            examType: student.examType,
            year: selectedMonth.year,
            month: selectedMonth.month,
            examNumber: student.examNumber,
          })
        : Promise.resolve(null),
      selectedSubject
        ? getSubjectTrendAnalysis({
            periodId: selectedPeriod?.id,
            examType: student.examType,
            subject: selectedSubject,
            examNumber: student.examNumber,
          })
        : Promise.resolve([]),
      prisma.wrongNoteBookmark.findMany({
        where: {
          examNumber: student.examNumber,
        },
        select: {
          id: true,
          questionId: true,
        },
      }),
    ]);

  return {
    student,
    periods,
    selectedPeriod,
    dateOptions,
    selectedDate,
    monthOptions,
    selectedMonth,
    selectedMonthKey: selectedMonth ? monthKey(selectedMonth.year, selectedMonth.month) : "",
    subjectOptions,
    selectedSubject,
    dailyAnalysis,
    monthlyAnalysis,
    subjectAnalysis,
    wrongNoteQuestionIds: wrongNoteBookmarks.map((bookmark) => bookmark.questionId),
    wrongNoteCount: wrongNoteBookmarks.length,
  };
}

// ─── 회차별 성적 상세 ─────────────────────────────────────────────

/**
 * 특정 시험 날짜(dateKey = "YYYY-MM-DD")에 대한 상세 성적 조회
 * - 해당 날짜의 모든 과목 점수
 * - 과목별 전회차 대비 변화
 * - 전체 석차 + 수험유형별 참여자 수
 * - 방사형 차트용 과목별 점수 vs 평균
 */
export async function getStudentPortalScoreSessionDetail(input: {
  examNumber: string;
  dateKey: string; // "YYYY-MM-DD"
}) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const studentAcademyId = student.academyId;

  // 해당 날짜의 시험 세션 조회
  const targetDate = new Date(input.dateKey);
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  if (Number.isNaN(targetDate.getTime())) {
    return null;
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      examType: student.examType,
      isCancelled: false,
      period: {
        academyId: student.academyId,
      },
      examDate: {
        gte: targetDate,
        lt: nextDate,
      },
    },
    orderBy: { subject: "asc" },
    select: {
      id: true,
      week: true,
      subject: true,
      examDate: true,
      periodId: true,
    },
  });

  if (sessions.length === 0) {
    return null;
  }

  const sessionIds = sessions.map((s) => s.id);

  // 해당 학생의 점수 조회
  const myScores = await prisma.score.findMany({
    where: {
      academyId: studentAcademyId,
      examNumber: student.examNumber,
      sessionId: { in: sessionIds },
    },
    select: {
      sessionId: true,
      rawScore: true,
      oxScore: true,
      finalScore: true,
      attendType: true,
      sourceType: true,
      note: true,
    },
  });

  const myScoreMap = new Map(myScores.map((s) => [s.sessionId, s]));

  // 전체 참여자 점수 조회 (석차 계산용)
  const cohortScores = await prisma.score.findMany({
    where: {
      academyId: student.academyId,
      sessionId: { in: sessionIds },
      finalScore: { not: null },
    },
    select: {
      sessionId: true,
      examNumber: true,
      finalScore: true,
    },
  });

  // 과목별 석차 계산
  const rankBySession = new Map<number, { rank: number; total: number; avg: number }>();
  for (const session of sessions) {
    const sessionScores = cohortScores
      .filter((s) => s.sessionId === session.id && s.finalScore !== null)
      .map((s) => s.finalScore as number)
      .sort((a, b) => b - a);

    const myScore = myScoreMap.get(session.id)?.finalScore ?? null;
    const total = sessionScores.length;
    const avg =
      total === 0
        ? 0
        : Math.round((sessionScores.reduce((sum, v) => sum + v, 0) / total) * 100) / 100;

    if (myScore !== null && total > 0) {
      const rank = sessionScores.filter((s) => s > myScore).length + 1;
      rankBySession.set(session.id, { rank, total, avg });
    } else {
      rankBySession.set(session.id, { rank: 0, total, avg });
    }
  }

  // 전회차 점수 조회 (과목별 변화 계산)
  // 이 날짜 직전의 같은 과목 점수를 찾는다
  const prevScoreBySubject = new Map<string, number | null>();
  for (const session of sessions) {
    const prevSession = await prisma.examSession.findFirst({
      where: {
        examType: student.examType,
        isCancelled: false,
        period: {
          academyId: student.academyId,
        },
        subject: session.subject,
        examDate: { lt: targetDate },
        scores: {
          some: {
            examNumber: student.examNumber,
            finalScore: { not: null },
          },
        },
      },
      orderBy: { examDate: "desc" },
      select: {
        id: true,
        examDate: true,
      },
    });

    if (prevSession) {
      const prevScore = await prisma.score.findUnique({
        where: {
          examNumber_sessionId: {
            examNumber: student.examNumber,
            sessionId: prevSession.id,
          },
        },
        select: { finalScore: true },
      });
      prevScoreBySubject.set(session.subject, prevScore?.finalScore ?? null);
    } else {
      prevScoreBySubject.set(session.subject, null);
    }
  }

  // 전체 합산 (총점 + 전체 석차)
  const subjectScores = sessions.map((session) => {
    const myScore = myScoreMap.get(session.id);
    const rankInfo = rankBySession.get(session.id);
    const prevScore = prevScoreBySubject.get(session.subject) ?? null;
    const finalScore = myScore?.finalScore ?? null;
    const change =
      finalScore !== null && prevScore !== null ? Math.round((finalScore - prevScore) * 100) / 100 : null;

    return {
      subject: session.subject,
      sessionId: session.id,
      rawScore: myScore?.rawScore ?? null,
      oxScore: myScore?.oxScore ?? null,
      finalScore,
      attendType: myScore?.attendType ?? null,
      sourceType: myScore?.sourceType ?? null,
      rank: rankInfo?.rank ?? null,
      total: rankInfo?.total ?? 0,
      cohortAvg: rankInfo?.avg ?? 0,
      prevScore,
      change,
    };
  });

  const scoredSubjects = subjectScores.filter((s) => s.finalScore !== null);
  const totalScore = scoredSubjects.reduce((sum, s) => sum + (s.finalScore ?? 0), 0);

  // 전체 합산 석차: 각 참여자의 해당 날짜 합산 점수로 계산
  const participantTotals = new Map<string, number>();
  for (const row of cohortScores) {
    if (row.finalScore === null) continue;
    const current = participantTotals.get(row.examNumber) ?? 0;
    participantTotals.set(row.examNumber, current + row.finalScore);
  }
  const totalRankList = Array.from(participantTotals.values()).sort((a, b) => b - a);
  const overallRank =
    scoredSubjects.length === 0
      ? null
      : totalRankList.filter((v) => v > totalScore).length + 1;
  const overallTotal = participantTotals.size;

  // 방사형 차트 데이터
  const radarData = subjectScores.map((s) => ({
    subject: s.subject,
    score: s.finalScore ?? 0,
    avg: s.cohortAvg,
  }));

  // 이전/다음 시험일 조회 (네비게이션용)
  const [prevExamSession, nextExamSession] = await Promise.all([
    prisma.examSession.findFirst({
      where: {
        examType: student.examType,
        isCancelled: false,
        examDate: { lt: targetDate },
      },
      orderBy: { examDate: "desc" },
      select: { examDate: true },
    }),
    prisma.examSession.findFirst({
      where: {
        examType: student.examType,
        isCancelled: false,
        examDate: { gte: nextDate },
      },
      orderBy: { examDate: "asc" },
      select: { examDate: true },
    }),
  ]);

  const prevDateKey = prevExamSession ? formatDate(prevExamSession.examDate) : null;
  const nextDateKey = nextExamSession ? formatDate(nextExamSession.examDate) : null;

  return {
    student,
    dateKey: input.dateKey,
    week: sessions[0]?.week ?? null,
    examDate: sessions[0]?.examDate ?? null,
    subjectScores,
    totalScore: Math.round(totalScore * 100) / 100,
    overallRank,
    overallTotal,
    radarData,
    prevDateKey,
    nextDateKey,
  };
}

export async function getStudentPortalAttendanceSummary(input: { examNumber: string }) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }
  const summary = await buildStudentPortalAttendancePeriodData(student);

  return {
    student: summary.student,
    selectedPeriod: summary.selectedPeriod,
    currentStatus: summary.currentStatus,
    thisWeekAbsences: summary.thisWeekAbsences,
    thisMonthAbsences: summary.thisMonthAbsences,
    totalSessions: summary.totalSessions,
    attendedSessions: summary.attendedSessions,
    attendanceRate: summary.attendanceRate,
  };
}

export async function getStudentPortalScorePageData(input: {
  examNumber: string;
  periodId?: number;
}) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const periods = await loadStudentPortalScorePeriods(student);
  const selectedPeriod = resolveSelectedPeriod(periods, input.periodId);
  const scoreRows = selectedPeriod
    ? await prisma.score.findMany({
        where: {
          academyId: student.academyId,
          examNumber: student.examNumber,
          session: {
            periodId: selectedPeriod.id,
            examType: student.examType,
            period: {
              academyId: student.academyId,
            },
          },
        },
        orderBy: [{ session: { examDate: "desc" } }, { session: { subject: "asc" } }],
        select: {
          id: true,
          rawScore: true,
          oxScore: true,
          finalScore: true,
          attendType: true,
          sourceType: true,
          note: true,
          updatedAt: true,
          session: {
            select: {
              id: true,
              week: true,
              subject: true,
              examDate: true,
            },
          },
        },
      })
    : [];

  const scoredRows = scoreRows.filter((row) => row.finalScore !== null);
  const averageScore =
    scoredRows.length === 0
      ? null
      : Math.round(
          (scoredRows.reduce((sum, row) => sum + (row.finalScore ?? 0), 0) / scoredRows.length) *
            100,
        ) / 100;

  // Build trend chart data: group by date, compute daily average for the student
  const dateScoreMap = new Map<string, number[]>();
  for (const row of scoreRows) {
    if (row.finalScore === null) continue;
    const dateKey = formatDate(row.session.examDate);
    const existing = dateScoreMap.get(dateKey) ?? [];
    existing.push(row.finalScore);
    dateScoreMap.set(dateKey, existing);
  }
  const trendData = Array.from(dateScoreMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => {
      const total = scores.reduce((sum, s) => sum + s, 0);
      const avg = Math.round((total / scores.length) * 100) / 100;
      return { date, total: Math.round(total * 100) / 100, avg };
    });

  // Build subject cross table: columns = recent exam dates (up to 10), rows = subjects
  const sessionIds = Array.from(new Set(scoreRows.map((row) => row.session.id)));
  const recentSessionIds = sessionIds.slice(0, 40); // already sorted desc by date
  const allDates = Array.from(
    new Map(
      scoreRows.map((row) => [formatDate(row.session.examDate), row.session.examDate]),
    ).entries(),
  )
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 10)
    .map(([dateKey, date]) => ({ dateKey, date }));

  // Map: subject -> dateKey -> finalScore
  const subjectDateScoreMap = new Map<Subject, Map<string, number | null>>();
  for (const row of scoreRows) {
    const dateKey = formatDate(row.session.examDate);
    if (!allDates.some((d) => d.dateKey === dateKey)) continue;
    const subjectMap = subjectDateScoreMap.get(row.session.subject) ?? new Map<string, number | null>();
    subjectMap.set(dateKey, row.finalScore);
    subjectDateScoreMap.set(row.session.subject, subjectMap);
  }
  const subjectCrossTable = Array.from(subjectDateScoreMap.entries()).map(([subject, dateMap]) => ({
    subject,
    scores: allDates.map((d) => ({
      dateKey: d.dateKey,
      score: dateMap.has(d.dateKey) ? (dateMap.get(d.dateKey) ?? null) : undefined,
    })),
  }));

  // Compute rank for all exam sessions (per session, among same examType)
  const latestDateKey = allDates[0]?.dateKey ?? null;
  const allSessionIds = Array.from(new Set(scoreRows.map((row) => row.session.id)));

  const cohortScoresForAll =
    allSessionIds.length > 0
      ? await prisma.score.findMany({
          where: {
            academyId: student.academyId,
            sessionId: { in: allSessionIds },
            finalScore: { not: null },
          },
          select: {
            sessionId: true,
            finalScore: true,
          },
        })
      : [];

  // Build rank map: sessionId -> { rank, total }
  const rankBySession = new Map<number, { rank: number; total: number }>();
  for (const sessionId of allSessionIds) {
    const sessionScores = cohortScoresForAll
      .filter((s) => s.sessionId === sessionId && s.finalScore !== null)
      .map((s) => s.finalScore as number)
      .sort((a, b) => b - a);
    const myScore = scoreRows.find((row) => row.session.id === sessionId)?.finalScore ?? null;
    if (myScore !== null) {
      const rank = sessionScores.filter((s) => s > myScore).length + 1;
      rankBySession.set(sessionId, { rank, total: sessionScores.length });
    }
  }

  // Latest session IDs (for latestSummary — same as before)
  const latestSessionIds = latestDateKey
    ? scoreRows
        .filter((row) => formatDate(row.session.examDate) === latestDateKey)
        .map((row) => row.session.id)
    : [];

  // Latest exam summary cards: scores from the most recent date
  const latestExamRows = latestDateKey
    ? scoreRows.filter((row) => formatDate(row.session.examDate) === latestDateKey)
    : [];

  const latestSummary = latestExamRows.length === 0
    ? null
    : {
        dateKey: latestDateKey,
        week: latestExamRows[0]?.session.week ?? null,
        subjects: latestExamRows.map((row) => ({
          subject: row.session.subject,
          finalScore: row.finalScore,
          rank: rankBySession.get(row.session.id) ?? null,
        })),
        totalScore: latestExamRows.reduce((sum, row) => sum + (row.finalScore ?? 0), 0),
        avgScore:
          latestExamRows.filter((row) => row.finalScore !== null).length === 0
            ? null
            : Math.round(
                (latestExamRows
                  .filter((row) => row.finalScore !== null)
                  .reduce((sum, row) => sum + (row.finalScore ?? 0), 0) /
                  latestExamRows.filter((row) => row.finalScore !== null).length) *
                  100,
              ) / 100,
      };

  // Unused variable guard — recentSessionIds used for potential future use
  void recentSessionIds;
  // Unused variable guard — latestSessionIds used for latestSummary computation reference
  void latestSessionIds;

  // Convert rankBySession Map to a plain record for serialization
  const rankBySessionRecord: Record<number, { rank: number; total: number }> = {};
  for (const [sessionId, rankInfo] of rankBySession.entries()) {
    rankBySessionRecord[sessionId] = rankInfo;
  }

  // Compute per-score delta from previous session score of same subject.
  // scoreRows sorted desc by date: for index i, previous same-subject is found at a later index.
  const deltaByScoreId: Record<number, number | null> = {};
  // Build subject -> sorted-asc array of {id, finalScore}
  const subjectScoreHistory = new Map<string, Array<{ id: number; finalScore: number | null; examDate: string }>>();
  for (const row of scoreRows) {
    const dateKey = formatDate(row.session.examDate);
    const key = row.session.subject;
    const arr = subjectScoreHistory.get(key) ?? [];
    arr.push({ id: row.id, finalScore: row.finalScore, examDate: dateKey });
    subjectScoreHistory.set(key, arr);
  }
  // scoreRows is desc sorted, so each subject array is also desc — reverse to get asc
  for (const arr of subjectScoreHistory.values()) {
    const ascArr = [...arr].reverse(); // ascending by date (oldest first)
    for (let i = 0; i < ascArr.length; i++) {
      const curr = ascArr[i]!;
      if (i === 0) {
        deltaByScoreId[curr.id] = null; // first occurrence: no previous
      } else {
        const prev = ascArr[i - 1]!;
        if (curr.finalScore !== null && prev.finalScore !== null) {
          deltaByScoreId[curr.id] = Math.round((curr.finalScore - prev.finalScore) * 10) / 10;
        } else {
          deltaByScoreId[curr.id] = null;
        }
      }
    }
  }

  return {
    student,
    periods,
    selectedPeriod,
    scoreRows,
    summary: {
      totalRows: scoreRows.length,
      scoredRows: scoredRows.length,
      averageScore,
      latestExamDate: scoreRows[0]?.session.examDate ?? null,
    },
    trendData,
    subjectCrossTable,
    crossTableDates: allDates.map((d) => d.dateKey),
    latestSummary,
    rankBySession: rankBySessionRecord,
    deltaByScoreId,
  };
}

export async function getStudentPortalAttendancePageData(input: {
  examNumber: string;
  periodId?: number;
}) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const summary = await buildStudentPortalAttendancePeriodData(student, input.periodId);
  const recentSessions = summary.selectedPeriod
    ? await prisma.examSession.findMany({
        where: {
          periodId: summary.selectedPeriod.id,
          examType: student.examType,
          period: {
            academyId: student.academyId,
          },
          isCancelled: false,
          examDate: {
            lt: startOfTomorrow(),
          },
        },
        orderBy: [{ examDate: "desc" }, { subject: "asc" }],
        take: 16,
        select: {
          id: true,
          week: true,
          subject: true,
          examDate: true,
        },
      })
    : [];

  return {
    student,
    periods: summary.periods,
    selectedPeriod: summary.selectedPeriod,
    summary: {
      currentStatus: summary.currentStatus,
      thisWeekAbsences: summary.thisWeekAbsences,
      thisMonthAbsences: summary.thisMonthAbsences,
      totalSessions: summary.totalSessions,
      attendedSessions: summary.attendedSessions,
      attendanceRate: summary.attendanceRate,
    },
    recentSessions: recentSessions.map((session) => {
      const score = summary.scoreBySessionId.get(session.id) ?? null;
      const approvedAbsence = summary.approvedAbsenceBySessionId.get(session.id) ?? null;

      return {
        id: session.id,
        week: session.week,
        subject: session.subject,
        examDate: session.examDate,
        attendType: score?.attendType ?? AttendType.ABSENT,
        finalScore: score && score.attendType !== AttendType.ABSENT ? score.finalScore ?? null : null,
        noteStatus: approvedAbsence?.status ?? null,
        noteReason: approvedAbsence?.reason ?? null,
        noteCategory: approvedAbsence?.absenceCategory ?? null,
        countedAsAttendance: countsAsConfiguredAttendance(
          score?.attendType ?? AttendType.ABSENT,
          summary.attendanceIncludedSessionIds.has(session.id),
        ),
      };
    }),
  };
}

export async function getStudentPortalAbsenceNotePageData(input: {
  examNumber: string;
  periodId?: number;
}) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const periods = await loadStudentPortalAbsenceNotePeriods(student);
  const selectedPeriod = resolveSelectedPeriod(periods, input.periodId);

  const [notes, sessions] = await Promise.all([
    prisma.absenceNote.findMany({
      where: {
        academyId: student.academyId,
        examNumber: student.examNumber,
        session: {
          periodId: selectedPeriod?.id,
        },
      },
      orderBy: [{ session: { examDate: "desc" } }, { createdAt: "desc" }],
      select: {
        id: true,
        sessionId: true,
        reason: true,
        absenceCategory: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
        adminNote: true,
        attendCountsAsAttendance: true,
        attendGrantsPerfectAttendance: true,
        session: {
          select: {
            id: true,
            week: true,
            subject: true,
            examDate: true,
          },
        },
      },
    }),
    selectedPeriod
      ? prisma.examSession.findMany({
          where: {
            periodId: selectedPeriod.id,
            examType: student.examType,
            period: {
              academyId: student.academyId,
            },
            isCancelled: false,
            examDate: {
              lt: startOfTomorrow(),
            },
          },
          orderBy: [{ examDate: "desc" }, { subject: "asc" }],
          take: 24,
          select: {
            id: true,
            week: true,
            subject: true,
            examDate: true,
            scores: {
              where: {
                academyId: student.academyId,
                examNumber: student.examNumber,
              },
              take: 1,
              select: {
                attendType: true,
                finalScore: true,
              },
            },
            absenceNotes: {
              where: {
                academyId: student.academyId,
                examNumber: student.examNumber,
              },
              take: 1,
              select: {
                id: true,
                status: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    student,
    periods,
    selectedPeriod,
    notes,
    sessionOptions: sessions.map((session) => {
      const existingNote = session.absenceNotes[0] ?? null;
      const score = session.scores[0] ?? null;
      const canSubmit =
        !existingNote || existingNote.status === AbsenceStatus.REJECTED;

      return {
        id: session.id,
        week: session.week,
        subject: session.subject,
        examDate: session.examDate,
        existingStatus: existingNote?.status ?? null,
        canSubmit,
        attendType: score?.attendType ?? null,
        finalScore: score?.finalScore ?? null,
      };
    }),
  };
}

export async function getStudentPortalPointsPageData(input: {
  examNumber: string;
}) {
  const student = await loadStudentPortalProfile(input.examNumber);

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const pointLogs = await prisma.pointLog.findMany({
    where: {
      examNumber: student.examNumber,
      student: {
        is: {
          academyId: student.academyId,
        },
      },
    },
    orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      type: true,
      amount: true,
      reason: true,
      year: true,
      month: true,
      grantedAt: true,
      period: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const now = new Date();
  const currentMonthPoints = pointLogs
    .filter(
      (log) =>
        log.grantedAt.getFullYear() === now.getFullYear() &&
        log.grantedAt.getMonth() === now.getMonth(),
    )
    .reduce((sum, log) => sum + log.amount, 0);

  // 월별 통계 집계 (최근 6개월)
  const monthlyStatsMap = new Map<string, { year: number; month: number; earned: number; spent: number }>();
  for (const log of pointLogs) {
    const y = log.grantedAt.getFullYear();
    const m = log.grantedAt.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const existing = monthlyStatsMap.get(key) ?? { year: y, month: m, earned: 0, spent: 0 };
    if (log.amount >= 0) {
      existing.earned += log.amount;
    } else {
      existing.spent += Math.abs(log.amount);
    }
    monthlyStatsMap.set(key, existing);
  }

  const monthlyStats = Array.from(monthlyStatsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, v]) => v);

  // 유형별 집계
  const typeStats = pointLogs.reduce<Record<string, number>>((acc, log) => {
    acc[log.type] = (acc[log.type] ?? 0) + log.amount;
    return acc;
  }, {});

  return {
    student,
    pointLogs,
    monthlyStats,
    typeStats,
    summary: {
      totalPoints: pointLogs.reduce((sum, log) => sum + log.amount, 0),
      currentMonthPoints,
      historyCount: pointLogs.length,
      latestGrantedAt: pointLogs[0]?.grantedAt ?? null,
      earnedCount: pointLogs.filter((l) => l.amount > 0).length,
      spentCount: pointLogs.filter((l) => l.amount < 0).length,
    },
  };
}

export async function createStudentAbsenceNote(input: {
  examNumber: string;
  sessionId: number;
  reason: string;
  absenceCategory: AbsenceCategory;
}) {
  const examNumber = input.examNumber.trim();
  const reason = input.reason.trim();

  if (!examNumber) {
    throw new Error("INVALID_EXAM_NUMBER");
  }

  if (!Number.isInteger(input.sessionId) || input.sessionId <= 0) {
    throw new Error("INVALID_SESSION_ID");
  }

  if (!reason) {
    throw new Error("INVALID_REASON");
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: {
        examNumber,
      },
      select: {
        examNumber: true,
        academyId: true,
        examType: true,
        isActive: true,
      },
    });

    if (!student?.isActive) {
      throw new Error("STUDENT_NOT_FOUND");
    }

    const session = await tx.examSession.findUnique({
      where: {
        id: input.sessionId,
      },
      select: {
        id: true,
        periodId: true,
        examType: true,
        isCancelled: true,
        period: {
          select: {
            academyId: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error("SESSION_NOT_FOUND");
    }

    const resolvedAcademyId =
      student.academyId ??
      session.period.academyId ??
      (await resolveAcademyByHostname());
    const studentAcademyId = student.academyId ?? resolvedAcademyId ?? null;
    const sessionAcademyId = session.period.academyId ?? resolvedAcademyId ?? null;

    if (session.examType !== student.examType || sessionAcademyId !== studentAcademyId) {
      throw new Error("SESSION_FORBIDDEN");
    }

    const hasPeriodAccess = await hasStudentPortalPeriodAccess(tx, {
      academyId: studentAcademyId,
      examNumber: student.examNumber,
      examType: student.examType,
      periodId: session.periodId,
    });

    if (!hasPeriodAccess) {
      throw new Error("SESSION_FORBIDDEN");
    }

    if (session.isCancelled) {
      throw new Error("SESSION_CANCELLED");
    }

    const existing = await tx.absenceNote.findUnique({
      where: {
        examNumber_sessionId: {
          examNumber,
          sessionId: input.sessionId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existing && existing.status !== AbsenceStatus.REJECTED) {
      throw new Error("ABSENCE_NOTE_ALREADY_EXISTS");
    }

    const autoApprove = input.absenceCategory === AbsenceCategory.MILITARY;
    const attendanceOptions = resolveStudentAbsenceAttendanceOptions(input.absenceCategory);
    const note = existing
      ? await tx.absenceNote.update({
          where: {
            id: existing.id,
          },
          data: {
            academyId: studentAcademyId,
            reason,
            absenceCategory: input.absenceCategory,
            status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
            submittedAt: new Date(),
            approvedAt: autoApprove ? new Date() : null,
            adminNote: null,
            ...attendanceOptions,
          },
        })
      : await tx.absenceNote.create({
          data: {
            academyId: studentAcademyId,
            examNumber,
            sessionId: input.sessionId,
            reason,
            absenceCategory: input.absenceCategory,
            status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
            submittedAt: new Date(),
            approvedAt: autoApprove ? new Date() : null,
            adminNote: null,
            ...attendanceOptions,
          },
        });

    if (autoApprove) {
      await applyApprovedStudentAbsenceNote(tx, note);
    }

    return {
      note,
      autoApprove,
      session,
    };
  });

  if (result.autoApprove) {
    try {
      await recalculateStatusCache(result.session.periodId, result.session.examType, {
        examNumbers: [examNumber],
      });
    } catch (error) {
      console.error("Failed to recalculate student absence-note status cache.", error);
    }
  }

  return result.note;
}

// ─── 월별 캘린더 출결 ────────────────────────────────────────────

/**
 * AttendType → 캘린더 상태 변환
 * - NORMAL / LIVE → present
 * - EXCUSED → excused
 * - ABSENT → absent
 */
function attendTypeToCalendarStatus(attendType: AttendType): AttendanceDayStatus {
  if (attendType === AttendType.NORMAL || attendType === AttendType.LIVE) {
    return "present";
  }
  if (attendType === AttendType.EXCUSED) {
    return "excused";
  }
  return "absent";
}

export type AttendanceCalendarRecord = {
  date: string; // "YYYY-MM-DD"
  status: AttendanceDayStatus;
  subjects: string[]; // 해당 날짜 과목 레이블 목록
};

export type AttendanceCalendarSummary = {
  present: number;
  excused: number;
  absent: number;
  total: number;
  attendanceRate: number;
  streak: number; // 오늘까지 연속 출석 일수 (날짜 단위)
};

/**
 * 월별 출결 캘린더 데이터 조회
 * - month: "YYYY-MM" 형식. 생략 시 현재 달.
 * - 날짜별로 가장 우선되는 상태(출석 > 공결 > 결석) 하나를 반환.
 */
export async function getStudentPortalAttendanceCalendarData(input: {
  examNumber: string;
  month?: string;
}) {
  const student = await loadStudentPortalProfile(input.examNumber);
  if (!student) return null;

  const prisma = getPrisma();

  // 월 파싱
  const now = new Date();
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth() + 1;

  if (input.month) {
    const parts = input.month.split("-").map(Number);
    if (parts.length === 2 && Number.isInteger(parts[0]) && Number.isInteger(parts[1])) {
      targetYear = parts[0]!;
      targetMonth = parts[1]!;
    }
  }

  const monthStart = new Date(targetYear, targetMonth - 1, 1);
  const monthEnd = new Date(targetYear, targetMonth, 1); // exclusive

  // 해당 월의 시험 세션 조회 (취소 제외)
  const sessions = await prisma.examSession.findMany({
    where: {
      examType: student.examType,
      isCancelled: false,
      period: {
        academyId: student.academyId,
      },
      examDate: {
        gte: monthStart,
        lt: monthEnd,
      },
    },
    orderBy: [{ examDate: "asc" }, { subject: "asc" }],
    select: {
      id: true,
      examDate: true,
      subject: true,
    },
  });

  if (sessions.length === 0) {
    return {
      student,
      month: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
      records: [] as AttendanceCalendarRecord[],
      summary: {
        present: 0,
        excused: 0,
        absent: 0,
        total: 0,
        attendanceRate: 0,
        streak: 0,
      } satisfies AttendanceCalendarSummary,
    };
  }

  const sessionIds = sessions.map((s) => s.id);

  // 점수(출결) + 공결 사유서 조회
  const [scores, approvedAbsences] = await Promise.all([
    prisma.score.findMany({
      where: {
        academyId: student.academyId,
        examNumber: student.examNumber,
        sessionId: { in: sessionIds },
      },
      select: {
        sessionId: true,
        attendType: true,
      },
    }),
    prisma.absenceNote.findMany({
      where: {
        academyId: student.academyId,
        examNumber: student.examNumber,
        status: AbsenceStatus.APPROVED,
        sessionId: { in: sessionIds },
      },
      select: {
        sessionId: true,
      },
    }),
  ]);

  const scoreMap = new Map(scores.map((s) => [s.sessionId, s.attendType]));
  const excusedSet = new Set(approvedAbsences.map((a) => a.sessionId));

  // 날짜별 집계 — 하루에 여러 과목이 있으므로 날짜를 키로 묶습니다.
  // 우선순위: present > excused > absent
  const todayStr = formatDate(now);

  type DayAgg = {
    statuses: AttendanceDayStatus[];
    subjects: string[];
    isFuture: boolean;
  };

  const dayMap = new Map<string, DayAgg>();

  for (const session of sessions) {
    const dateStr = formatDate(session.examDate);
    const isFuture = dateStr > todayStr;
    const existingEntry = dayMap.get(dateStr);
    const entry: DayAgg = existingEntry ?? { statuses: [], subjects: [], isFuture };
    if (!existingEntry) {
      dayMap.set(dateStr, entry);
    }

    entry.subjects.push(SUBJECT_LABEL[session.subject]);

    if (isFuture) {
      entry.statuses.push("future");
      continue;
    }

    const attendType = scoreMap.get(session.id);
    if (!attendType) {
      entry.statuses.push("absent");
    } else if (excusedSet.has(session.id)) {
      entry.statuses.push("excused");
    } else {
      entry.statuses.push(attendTypeToCalendarStatus(attendType));
    }
  }

  // 날짜별 대표 상태 결정
  function dominantStatus(statuses: AttendanceDayStatus[]): AttendanceDayStatus {
    if (statuses.includes("present")) return "present";
    if (statuses.includes("excused")) return "excused";
    if (statuses.includes("absent")) return "absent";
    return "future";
  }

  const records: AttendanceCalendarRecord[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, agg]) => ({
      date,
      status: agg.isFuture && !agg.statuses.some((s) => s !== "future")
        ? "future"
        : dominantStatus(agg.statuses),
      subjects: agg.subjects,
    }));

  // 요약 (과거/오늘 날짜만 집계)
  const pastRecords = records.filter((r) => r.date <= todayStr);
  const present = pastRecords.filter((r) => r.status === "present").length;
  const excused = pastRecords.filter((r) => r.status === "excused").length;
  const absent = pastRecords.filter((r) => r.status === "absent").length;
  const total = present + excused + absent;
  const attendanceRate = total === 0 ? 0 : Math.round(((present + excused) / total) * 1000) / 10;

  // 연속 출석 스트릭: 역순으로 연속 출석/공결 날짜 계산
  const sortedPast = [...pastRecords].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const r of sortedPast) {
    if (r.status === "present" || r.status === "excused") {
      streak += 1;
    } else {
      break;
    }
  }

  return {
    student,
    month: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
    records,
    summary: {
      present,
      excused,
      absent,
      total,
      attendanceRate,
      streak,
    } satisfies AttendanceCalendarSummary,
  };
}
