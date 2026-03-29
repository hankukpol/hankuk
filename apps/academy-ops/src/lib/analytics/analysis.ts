import { Prisma } from "@prisma/client";
import {
  AttendType,
  ExamType,
  StudentStatus,
  StudentType,
  Subject,
} from "@prisma/client";
import { EXAM_TYPE_SUBJECTS, SUBJECT_LABEL } from "@/lib/constants";
import { getTuesdayWeekKey, getTuesdayWeekStart } from "@/lib/analytics/week";
import { getPrisma } from "@/lib/prisma";
import { NON_PLACEHOLDER_STUDENT_FILTER } from "@/lib/students/placeholder";
import {
  countsAsConfiguredAttendance,
  getCombinedAverage,
  getScoredMockScore,
} from "@/lib/scores/calculation";

export type SubjectTargetScores = Partial<Record<Subject, number>>;

type ScoreLike = {
  examNumber: string;
  rawScore: number | null;
  oxScore?: number | null;
  finalScore: number | null;
  attendType: AttendType;
};

function scoredMockScoreValue(
  score: Pick<ScoreLike, "rawScore" | "oxScore" | "finalScore" | "attendType">,
) {
  return getScoredMockScore(score);
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function topAverage(values: number[], ratio: number) {
  if (values.length === 0) {
    return null;
  }

  const count = Math.max(1, Math.ceil(values.length * ratio));
  const topValues = [...values].sort((left, right) => right - left).slice(0, count);
  return average(topValues);
}

function percentileRank(values: number[], target: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => right - left);
  const rank = sorted.findIndex((value) => value <= target);
  return rank === -1 ? sorted.length : rank + 1;
}

function scoreValues(scores: ScoreLike[]) {
  return scores
    .map(scoredMockScoreValue)
    .filter((value): value is number => value !== null);
}

function buildAttendanceIncludedExcuseLookup(
  absences: Array<{ examNumber: string; sessionId: number; attendCountsAsAttendance: boolean }>,
) {
  return new Set(
    absences
      .filter((absence) => absence.attendCountsAsAttendance)
      .map((absence) => `${absence.examNumber}:${absence.sessionId}`),
  );
}

function countsAsAnalysisAttendance(
  attendType: AttendType,
  examNumber: string,
  sessionId: number,
  attendanceIncludedExcuseLookup: Set<string>,
) {
  return countsAsConfiguredAttendance(
    attendType,
    attendanceIncludedExcuseLookup.has(`${examNumber}:${sessionId}`),
  );
}

function buildHistogram(values: number[]) {
  const bins = Array.from({ length: 21 }, (_, index) => ({
    range: `${index * 5}-${index === 20 ? 100 : index * 5 + 4}`,
    count: 0,
  }));

  for (const value of values) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    const index = Math.min(Math.floor(safeValue / 5), bins.length - 1);
    bins[index].count += 1;
  }

  return bins;
}

function parseDistribution(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => ({
      answer: key,
      percentage: typeof raw === "number" ? raw : Number(raw ?? 0),
    }))
    .sort((left, right) => right.percentage - left.percentage);
}

function subjectRowsForExamType(examType: ExamType, subjects: Subject[]) {
  const preferred = EXAM_TYPE_SUBJECTS[examType];
  const set = new Set([...preferred, ...subjects]);
  return Array.from(set);
}

function formatTrendDateLabel(date: Date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function startOfTomorrow() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatWeekShortLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}주`;
}

function roundTo(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}


function isMissingWeeklyStatusSnapshotError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

export function parseTargetScores(value: Prisma.JsonValue | null): SubjectTargetScores {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: SubjectTargetScores = {};

  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (!Object.values(Subject).includes(key as Subject)) {
      continue;
    }

    const parsed = Number(rawValue);

    if (Number.isFinite(parsed) && parsed > 0) {
      result[key as Subject] = parsed;
    }
  }

  return result;
}

export function serializeTargetScores(value: SubjectTargetScores) {
  const entries = Object.entries(value).filter(([, score]) => Number.isFinite(score) && score! > 0);
  return Object.fromEntries(entries);
}

function buildStudentAverageMap(scores: ScoreLike[]) {
  const grouped = new Map<string, number[]>();

  for (const score of scores) {
    const value = scoredMockScoreValue(score);

    if (value === null) {
      continue;
    }

    const current = grouped.get(score.examNumber) ?? [];
    current.push(value);
    grouped.set(score.examNumber, current);
  }

  return new Map(
    Array.from(grouped.entries()).map(([examNumber, values]) => [examNumber, average(values) ?? 0]),
  );
}

function groupBySessionId<T extends { sessionId: number }>(rows: T[]) {
  const grouped = new Map<number, T[]>();

  for (const row of rows) {
    const current = grouped.get(row.sessionId) ?? [];
    current.push(row);
    grouped.set(row.sessionId, current);
  }

  return grouped;
}

export async function getDailyAnalysis(input: {
  periodId?: number;
  examType: ExamType;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}) {
  const legacyDate = input.date?.trim();
  const parsedFrom = input.dateFrom
    ? new Date(`${input.dateFrom}T00:00:00`)
    : legacyDate
      ? new Date(`${legacyDate}T00:00:00`)
      : null;
  const parsedTo = input.dateTo
    ? new Date(`${input.dateTo}T00:00:00`)
    : legacyDate
      ? new Date(`${legacyDate}T00:00:00`)
      : null;
  const startCandidate = parsedFrom ?? parsedTo;
  const endCandidate = parsedTo ?? parsedFrom;

  if (!startCandidate || !endCandidate) {
    return [];
  }

  if (Number.isNaN(startCandidate.getTime()) || Number.isNaN(endCandidate.getTime())) {
    return [];
  }

  const start =
    startCandidate.getTime() <= endCandidate.getTime() ? startCandidate : endCandidate;
  const endBase =
    startCandidate.getTime() <= endCandidate.getTime() ? endCandidate : startCandidate;
  const end = new Date(endBase);
  end.setDate(end.getDate() + 1);
  const tomorrow = startOfTomorrow();

  if (start >= tomorrow) {
    return [];
  }

  const boundedEnd = end < tomorrow ? end : tomorrow;

  if (start >= boundedEnd) {
    return [];
  }
  const search = input.search?.trim();
  const prisma = getPrisma();
  const sessions = await prisma.examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: input.examType,
      isCancelled: false,
      examDate: {
        gte: start,
        lt: boundedEnd,
      },
    },
    select: {
      id: true,
      week: true,
      subject: true,
      examDate: true,
      period: true,
      questions: {
        select: {
          id: true,
          questionNo: true,
          correctAnswer: true,
          correctRate: true,
          difficulty: true,
          answerDistribution: true,
        },
        orderBy: {
          questionNo: "asc",
        },
      },
    },
    orderBy: [{ examDate: "asc" }, { subject: "asc" }],
  });
  const sessionIds = sessions.map((session) => session.id);
  const [scores, searchedScores] = await Promise.all([
    sessionIds.length > 0
      ? prisma.score.findMany({
          where: {
            sessionId: {
              in: sessionIds,
            },
          },
          select: {
            examNumber: true,
            sessionId: true,
            rawScore: true,
            oxScore: true,
            finalScore: true,
            attendType: true,
          },
          orderBy: {
            examNumber: "asc",
          },
        })
      : Promise.resolve([]),
    search && sessionIds.length > 0
      ? prisma.score.findMany({
          where: {
            sessionId: {
              in: sessionIds,
            },
            OR: [
              {
                examNumber: {
                  contains: search,
                },
              },
              {
                student: {
                  name: {
                    contains: search,
                  },
                },
              },
            ],
          },
          select: {
            examNumber: true,
            sessionId: true,
            rawScore: true,
            oxScore: true,
            finalScore: true,
            attendType: true,
            student: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            examNumber: "asc",
          },
        })
      : Promise.resolve([]),
  ]);
  const scoresBySession = groupBySessionId(scores);
  const searchedScoreBySession = new Map<number, (typeof searchedScores)[number]>();

  for (const score of searchedScores) {
    if (!searchedScoreBySession.has(score.sessionId)) {
      searchedScoreBySession.set(score.sessionId, score);
    }
  }

  const searchedExamNumbers = Array.from(new Set(searchedScores.map((score) => score.examNumber)));
  const questionIds = sessions.flatMap((session) => session.questions.map((question) => question.id));
  const searchedAnswers =
    searchedExamNumbers.length > 0 && questionIds.length > 0
      ? await prisma.studentAnswer.findMany({
          where: {
            examNumber: {
              in: searchedExamNumbers,
            },
            questionId: {
              in: questionIds,
            },
          },
          select: {
            examNumber: true,
            questionId: true,
            answer: true,
            isCorrect: true,
          },
        })
      : [];
  const searchedAnswerMap = new Map(
    searchedAnswers.map((answer) => [`${answer.examNumber}:${answer.questionId}`, answer]),
  );

  return sessions.map((session) => {
    const sessionScores = scoresBySession.get(session.id) ?? [];
    const values = scoreValues(sessionScores);
    const searchedScore = search ? searchedScoreBySession.get(session.id) ?? null : null;
    const participantCount = values.length;
    const questionRows = session.questions.map((question) => {
      const distribution = parseDistribution(question.answerDistribution);
      const mostCommonWrongAnswer =
        distribution.find((entry) => entry.answer !== question.correctAnswer)?.answer ?? null;
      const searchedAnswer = searchedScore
        ? searchedAnswerMap.get(`${searchedScore.examNumber}:${question.id}`) ?? null
        : null;

      return {
        questionId: question.id,
        questionNo: question.questionNo,
        correctAnswer: question.correctAnswer,
        correctRate: question.correctRate ?? 0,
        difficulty: question.difficulty ?? "-",
        mostCommonWrongAnswer,
        distribution,
        searchedStudentAnswer: searchedAnswer?.answer ?? null,
        searchedStudentCorrect: searchedAnswer?.isCorrect ?? null,
      };
    });

    return {
      sessionId: session.id,
      examDate: session.examDate,
      week: session.week,
      subject: session.subject,
      periodName: session.period.name,
      participantCount,
      averageScore: average(values),
      top10Average: topAverage(values, 0.1),
      top30Average: topAverage(values, 0.3),
      highestScore: values.length > 0 ? Math.max(...values) : null,
      histogram: buildHistogram(values),
      topWrongQuestions: [...questionRows]
        .sort((left, right) => left.correctRate - right.correctRate)
        .slice(0, 5),
      questionRows,
      searchedStudent:
        searchedScore && scoredMockScoreValue(searchedScore) !== null
          ? {
              examNumber: searchedScore.examNumber,
              name: searchedScore.student.name,
              score: scoredMockScoreValue(searchedScore),
              rank: percentileRank(values, scoredMockScoreValue(searchedScore) ?? 0),
            }
          : null,
    };
  });
}

export async function getMonthlyStudentAnalysis(input: {
  periodId?: number;
  examType: ExamType;
  year?: number;
  month?: number;
  examNumber?: string;
}) {
  if (!input.year || !input.month || !input.examNumber) {
    return null;
  }

  const start = new Date(input.year, input.month - 1, 1);
  const end = new Date(input.year, input.month, 1);
  const tomorrow = startOfTomorrow();
  const boundedEnd = end < tomorrow ? end : tomorrow;

  if (start >= boundedEnd) {
    return null;
  }
  const search = input.examNumber.trim();
  const student = await getPrisma().student.findFirst({
    where: {
      examType: input.examType,
      OR: [
        { examNumber: search },
        { name: search },
      ],
    },
  });

  if (!student) {
    return null;
  }

  const prisma = getPrisma();
  const sessions = await prisma.examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: input.examType,
      examDate: {
        gte: start,
        lt: boundedEnd,
      },
      isCancelled: false,
    },
    select: {
      id: true,
      week: true,
      subject: true,
      examDate: true,
    },
    orderBy: {
      examDate: "asc",
    },
  });
  const sessionIds = sessions.map((session) => session.id);
  const [monthScores, approvedAbsences] =
    sessionIds.length > 0
      ? await Promise.all([
          prisma.score.findMany({
            where: {
              sessionId: {
                in: sessionIds,
              },
            },
            select: {
              examNumber: true,
              rawScore: true,
              oxScore: true,
              finalScore: true,
              attendType: true,
              sessionId: true,
            },
          }),
          prisma.absenceNote.findMany({
            where: {
              examNumber: student.examNumber,
              status: "APPROVED",
              sessionId: {
                in: sessionIds,
              },
            },
            select: {
              examNumber: true,
              sessionId: true,
              attendCountsAsAttendance: true,
            },
          }),
        ])
      : [[], []];
  const attendanceIncludedExcuseLookup = buildAttendanceIncludedExcuseLookup(approvedAbsences);
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const scoresBySubject = new Map<Subject, typeof monthScores>();

  for (const score of monthScores) {
    const session = sessionById.get(score.sessionId);

    if (!session) {
      continue;
    }

    const current = scoresBySubject.get(session.subject) ?? [];
    current.push(score);
    scoresBySubject.set(session.subject, current);
  }

  const targets = parseTargetScores(student.targetScores);
  const subjects = subjectRowsForExamType(
    input.examType,
    Array.from(new Set(sessions.map((session) => session.subject))),
  );
  const subjectSummary = subjects.map((subject) => {
    const subjectScores = scoresBySubject.get(subject) ?? [];
    const studentScores = subjectScores.filter((score) => score.examNumber === student.examNumber);
    const studentValues = studentScores
      .map(scoredMockScoreValue)
      .filter((value): value is number => value !== null);
    const cohortValues = scoreValues(subjectScores);
    const averageMap = buildStudentAverageMap(subjectScores);
    const averagedValues = Array.from(averageMap.values());
    const studentAverage = average(studentValues);
    const cohortAverage = average(cohortValues);
    const targetScore = targets[subject] ?? null;
    const achievementRate =
      targetScore && studentAverage !== null
        ? Math.round((studentAverage / targetScore) * 1000) / 10
        : null;
    const delta =
      studentAverage !== null && cohortAverage !== null
        ? studentAverage - cohortAverage
        : null;

    return {
      subject,
      sessionCount: subjectScores.length,
      studentAverage,
      cohortAverage,
      top10Average: topAverage(cohortValues, 0.1),
      top30Average: topAverage(cohortValues, 0.3),
      participantCount: averageMap.size,
      rank:
        studentAverage !== null ? percentileRank(averagedValues, studentAverage) : null,
      targetScore,
      achievementRate,
      status:
        delta === null ? "-" : delta >= 5 ? "우수" : delta <= -5 ? "미흡" : "보통",
    };
  });

  const attendedCount = monthScores.filter(
    (score) =>
      score.examNumber === student.examNumber &&
      countsAsAnalysisAttendance(
        score.attendType,
        score.examNumber,
        score.sessionId,
        attendanceIncludedExcuseLookup,
      ),
  ).length;
  const studentMonthScores = monthScores.filter((score) => score.examNumber === student.examNumber);
  const monthlyMockAverage = average(
    studentMonthScores
      .map(scoredMockScoreValue)
      .filter((value): value is number => value !== null),
  );
  const monthlyPoliceOxAverage = average(
    studentMonthScores
      .filter(
        (score) =>
          sessionById.get(score.sessionId)?.subject === Subject.POLICE_SCIENCE &&
          score.attendType === AttendType.NORMAL &&
          score.oxScore !== null,
      )
      .map((score) => score.oxScore as number),
  );

  return {
    student: {
      examNumber: student.examNumber,
      name: student.name,
      examType: student.examType,
      currentStatus: student.currentStatus,
      targetScores: targets,
    },
    summary: {
      sessionCount: sessions.length,
      attendedCount,
      attendanceRate:
        sessions.length === 0 ? 0 : Math.round((attendedCount / sessions.length) * 1000) / 10,
      monthlyAverage: getCombinedAverage(
        monthlyMockAverage,
        monthlyPoliceOxAverage,
      ),
    },
    subjectSummary,
    radarData: subjectSummary.map((row) => ({
      subject: row.subject,
      studentAverage: row.studentAverage ?? 0,
      cohortAverage: row.cohortAverage ?? 0,
      targetScore: row.targetScore ?? 0,
    })),
    barData: subjectSummary.map((row) => ({
      subject: row.subject,
      studentAverage: row.studentAverage ?? 0,
      cohortAverage: row.cohortAverage ?? 0,
      top10Average: row.top10Average ?? 0,
    })),
  };
}

export async function getSubjectTrendAnalysis(input: {
  periodId?: number;
  examType: ExamType;
  subject?: Subject;
  examNumber?: string;
}) {
  if (!input.subject) {
    return [];
  }

  const search = input.examNumber?.trim();
  const tomorrow = startOfTomorrow();
  let resolvedExamNumber = search;
  const prisma = getPrisma();

  if (search && !/^\d/.test(search)) {
    const found = await prisma.student.findFirst({
      where: { examType: input.examType, name: search },
      select: { examNumber: true },
    });
    resolvedExamNumber = found?.examNumber ?? search;
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: input.examType,
      subject: input.subject,
      isCancelled: false,
      examDate: {
        lt: tomorrow,
      },
    },
    select: {
      id: true,
      examDate: true,
      week: true,
      subject: true,
    },
    orderBy: {
      examDate: "asc",
    },
  });
  const sessionIds = sessions.map((session) => session.id);
  const [scores, searchedStudent] = await Promise.all([
    sessionIds.length > 0
      ? prisma.score.findMany({
          where: {
            sessionId: {
              in: sessionIds,
            },
          },
          select: {
            examNumber: true,
            sessionId: true,
            rawScore: true,
            oxScore: true,
            finalScore: true,
            attendType: true,
          },
        })
      : Promise.resolve([]),
    resolvedExamNumber
      ? prisma.student.findUnique({
          where: {
            examNumber: resolvedExamNumber,
          },
          select: {
            name: true,
          },
        })
      : Promise.resolve(null),
  ]);
  const scoresBySession = groupBySessionId(scores);

  return sessions.map((session) => {
    const sessionScores = scoresBySession.get(session.id) ?? [];
    const values = scoreValues(sessionScores);
    const studentScore =
      resolvedExamNumber
        ? sessionScores.find((score) => score.examNumber === resolvedExamNumber) ?? null
        : null;

    return {
      sessionId: session.id,
      examDate: session.examDate,
      week: session.week,
      subject: session.subject,
      participantCount: values.length,
      averageScore: average(values),
      top10Average: topAverage(values, 0.1),
      top30Average: topAverage(values, 0.3),
      highestScore: values.length > 0 ? Math.max(...values) : null,
      studentScore: studentScore ? scoredMockScoreValue(studentScore) : null,
      studentName: studentScore ? searchedStudent?.name ?? null : null,
    };
  });
}

export type SubjectStudentRankingRow = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  isActive: boolean;
  sessionCount: number;
  totalSessions: number;
  attendanceRate: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  rank: number | null;
};

export async function getSubjectStudentRanking(input: {
  periodId?: number;
  examType: ExamType;
  subject?: Subject;
}): Promise<SubjectStudentRankingRow[]> {
  if (!input.subject) {
    return [];
  }

  const prisma = getPrisma();
  const sessionWhere = {
    periodId: input.periodId,
    examType: input.examType,
    subject: input.subject,
    isCancelled: false,
    examDate: {
      lt: startOfTomorrow(),
    },
  } satisfies Prisma.ExamSessionWhereInput;
  const [totalSessions, scores, approvedAbsences] = await Promise.all([
    prisma.examSession.count({
      where: sessionWhere,
    }),
    prisma.score.findMany({
      where: {
        attendType: {
          in: [AttendType.NORMAL, AttendType.LIVE, AttendType.EXCUSED],
        },
        session: sessionWhere,
      },
      select: {
        examNumber: true,
        sessionId: true,
        rawScore: true,
        oxScore: true,
        finalScore: true,
        attendType: true,
        student: {
          select: {
            name: true,
            studentType: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.absenceNote.findMany({
      where: {
        status: "APPROVED",
        session: sessionWhere,
      },
      select: {
        examNumber: true,
        sessionId: true,
        attendCountsAsAttendance: true,
      },
    }),
  ]);
  const attendanceIncludedExcuseLookup = buildAttendanceIncludedExcuseLookup(approvedAbsences);


  const studentMap = new Map<string, {
    examNumber: string;
    name: string;
    studentType: StudentType;
    isActive: boolean;
    scores: number[];
    sessionCount: number;
  }>();

  for (const score of scores) {
    const existing = studentMap.get(score.examNumber) ?? {
      examNumber: score.examNumber,
      name: score.student.name,
      studentType: score.student.studentType,
      isActive: score.student.isActive,
      scores: [],
      sessionCount: 0,
    };
    const attendanceIncluded = countsAsAnalysisAttendance(
      score.attendType,
      score.examNumber,
      score.sessionId,
      attendanceIncludedExcuseLookup,
    );

    if (attendanceIncluded) {
      existing.sessionCount++;
    }

    const value = scoredMockScoreValue(score);
    if (value !== null) {
      existing.scores.push(value);
    }

    if (attendanceIncluded || value !== null) {
      studentMap.set(score.examNumber, existing);
    }
  }

  const sorted = Array.from(studentMap.values())
    .map((s) => ({
      examNumber: s.examNumber,
      name: s.name,
      studentType: s.studentType,
      isActive: s.isActive,
      sessionCount: s.sessionCount,
      totalSessions,
      attendanceRate:
        totalSessions === 0 ? 0 : Math.round((s.sessionCount / totalSessions) * 1000) / 10,
      average: average(s.scores),
      highest: s.scores.length > 0 ? Math.max(...s.scores) : null,
      lowest: s.scores.length > 0 ? Math.min(...s.scores) : null,
    }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  let rank = 1;
  return sorted.map((row, index) => {
    if (index > 0 && row.average !== sorted[index - 1].average) {
      rank = index + 1;
    }
    return { ...row, rank: row.average !== null ? rank : null };
  });
}

export type CumulativeAnalysisData = {
  student: {
    examNumber: string;
    name: string;
    className: string | null;
    generation: number | null;
    examType: ExamType;
    currentStatus: StudentStatus;
    isActive: boolean;
    targetScores: SubjectTargetScores;
  };
  periods: Array<{
    id: number;
    name: string;
    avg: number | null;
    sessionCount: number;
    attendedCount: number;
  }>;
  trend: Array<{
    date: string;
    label: string;
    subject: Subject;
    finalScore: number | null;
    attendType: string | null;
    periodName: string;
    periodId: number;
    week: number;
  }>;
  subjectStats: Array<{
    subject: Subject;
    avg: number | null;
    target: number | null;
    sessionCount: number;
    scoredCount: number;
    highest: number | null;
    lowest: number | null;
    trend: "up" | "down" | "flat";
    isWeak: boolean;
  }>;
  weakSubjects: Subject[];
  statusHistory: Array<{
    weekKey: string;
    weekStartDate: string;
    status: StudentStatus;
  }>;
  totalSessions: number;
  attendedCount: number;
  overallAvg: number | null;
  attendanceRate: number;
  bestPeriod: { id: number; name: string; avg: number | null } | null;
};

export type StudentComparisonStudentSubjectRow = {
  subject: Subject;
  average: number | null;
  recentAverage: number | null;
  targetScore: number | null;
  sessionCount: number;
  scoredCount: number;
  isWeak: boolean;
};

export type StudentComparisonStudentSummary = {
  student: {
    examNumber: string;
    name: string;
    className: string | null;
    generation: number | null;
    examType: ExamType;
    currentStatus: StudentStatus;
    isActive: boolean;
    targetScores: SubjectTargetScores;
  };
  totalSessions: number;
  attendedCount: number;
  attendanceRate: number;
  overallAvg: number | null;
  recentAverage: number | null;
  recentScoreCount: number;
  weakSubjects: Subject[];
  strongSubject: { subject: Subject; average: number } | null;
  weakSubject: { subject: Subject; average: number; targetScore: number | null } | null;
  subjectRows: StudentComparisonStudentSubjectRow[];
};

export type StudentComparisonData = {
  availablePeriods: Array<{
    id: number;
    name: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  }>;
  selectedPeriod: {
    id: number;
    name: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  } | null;
  recentCount: number;
  studentA: StudentComparisonStudentSummary;
  studentB: StudentComparisonStudentSummary;
  radarData: Array<{
    subject: Subject;
    studentA: number;
    studentB: number;
  }>;
  subjectRows: Array<{
    subject: Subject;
    studentAAverage: number | null;
    studentBAverage: number | null;
    studentARecentAverage: number | null;
    studentBRecentAverage: number | null;
    averageDelta: number | null;
    recentDelta: number | null;
    studentATargetScore: number | null;
    studentBTargetScore: number | null;
  }>;
};

export type StudentComparisonLoadResult =
  | { kind: "ok"; data: StudentComparisonData }
  | { kind: "same_student" }
  | { kind: "missing_student_a"; examNumber: string }
  | { kind: "missing_student_b"; examNumber: string }
  | {
      kind: "exam_type_mismatch";
      examTypeA: ExamType;
      examTypeB: ExamType;
    };

export type MonthlyBreakdownRow = {
  year: number;
  month: number;
  monthLabel: string;
  sessionCount: number;
  attendedCount: number;
  absentCount: number;
  excusedCount: number;
  studentAverage: number | null;
  cohortAverage: number | null;
  studentRank: number | null;
  totalParticipants: number;
  changeFromPrevMonth: number | null;
};

export type CounselingBriefing = {
  overallAverage: number | null;
  overallRank: number | null;
  participationRate: number;
  absentCount: number;
  currentStatus: StudentStatus;
  recentWeeksTrend: Array<{
    weekLabel: string;
    weekStartDate: string;
    bySubject: Array<{
      subject: Subject;
      avgScore: number | null;
    }>;
  }>;
  subjectProgress: Array<{
    subject: Subject;
    currentAverage: number | null;
    targetScore: number | null;
    gap: number | null;
    trend: "up" | "down" | "flat";
    isWeak: boolean;
  }>;
  sinceLastCounseling: {
    lastCounseledAt: string | null;
    avgBefore: number | null;
    avgAfter: number | null;
    change: number | null;
  } | null;
};

export type SubjectHeatmapData = {
  weeks: Array<{
    weekKey: string;
    weekLabel: string;
    sessionCount: number;
  }>;
  rows: Array<{
    subject: Subject;
    targetScore: number | null;
    cells: Array<{
      weekKey: string;
      averageScore: number | null;
      sessionCount: number;
      scoredCount: number;
    }>;
  }>;
};

export type StudentDetailAnalysisData = {
  student: {
    examNumber: string;
    name: string;
    examType: ExamType;
    currentStatus: StudentStatus;
    targetScores: Prisma.JsonValue | null;
  };
  availablePeriods: Array<{
    id: number;
    name: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  }>;
  selectedPeriod: {
    id: number;
    name: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  } | null;
  targetScores: SubjectTargetScores;
  subjectSummary: Array<{
    subject: Subject;
    studentAverage: number | null;
    cohortAverage: number | null;
    top10Average: number | null;
    highestScore: number | null;
    targetScore: number | null;
    sessionCount: number;
  }>;
  radarData: Array<{
    subject: Subject;
    studentAverage: number;
    cohortAverage: number;
    targetScore: number;
  }>;
  trendData: Array<{
    label: string;
    subject: Subject;
    examDate: Date;
    studentScore: number | null;
    cohortAverage: number | null;
    top10Average: number | null;
    top30Average: number | null;
    highestScore: number | null;
    participantCount: number;
    studentRank: number | null;
    percentile: number | null;
  }>;
  subjectHeatmap: SubjectHeatmapData;
  monthlyBreakdown: MonthlyBreakdownRow[];
  wrongQuestionRows: Array<{
    id: number;
    subject: Subject;
    examDate: Date;
    questionNo: number;
    correctAnswer: string;
    answer: string;
    correctRate: number | null;
    difficulty: string | null;
  }>;
  recentCount: number | null;
};

function buildSubjectScoreHeatmap(input: {
  examNumber: string;
  sessions: Array<{ id: number; subject: Subject; examDate: Date }>;
  scores: Array<{
    examNumber: string;
    sessionId: number;
    rawScore: number | null;
    oxScore: number | null;
    finalScore: number | null;
    attendType: AttendType;
  }>;
  subjects: Subject[];
  targets: SubjectTargetScores;
}): SubjectHeatmapData {
  const weekGroups = new Map<
    string,
    {
      startDate: Date;
      sessions: Array<{ id: number; subject: Subject; examDate: Date }>;
    }
  >();
  const studentScoreBySessionId = new Map(
    input.scores
      .filter((score) => score.examNumber === input.examNumber)
      .map((score) => [score.sessionId, score]),
  );

  for (const session of input.sessions) {
    const weekKey = getTuesdayWeekKey(session.examDate);
    const current = weekGroups.get(weekKey) ?? {
      startDate: getTuesdayWeekStart(session.examDate),
      sessions: [],
    };
    current.sessions.push(session);
    weekGroups.set(weekKey, current);
  }

  const weeks = Array.from(weekGroups.entries())
    .sort((left, right) => left[1].startDate.getTime() - right[1].startDate.getTime())
    .map(([weekKey, group]) => ({
      weekKey,
      weekLabel: formatWeekShortLabel(group.startDate),
      sessionCount: group.sessions.length,
    }));

  const rows = input.subjects.map((subject) => ({
    subject,
    targetScore: input.targets[subject] ?? null,
    cells: weeks.map((week) => {
      const weekSessions = (weekGroups.get(week.weekKey)?.sessions ?? []).filter(
        (session) => session.subject === subject,
      );
      const scoredValues = weekSessions
        .map((session) => studentScoreBySessionId.get(session.id) ?? null)
        .map((score) => (score ? scoredMockScoreValue(score) : null))
        .filter((value): value is number => value !== null);

      return {
        weekKey: week.weekKey,
        averageScore: average(scoredValues),
        sessionCount: weekSessions.length,
        scoredCount: scoredValues.length,
      };
    }),
  }));

  return {
    weeks,
    rows,
  };
}

function buildMonthlyBreakdown(input: {
  examNumber: string;
  sessions: Array<{ id: number; examDate: Date }>;
  scores: Array<{
    examNumber: string;
    sessionId: number;
    rawScore: number | null;
    oxScore: number | null;
    finalScore: number | null;
    attendType: AttendType;
  }>;
  approvedAbsences: Array<{
    examNumber: string;
    sessionId: number;
    attendCountsAsAttendance: boolean;
  }>;
}): MonthlyBreakdownRow[] {
  const grouped = new Map<
    string,
    {
      date: Date;
      sessions: Array<{ id: number; examDate: Date }>;
    }
  >();
  const approvedAbsenceLookup = new Set(
    input.approvedAbsences.map((absence) => `${absence.examNumber}:${absence.sessionId}`),
  );
  const sessionScoreCounts = new Map<number, number>();

  for (const score of input.scores) {
    sessionScoreCounts.set(score.sessionId, (sessionScoreCounts.get(score.sessionId) ?? 0) + 1);
  }

  for (const session of input.sessions) {
    const key = monthKey(session.examDate);
    const current = grouped.get(key) ?? { date: session.examDate, sessions: [] };
    current.sessions.push(session);
    grouped.set(key, current);
  }

  let previousAverage: number | null = null;

  return Array.from(grouped.values())
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .map((group) => {
      const sessionIds = new Set(group.sessions.map((session) => session.id));
      const monthScores = input.scores.filter((score) => sessionIds.has(score.sessionId));
      const studentScores = monthScores.filter((score) => score.examNumber === input.examNumber);
      const studentScoreMap = new Map(studentScores.map((score) => [score.sessionId, score]));
      const studentValues = studentScores
        .map(scoredMockScoreValue)
        .filter((value): value is number => value !== null);
      const averagedValues = Array.from(buildStudentAverageMap(monthScores).values());
      const studentAverage = average(studentValues);
      let attendedCount = 0;
      let absentCount = 0;
      let excusedCount = 0;

      for (const session of group.sessions) {
        const score = studentScoreMap.get(session.id) ?? null;
        const approvedAbsence = approvedAbsenceLookup.has(`${input.examNumber}:${session.id}`);
        const isPendingInput = (sessionScoreCounts.get(session.id) ?? 0) === 0;
        const attendType =
          score?.attendType ??
          (approvedAbsence ? AttendType.EXCUSED : !isPendingInput ? AttendType.ABSENT : null);

        if (attendType === AttendType.NORMAL || attendType === AttendType.LIVE) {
          attendedCount += 1;
        }

        if (attendType === AttendType.ABSENT) {
          absentCount += 1;
        }

        if (attendType === AttendType.EXCUSED) {
          excusedCount += 1;
        }
      }

      const changeFromPrevMonth =
        previousAverage !== null && studentAverage !== null
          ? roundTo(studentAverage - previousAverage)
          : null;

      previousAverage = studentAverage;

      return {
        year: group.date.getFullYear(),
        month: group.date.getMonth() + 1,
        monthLabel: formatMonthLabel(group.date),
        sessionCount: group.sessions.length,
        attendedCount,
        absentCount,
        excusedCount,
        studentAverage,
        cohortAverage: average(averagedValues),
        studentRank:
          studentAverage !== null ? percentileRank(averagedValues, studentAverage) : null,
        totalParticipants: averagedValues.length,
        changeFromPrevMonth,
      };
    });
}

function normalizeRecentCount(value?: number) {
  return value && ([5, 10, 20] as const).includes(value as 5 | 10 | 20) ? value : 10;
}

function buildComparisonStudentSummary(input: {
  student: {
    examNumber: string;
    name: string;
    className: string | null;
    generation: number | null;
    examType: ExamType;
    currentStatus: StudentStatus;
    isActive: boolean;
    targetScores: Prisma.JsonValue | null;
  };
  sessions: Array<{
    id: number;
    subject: Subject;
    examDate: Date;
  }>;
  scores: Array<{
    sessionId: number;
    rawScore: number | null;
    oxScore: number | null;
    finalScore: number | null;
    attendType: AttendType;
  }>;
  approvedAbsences: Array<{
    examNumber: string;
    sessionId: number;
    attendCountsAsAttendance: boolean;
  }>;
  subjects: Subject[];
  recentCount: number;
}): StudentComparisonStudentSummary {
  const targets = parseTargetScores(input.student.targetScores);
  const scoreBySessionId = new Map(input.scores.map((score) => [score.sessionId, score]));
  const attendanceIncludedExcuseLookup = buildAttendanceIncludedExcuseLookup(input.approvedAbsences);
  const sessionRows = input.sessions.map((session) => ({
    session,
    score: scoreBySessionId.get(session.id) ?? null,
    hasApprovedAttendanceExcuse: attendanceIncludedExcuseLookup.has(
      `${input.student.examNumber}:${session.id}`,
    ),
  }));
  const scoredRows = sessionRows.filter((row) => {
    if (!row.score) {
      return false;
    }

    return scoredMockScoreValue(row.score) !== null;
  });
  const recentRows = [...scoredRows]
    .sort((left, right) => right.session.examDate.getTime() - left.session.examDate.getTime())
    .slice(0, input.recentCount);
  const allScoreValues = scoredRows
    .map((row) => (row.score ? scoredMockScoreValue(row.score) : null))
    .filter((value): value is number => value !== null);
  const policeOxValues = sessionRows
    .filter(
      (row) =>
        row.session.subject === Subject.POLICE_SCIENCE &&
        row.score?.attendType === AttendType.NORMAL &&
        row.score.oxScore !== null,
    )
    .map((row) => row.score?.oxScore as number);
  const attendedCount = sessionRows.filter((row) => {
    if (row.score) {
      return countsAsAnalysisAttendance(
        row.score.attendType,
        input.student.examNumber,
        row.session.id,
        attendanceIncludedExcuseLookup,
      );
    }

    return row.hasApprovedAttendanceExcuse;
  }).length;
  const subjectRows = input.subjects.map((subject) => {
    const subjectSessionRows = sessionRows.filter((row) => row.session.subject === subject);
    const subjectScoredValues = subjectSessionRows
      .map((row) => (row.score ? scoredMockScoreValue(row.score) : null))
      .filter((value): value is number => value !== null);
    const recentSubjectValues = recentRows
      .filter((row) => row.session.subject === subject)
      .map((row) => (row.score ? scoredMockScoreValue(row.score) : null))
      .filter((value): value is number => value !== null);
    const averageScore = average(subjectScoredValues);
    const targetScore = targets[subject] ?? null;

    return {
      subject,
      average: averageScore,
      recentAverage: average(recentSubjectValues),
      targetScore,
      sessionCount: subjectSessionRows.length,
      scoredCount: subjectScoredValues.length,
      isWeak: averageScore !== null && targetScore !== null && averageScore < targetScore,
    };
  });
  const strongSubject =
    [...subjectRows]
      .filter((row) => row.average !== null)
      .sort((left, right) => (right.average ?? -1) - (left.average ?? -1))[0] ?? null;
  const weakSubject =
    [...subjectRows]
      .filter((row) => row.average !== null)
      .sort((left, right) => {
        const leftGap =
          left.targetScore !== null && left.average !== null
            ? left.average - left.targetScore
            : left.average ?? 0;
        const rightGap =
          right.targetScore !== null && right.average !== null
            ? right.average - right.targetScore
            : right.average ?? 0;

        return leftGap - rightGap;
      })[0] ?? null;

  return {
    student: {
      examNumber: input.student.examNumber,
      name: input.student.name,
      className: input.student.className,
      generation: input.student.generation,
      examType: input.student.examType,
      currentStatus: input.student.currentStatus,
      isActive: input.student.isActive,
      targetScores: targets,
    },
    totalSessions: input.sessions.length,
    attendedCount,
    attendanceRate:
      input.sessions.length === 0 ? 0 : roundTo((attendedCount / input.sessions.length) * 100),
    overallAvg: getCombinedAverage(average(allScoreValues), average(policeOxValues)),
    recentAverage: average(
      recentRows
        .map((row) => (row.score ? scoredMockScoreValue(row.score) : null))
        .filter((value): value is number => value !== null),
    ),
    recentScoreCount: recentRows.length,
    weakSubjects: subjectRows.filter((row) => row.isWeak).map((row) => row.subject),
    strongSubject:
      strongSubject && strongSubject.average !== null
        ? { subject: strongSubject.subject, average: strongSubject.average }
        : null,
    weakSubject:
      weakSubject && weakSubject.average !== null
        ? {
            subject: weakSubject.subject,
            average: weakSubject.average,
            targetScore: weakSubject.targetScore,
          }
        : null,
    subjectRows,
  };
}

export async function getStudentComparisonAnalysis(input: {
  examNumberA: string;
  examNumberB: string;
  periodId?: number;
  recent?: number;
}): Promise<StudentComparisonLoadResult> {
  const examNumberA = input.examNumberA.trim();
  const examNumberB = input.examNumberB.trim();

  if (examNumberA === examNumberB) {
    return { kind: "same_student" };
  }

  const prisma = getPrisma();
  const [studentA, studentB] = await Promise.all([
    prisma.student.findFirst({
      where: {
        ...NON_PLACEHOLDER_STUDENT_FILTER,
        examNumber: examNumberA,
      },
    }),
    prisma.student.findFirst({
      where: {
        ...NON_PLACEHOLDER_STUDENT_FILTER,
        examNumber: examNumberB,
      },
    }),
  ]);

  if (!studentA) {
    return { kind: "missing_student_a", examNumber: examNumberA };
  }

  if (!studentB) {
    return { kind: "missing_student_b", examNumber: examNumberB };
  }

  if (studentA.examType !== studentB.examType) {
    return {
      kind: "exam_type_mismatch",
      examTypeA: studentA.examType,
      examTypeB: studentB.examType,
    };
  }

  const tomorrow = startOfTomorrow();
  const availablePeriods = await prisma.examPeriod.findMany({
    where: {
      sessions: {
        some: {
          examType: studentA.examType,
          isCancelled: false,
          examDate: {
            lt: tomorrow,
          },
        },
      },
    },
    orderBy: {
      startDate: "desc",
    },
  });
  const selectedPeriodId =
    input.periodId && availablePeriods.some((period) => period.id === input.periodId)
      ? input.periodId
      : availablePeriods.find((period) => period.isActive)?.id ?? availablePeriods[0]?.id;
  const selectedPeriod =
    availablePeriods.find((period) => period.id === selectedPeriodId) ?? null;
  const recentCount = normalizeRecentCount(input.recent);
  const sessions =
    selectedPeriodId !== undefined
      ? await prisma.examSession.findMany({
          where: {
            periodId: selectedPeriodId,
            examType: studentA.examType,
            isCancelled: false,
            examDate: {
              lt: tomorrow,
            },
          },
          select: {
            id: true,
            subject: true,
            examDate: true,
          },
          orderBy: [{ examDate: "asc" }, { id: "asc" }],
        })
      : [];
  const sessionIds = sessions.map((session) => session.id);
  const [scores, approvedAbsences] =
    sessionIds.length > 0
      ? await Promise.all([
          prisma.score.findMany({
            where: {
              examNumber: {
                in: [examNumberA, examNumberB],
              },
              sessionId: {
                in: sessionIds,
              },
            },
            select: {
              examNumber: true,
              sessionId: true,
              rawScore: true,
              oxScore: true,
              finalScore: true,
              attendType: true,
            },
          }),
          prisma.absenceNote.findMany({
            where: {
              examNumber: {
                in: [examNumberA, examNumberB],
              },
              status: "APPROVED",
              sessionId: {
                in: sessionIds,
              },
            },
            select: {
              examNumber: true,
              sessionId: true,
              attendCountsAsAttendance: true,
            },
          }),
        ])
      : [[], []];
  const subjects = subjectRowsForExamType(
    studentA.examType,
    Array.from(new Set(sessions.map((session) => session.subject))),
  );
  const studentASummary = buildComparisonStudentSummary({
    student: studentA,
    sessions,
    scores: scores
      .filter((score) => score.examNumber === examNumberA)
      .map((score) => ({
        sessionId: score.sessionId,
        rawScore: score.rawScore,
        oxScore: score.oxScore,
        finalScore: score.finalScore,
        attendType: score.attendType,
      })),
    approvedAbsences: approvedAbsences.filter((absence) => absence.examNumber === examNumberA),
    subjects,
    recentCount,
  });
  const studentBSummary = buildComparisonStudentSummary({
    student: studentB,
    sessions,
    scores: scores
      .filter((score) => score.examNumber === examNumberB)
      .map((score) => ({
        sessionId: score.sessionId,
        rawScore: score.rawScore,
        oxScore: score.oxScore,
        finalScore: score.finalScore,
        attendType: score.attendType,
      })),
    approvedAbsences: approvedAbsences.filter((absence) => absence.examNumber === examNumberB),
    subjects,
    recentCount,
  });
  const studentASubjectMap = new Map(studentASummary.subjectRows.map((row) => [row.subject, row]));
  const studentBSubjectMap = new Map(studentBSummary.subjectRows.map((row) => [row.subject, row]));

  return {
    kind: "ok",
    data: {
      availablePeriods,
      selectedPeriod,
      recentCount,
      studentA: studentASummary,
      studentB: studentBSummary,
      radarData: subjects.map((subject) => ({
        subject,
        studentA: studentASubjectMap.get(subject)?.average ?? 0,
        studentB: studentBSubjectMap.get(subject)?.average ?? 0,
      })),
      subjectRows: subjects.map((subject) => {
        const studentARow = studentASubjectMap.get(subject);
        const studentBRow = studentBSubjectMap.get(subject);
        const studentAAverage = studentARow?.average ?? null;
        const studentBAverage = studentBRow?.average ?? null;
        const studentARecentAverage = studentARow?.recentAverage ?? null;
        const studentBRecentAverage = studentBRow?.recentAverage ?? null;

        return {
          subject,
          studentAAverage,
          studentBAverage,
          studentARecentAverage,
          studentBRecentAverage,
          averageDelta:
            studentAAverage !== null && studentBAverage !== null
              ? roundTo(studentAAverage - studentBAverage)
              : null,
          recentDelta:
            studentARecentAverage !== null && studentBRecentAverage !== null
              ? roundTo(studentARecentAverage - studentBRecentAverage)
              : null,
          studentATargetScore: studentARow?.targetScore ?? null,
          studentBTargetScore: studentBRow?.targetScore ?? null,
        };
      }),
    },
  };
}

export async function getStudentCumulativeAnalysis(
  examNumber: string,
): Promise<CumulativeAnalysisData | null> {
  const prisma = getPrisma();
  const tomorrow = startOfTomorrow();

  const student = await prisma.student.findUnique({ where: { examNumber } });
  if (!student) return null;

  const relevantPeriods = await prisma.examPeriod.findMany({
    where: {
      OR: [
        {
          enrollments: {
            some: {
              examNumber,
            },
          },
        },
        {
          sessions: {
            some: {
              examType: student.examType,
              scores: {
                some: {
                  examNumber,
                },
              },
            },
          },
        },
        {
          sessions: {
            some: {
              examType: student.examType,
              absenceNotes: {
                some: {
                  examNumber,
                },
              },
            },
          },
        },
        {
          weeklyStatusSnapshots: {
            some: {
              examNumber,
              examType: student.examType,
            },
          },
        },
      ],
    },
    orderBy: { startDate: "asc" },
  });
  const relevantPeriodIds = relevantPeriods.map((period) => period.id);
  const periodById = new Map(relevantPeriods.map((period) => [period.id, period]));

  const sessions = relevantPeriodIds.length
    ? await prisma.examSession.findMany({
        where: {
          periodId: { in: relevantPeriodIds },
          examType: student.examType,
          isCancelled: false,
          examDate: {
            lt: tomorrow,
          },
        },
        select: {
          id: true,
          periodId: true,
          week: true,
          subject: true,
          examDate: true,
        },
        orderBy: [{ examDate: "asc" }, { week: "asc" }],
      })
    : [];
  const sessionIds = sessions.map((session) => session.id);
  const [scores, approvedAbsences] =
    sessionIds.length > 0
      ? await Promise.all([
          prisma.score.findMany({
            where: {
              examNumber,
              sessionId: {
                in: sessionIds,
              },
            },
            select: {
              sessionId: true,
              rawScore: true,
              oxScore: true,
              finalScore: true,
              attendType: true,
            },
          }),
          prisma.absenceNote.findMany({
            where: {
              examNumber,
              status: "APPROVED",
              sessionId: {
                in: sessionIds,
              },
            },
            select: {
              examNumber: true,
              sessionId: true,
              attendCountsAsAttendance: true,
            },
          }),
        ])
      : [[], []];
  const attendanceIncludedExcuseLookup = buildAttendanceIncludedExcuseLookup(approvedAbsences);
  const scoreBySessionId = new Map(scores.map((score) => [score.sessionId, score]));

  type SnapRow = { weekKey: string; weekStartDate: Date; status: StudentStatus };
  let rawSnapshots: SnapRow[] = [];
  if (relevantPeriodIds.length > 0) {
    try {
      rawSnapshots = await prisma.weeklyStatusSnapshot.findMany({
        where: {
          examNumber,
          examType: student.examType,
          periodId: { in: relevantPeriodIds },
        },
        orderBy: [{ weekStartDate: "asc" }, { weekKey: "asc" }],
      });
    } catch (error) {
      if (!isMissingWeeklyStatusSnapshotError(error)) {
        throw error;
      }
    }
  }

  const targets = parseTargetScores(student.targetScores);

  const trend = sessions.map((session) => {
    const score = scoreBySessionId.get(session.id) ?? null;
    const period = periodById.get(session.periodId);

    if (!period) {
      return null;
    }

    return {
      date: session.examDate.toISOString(),
      label: formatTrendDateLabel(session.examDate),
      subject: session.subject,
      finalScore: score ? (scoredMockScoreValue(score) ?? null) : null,
      attendType: score?.attendType ?? null,
      periodName: period.name,
      periodId: session.periodId,
      week: session.week,
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);

  const periodMap = new Map<
    number,
    {
      id: number;
      name: string;
      startDate: Date;
      mockScores: number[];
      policeOxScores: number[];
      sessionCount: number;
      attendedCount: number;
    }
  >();
  for (const session of sessions) {
    const score = scoreBySessionId.get(session.id) ?? null;
    const period = periodById.get(session.periodId);

    if (!period) {
      continue;
    }

    const existing = periodMap.get(session.periodId) ?? {
      id: session.periodId,
      name: period.name,
      startDate: period.startDate,
      mockScores: [],
      policeOxScores: [],
      sessionCount: 0,
      attendedCount: 0,
    };
    existing.sessionCount++;
    if (score) {
      if (score.attendType === AttendType.NORMAL) {
        const value = scoredMockScoreValue(score);
        if (value !== null) {
          existing.mockScores.push(value);
          if (session.subject === Subject.POLICE_SCIENCE && score.oxScore !== null) {
            existing.policeOxScores.push(score.oxScore);
          }
          existing.attendedCount++;
        }
      } else if (
        countsAsAnalysisAttendance(
          score.attendType,
          examNumber,
          session.id,
          attendanceIncludedExcuseLookup,
        )
      ) {
        existing.attendedCount++;
      }
    }
    periodMap.set(session.periodId, existing);
  }
  const periods = Array.from(periodMap.values())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((p) => ({
      id: p.id,
      name: p.name,
      avg: getCombinedAverage(average(p.mockScores), average(p.policeOxScores)),
      sessionCount: p.sessionCount,
      attendedCount: p.attendedCount,
    }));

  const subjectScoreListMap = new Map<Subject, number[]>();
  for (const session of sessions) {
    const score = scoreBySessionId.get(session.id);
    if (!score || score.attendType !== AttendType.NORMAL) continue;
    const value = scoredMockScoreValue(score);
    if (value === null) continue;
    const list = subjectScoreListMap.get(session.subject) ?? [];
    list.push(value);
    subjectScoreListMap.set(session.subject, list);
  }

  const allSubjects = Array.from(
    new Set([...EXAM_TYPE_SUBJECTS[student.examType], ...Array.from(subjectScoreListMap.keys())]),
  );

  const subjectSessionCounts = new Map<Subject, number>();
  for (const session of sessions) {
    subjectSessionCounts.set(session.subject, (subjectSessionCounts.get(session.subject) ?? 0) + 1);
  }

  const subjectStats = allSubjects.map((subject) => {
    const scores = subjectScoreListMap.get(subject) ?? [];
    const avg = average(scores);
    const target = targets[subject] ?? null;
    let trendDir: "up" | "down" | "flat" = "flat";
    if (scores.length >= 4) {
      const mid = Math.floor(scores.length / 2);
      const delta = (average(scores.slice(mid)) ?? 0) - (average(scores.slice(0, mid)) ?? 0);
      if (delta >= 3) trendDir = "up";
      else if (delta <= -3) trendDir = "down";
    }
    return {
      subject,
      avg,
      target,
      sessionCount: subjectSessionCounts.get(subject) ?? 0,
      scoredCount: scores.length,
      highest: scores.length > 0 ? Math.max(...scores) : null,
      lowest: scores.length > 0 ? Math.min(...scores) : null,
      trend: trendDir,
      isWeak: avg !== null && target !== null && avg < target,
    };
  });

  const allScoreValues = sessions.flatMap((session) => {
    const score = scoreBySessionId.get(session.id);
    if (!score || score.attendType !== AttendType.NORMAL) return [];
    const value = scoredMockScoreValue(score);
    return value !== null ? [value] : [];
  });
  const allPoliceOxValues = sessions.flatMap((session) => {
    const score = scoreBySessionId.get(session.id);
    if (
      !score ||
      score.attendType !== AttendType.NORMAL ||
      session.subject !== Subject.POLICE_SCIENCE ||
      score.oxScore === null
    ) {
      return [];
    }
    return [score.oxScore];
  });

  const attendedCount = sessions.filter((session) => {
    const score = scoreBySessionId.get(session.id);
    return (
      score &&
      countsAsAnalysisAttendance(
        score.attendType,
        examNumber,
        session.id,
        attendanceIncludedExcuseLookup,
      )
    );
  }).length;

  const bestPeriod = periods.reduce<{ id: number; name: string; avg: number | null } | null>(
    (best, p) => {
      if (p.avg === null) return best;
      if (!best || p.avg > (best.avg ?? -1)) return { id: p.id, name: p.name, avg: p.avg };
      return best;
    },
    null,
  );

  return {
    student: {
      examNumber: student.examNumber,
      name: student.name,
      className: student.className,
      generation: student.generation,
      examType: student.examType,
      currentStatus: student.currentStatus,
      isActive: student.isActive,
      targetScores: targets,
    },
    periods,
    trend,
    subjectStats,
    weakSubjects: subjectStats.filter((s) => s.isWeak).map((s) => s.subject),
    statusHistory: rawSnapshots.map((snap) => ({
      weekKey: snap.weekKey,
      weekStartDate: snap.weekStartDate.toISOString(),
      status: snap.status,
    })),
    totalSessions: sessions.length,
    attendedCount,
    overallAvg: getCombinedAverage(average(allScoreValues), average(allPoliceOxValues)),
    attendanceRate:
      sessions.length === 0 ? 0 : Math.round((attendedCount / sessions.length) * 1000) / 10,
    bestPeriod,
  };
}

export async function getStudentDetailAnalysis(input: {
  examNumber: string;
  periodId?: number;
  recent?: number;
}): Promise<StudentDetailAnalysisData | null> {
  const prisma = getPrisma();
  const tomorrow = startOfTomorrow();
  const student = await prisma.student.findUnique({
    where: {
      examNumber: input.examNumber,
    },
  });

  if (!student) {
    return null;
  }

  const normalizedRecent =
    input.recent && ([5, 10, 20] as const).includes(input.recent as 5 | 10 | 20)
      ? input.recent
      : undefined;

  const availablePeriods = await prisma.examPeriod.findMany({
    where: {
      sessions: {
        some: {
          scores: {
            some: {
              examNumber: input.examNumber,
            },
          },
        },
      },
    },
    orderBy: {
      startDate: "desc",
    },
  });
  const periodId =
    input.periodId ??
    availablePeriods.find((period) => period.isActive)?.id ??
    availablePeriods[0]?.id;

  if (!periodId) {
    return {
      student,
      availablePeriods,
      selectedPeriod: null,
      subjectSummary: [],
      radarData: [],
      trendData: [],
      subjectHeatmap: { weeks: [], rows: [] },
      monthlyBreakdown: [],
      wrongQuestionRows: [],
      targetScores: parseTargetScores(student.targetScores),
      recentCount: normalizedRecent ?? null,
    };
  }

  const [selectedPeriod, allSessions] = await Promise.all([
    prisma.examPeriod.findUniqueOrThrow({
      where: {
        id: periodId,
      },
    }),
    prisma.examSession.findMany({
      where: {
        periodId,
        examType: student.examType,
        isCancelled: false,
        examDate: {
          lt: tomorrow,
        },
      },
      select: {
        id: true,
        subject: true,
        examDate: true,
      },
      orderBy: {
        examDate: "asc",
      },
    }),
  ]);

  const sessions = normalizedRecent ? allSessions.slice(-normalizedRecent) : allSessions;
  const sessionIds = sessions.map((session) => session.id);
  const [scores, approvedAbsences, wrongAnswers] =
    sessionIds.length > 0
      ? await Promise.all([
          prisma.score.findMany({
            where: {
              sessionId: {
                in: sessionIds,
              },
            },
            select: {
              examNumber: true,
              sessionId: true,
              rawScore: true,
              oxScore: true,
              finalScore: true,
              attendType: true,
            },
          }),
          prisma.absenceNote.findMany({
            where: {
              status: "APPROVED",
              sessionId: {
                in: sessionIds,
              },
            },
            select: {
              examNumber: true,
              sessionId: true,
              attendCountsAsAttendance: true,
            },
          }),
          prisma.studentAnswer.findMany({
            where: {
              examNumber: input.examNumber,
              isCorrect: false,
              question: {
                questionSession: {
                  id: {
                    in: sessionIds,
                  },
                },
              },
            },
            select: {
              id: true,
              answer: true,
              question: {
                select: {
                  questionNo: true,
                  correctAnswer: true,
                  correctRate: true,
                  difficulty: true,
                  questionSession: true,
                },
              },
            },
            orderBy: {
              question: {
                correctRate: "asc",
              },
            },
            take: 20,
          }),
        ])
      : [[], [], []];
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const scoresBySession = groupBySessionId(scores);

  const targets = parseTargetScores(student.targetScores);
  const scoreRows = scores.flatMap((score) => {
    const session = sessionById.get(score.sessionId);
    return session ? [{ ...score, session }] : [];
  });
  const subjects = subjectRowsForExamType(
    student.examType,
    Array.from(new Set(sessions.map((session) => session.subject))),
  );
  const subjectSummary = subjects.map((subject) => {
    const subjectScores = scoreRows.filter((score) => score.session.subject === subject);
    const studentScores = subjectScores.filter((score) => score.examNumber === input.examNumber);
    const studentValues = studentScores
      .map(scoredMockScoreValue)
      .filter((value): value is number => value !== null);
    const cohortValues = scoreValues(subjectScores);

    return {
      subject,
      studentAverage: average(studentValues),
      cohortAverage: average(cohortValues),
      top10Average: topAverage(cohortValues, 0.1),
      highestScore: cohortValues.length > 0 ? Math.max(...cohortValues) : null,
      targetScore: targets[subject] ?? null,
      sessionCount: subjectScores.length,
    };
  });

  const trendData = sessions.map((session) => {
    const sessionScores = scoresBySession.get(session.id) ?? [];
    const studentScore =
      sessionScores.find((score) => score.examNumber === input.examNumber) ?? null;
    const values = scoreValues(sessionScores);
    const studentValue = studentScore ? scoredMockScoreValue(studentScore) : null;
    const studentRank = studentValue !== null ? percentileRank(values, studentValue) : null;

    return {
      label: `${session.examDate.getMonth() + 1}/${session.examDate.getDate()} ${SUBJECT_LABEL[session.subject]}`,
      subject: session.subject,
      examDate: session.examDate,
      studentScore: studentValue,
      cohortAverage: average(values),
      top10Average: topAverage(values, 0.1),
      top30Average: topAverage(values, 0.3),
      highestScore: values.length > 0 ? Math.max(...values) : null,
      participantCount: values.length,
      studentRank,
      percentile:
        studentRank !== null && values.length > 0
          ? roundTo((studentRank / values.length) * 100)
          : null,
    };
  });

  const subjectHeatmap = buildSubjectScoreHeatmap({
    examNumber: input.examNumber,
    sessions,
    scores,
    subjects,
    targets,
  });

  return {
    student,
    availablePeriods,
    selectedPeriod,
    targetScores: targets,
    subjectSummary,
    radarData: subjectSummary.map((row) => ({
      subject: row.subject,
      studentAverage: row.studentAverage ?? 0,
      cohortAverage: row.cohortAverage ?? 0,
      targetScore: row.targetScore ?? 0,
    })),
    trendData,
    subjectHeatmap,
    monthlyBreakdown: buildMonthlyBreakdown({
      examNumber: input.examNumber,
      sessions: sessions.map((session) => ({ id: session.id, examDate: session.examDate })),
      scores,
      approvedAbsences,
    }),
    wrongQuestionRows: wrongAnswers.map((answer) => ({
      id: answer.id,
      subject: answer.question.questionSession.subject,
      examDate: answer.question.questionSession.examDate,
      questionNo: answer.question.questionNo,
      correctAnswer: answer.question.correctAnswer,
      answer: answer.answer,
      correctRate: answer.question.correctRate,
      difficulty: answer.question.difficulty,
    })),
    recentCount: normalizedRecent ?? null,
  };
}

export async function getStudentCounselingBriefing(
  examNumber: string,
): Promise<CounselingBriefing | null> {
  const prisma = getPrisma();
  const [cumulative, latestCounseling] = await Promise.all([
    getStudentCumulativeAnalysis(examNumber),
    prisma.counselingRecord.findFirst({
      where: { examNumber },
      orderBy: { counseledAt: "desc" },
      select: { counseledAt: true },
    }),
  ]);

  if (!cumulative) {
    return null;
  }

  const activePeriod = await prisma.examPeriod.findFirst({
    where: {
      isActive: true,
      sessions: {
        some: {
          examType: cumulative.student.examType,
        },
      },
    },
    orderBy: { startDate: "desc" },
    select: { id: true },
  });

  let overallRank: number | null = null;

  if (activePeriod?.id) {
    const sessions = await prisma.examSession.findMany({
      where: {
        periodId: activePeriod.id,
        examType: cumulative.student.examType,
        isCancelled: false,
        examDate: {
          lt: startOfTomorrow(),
        },
      },
      select: {
        id: true,
      },
    });
    const sessionIds = sessions.map((session) => session.id);

    if (sessionIds.length > 0) {
      const periodScores = await prisma.score.findMany({
        where: {
          sessionId: {
            in: sessionIds,
          },
        },
        select: {
          examNumber: true,
          rawScore: true,
          oxScore: true,
          finalScore: true,
          attendType: true,
        },
      });
      const averageMap = buildStudentAverageMap(periodScores);
      const currentAverage = averageMap.get(examNumber) ?? null;
      overallRank =
        currentAverage !== null ? percentileRank(Array.from(averageMap.values()), currentAverage) : null;
    }
  }

  const weekGroups = new Map<string, { startDate: Date; bySubject: Map<Subject, number[]> }>();
  for (const row of cumulative.trend) {
    if (row.finalScore === null) {
      continue;
    }

    const startDate = getTuesdayWeekStart(new Date(row.date));
    const weekKey = getTuesdayWeekKey(startDate);
    const current = weekGroups.get(weekKey) ?? {
      startDate,
      bySubject: new Map<Subject, number[]>(),
    };
    const subjectValues = current.bySubject.get(row.subject) ?? [];
    subjectValues.push(row.finalScore);
    current.bySubject.set(row.subject, subjectValues);
    weekGroups.set(weekKey, current);
  }

  const recentWeeksTrend = Array.from(weekGroups.entries())
    .sort((left, right) => left[1].startDate.getTime() - right[1].startDate.getTime())
    .slice(-4)
    .map(([, week]) => ({
      weekLabel: formatWeekShortLabel(week.startDate),
      weekStartDate: week.startDate.toISOString(),
      bySubject: subjectRowsForExamType(cumulative.student.examType, Array.from(week.bySubject.keys())).map((subject) => ({
        subject,
        avgScore: average(week.bySubject.get(subject) ?? []),
      })),
    }));

  const trendRows = cumulative.trend
    .filter((row) => row.finalScore !== null)
    .map((row) => ({
      examDate: new Date(row.date),
      value: row.finalScore as number,
    }));
  const sinceLastCounseling = latestCounseling
    ? {
        lastCounseledAt: latestCounseling.counseledAt.toISOString(),
        avgBefore: average(
          trendRows
            .filter((row) => row.examDate.getTime() < latestCounseling.counseledAt.getTime())
            .map((row) => row.value),
        ),
        avgAfter: average(
          trendRows
            .filter((row) => row.examDate.getTime() >= latestCounseling.counseledAt.getTime())
            .map((row) => row.value),
        ),
        change: null as number | null,
      }
    : null;

  if (sinceLastCounseling) {
    sinceLastCounseling.change =
      sinceLastCounseling.avgBefore !== null && sinceLastCounseling.avgAfter !== null
        ? roundTo(sinceLastCounseling.avgAfter - sinceLastCounseling.avgBefore)
        : null;
  }

  return {
    overallAverage: cumulative.overallAvg,
    overallRank,
    participationRate: cumulative.attendanceRate,
    absentCount: cumulative.trend.filter((row) => row.attendType === AttendType.ABSENT).length,
    currentStatus: cumulative.student.currentStatus,
    recentWeeksTrend,
    subjectProgress: cumulative.subjectStats.map((row) => ({
      subject: row.subject,
      currentAverage: row.avg,
      targetScore: row.target,
      gap: row.avg !== null && row.target !== null ? roundTo(row.avg - row.target) : null,
      trend: row.trend,
      isWeak: row.isWeak,
    })),
    sinceLastCounseling,
  };
}

export async function getStudentMonthlyBreakdown(input: {
  examNumber: string;
  periodId: number;
}): Promise<MonthlyBreakdownRow[]> {
  const prisma = getPrisma();
  const tomorrow = startOfTomorrow();

  const student = await prisma.student.findUnique({
    where: { examNumber: input.examNumber },
    select: { examNumber: true, examType: true },
  });

  if (!student) {
    return [];
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      periodId: input.periodId,
      examType: student.examType,
      isCancelled: false,
      examDate: { lt: tomorrow },
    },
    select: { id: true, examDate: true },
    orderBy: { examDate: "asc" },
  });

  if (sessions.length === 0) {
    return [];
  }

  const sessionIds = sessions.map((s) => s.id);

  const [scores, approvedAbsences] = await Promise.all([
    prisma.score.findMany({
      where: { sessionId: { in: sessionIds } },
      select: {
        examNumber: true,
        sessionId: true,
        rawScore: true,
        oxScore: true,
        finalScore: true,
        attendType: true,
      },
    }),
    prisma.absenceNote.findMany({
      where: {
        status: "APPROVED",
        sessionId: { in: sessionIds },
      },
      select: {
        examNumber: true,
        sessionId: true,
        attendCountsAsAttendance: true,
      },
    }),
  ]);

  return buildMonthlyBreakdown({
    examNumber: input.examNumber,
    sessions,
    scores,
    approvedAbsences,
  });
}