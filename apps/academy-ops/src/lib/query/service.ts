import {
  AttendType,
  ExamType,
  Subject,
} from "@prisma/client";
import { sanitizeAbsenceNoteDisplay } from "@/lib/absence-notes/system-note";
import { getPrisma } from "@/lib/prisma";
import { NON_PLACEHOLDER_STUDENT_FILTER } from "@/lib/students/placeholder";
import { getScoredMockScore } from "@/lib/scores/calculation";

export type QueryMode = "date" | "subject" | "student";

export type QueryFilters = {
  mode: QueryMode;
  periodId?: number;
  examType?: ExamType;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  subject?: Subject;
  keyword?: string;
};

function parseDateInput(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDateRange(filters: Pick<QueryFilters, "date" | "dateFrom" | "dateTo">) {
  const legacyDate = filters.date?.trim();
  const parsedFrom = parseDateInput(filters.dateFrom?.trim() || legacyDate);
  const parsedTo = parseDateInput(filters.dateTo?.trim() || legacyDate);
  const startCandidate = parsedFrom ?? parsedTo;
  const endCandidate = parsedTo ?? parsedFrom;

  if (!startCandidate || !endCandidate) {
    return null;
  }

  const start =
    startCandidate.getTime() <= endCandidate.getTime() ? startCandidate : endCandidate;
  const endBase =
    startCandidate.getTime() <= endCandidate.getTime() ? endCandidate : startCandidate;
  const end = new Date(endBase);
  end.setDate(end.getDate() + 1);

  return {
    start,
    end,
  };
}

function scoreValue(score: {
  oxScore?: number | null;
  finalScore: number | null;
  rawScore: number | null;
  attendType: AttendType;
}) {
  return getScoredMockScore(score);
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export async function getDateQueryRows(filters: QueryFilters) {
  const range = buildDateRange(filters);

  if (!range) {
    return [];
  }

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId: filters.periodId,
      examType: filters.examType,
      examDate: {
        gte: range.start,
        lt: range.end,
      },
    },
    include: {
      period: true,
      scores: {
        include: {
          student: {
            select: {
              name: true,
              currentStatus: true,
            },
          },
        },
        orderBy: {
          examNumber: "asc",
        },
      },
    },
    orderBy: [{ examDate: "asc" }, { subject: "asc" }],
  });

  return sessions.flatMap((session) =>
    session.scores.map((score) => ({
      sessionId: session.id,
      periodName: session.period.name,
      examDate: session.examDate,
      examType: session.examType,
      subject: session.subject,
      week: session.week,
      examNumber: score.examNumber,
      studentName: score.student.name,
      attendType: score.attendType,
      rawScore: score.rawScore,
      finalScore: score.finalScore,
      currentStatus: score.student.currentStatus,
    })),
  );
}

export async function getSubjectTrendRows(filters: QueryFilters) {
  if (!filters.subject) {
    return [];
  }

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId: filters.periodId,
      examType: filters.examType,
      subject: filters.subject,
      examDate: {
        lt: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1),
      },
    },
    include: {
      scores: true,
    },
    orderBy: {
      examDate: "asc",
    },
  });

  return sessions.map((session) => {
    const normalScores = session.scores
      .filter((score) => score.attendType === AttendType.NORMAL)
      .map(scoreValue)
      .filter((value): value is number => value !== null);
    const liveCount = session.scores.filter((score) => score.attendType === AttendType.LIVE).length;
    const absentCount = session.scores.filter(
      (score) => score.attendType === AttendType.ABSENT,
    ).length;
    const excusedCount = session.scores.filter(
      (score) => score.attendType === AttendType.EXCUSED,
    ).length;

    return {
      sessionId: session.id,
      examDate: session.examDate,
      examType: session.examType,
      week: session.week,
      subject: session.subject,
      averageScore: average(normalScores),
      highestScore: normalScores.length > 0 ? Math.max(...normalScores) : null,
      lowestScore: normalScores.length > 0 ? Math.min(...normalScores) : null,
      normalCount: normalScores.length,
      liveCount,
      absentCount,
      excusedCount,
    };
  });
}

export async function getStudentHistoryRows(filters: QueryFilters) {
  const keyword = filters.keyword?.trim();

  if (!keyword) {
    return [];
  }

  const students = await getPrisma().student.findMany({
    where: {
      AND: [
        NON_PLACEHOLDER_STUDENT_FILTER,
        {
          examType: filters.examType,
          OR: [
            {
              examNumber: {
                contains: keyword,
              },
            },
            {
              name: {
                contains: keyword,
              },
            },
          ],
        },
      ],
    },
    include: {
      scores: {
        where: {
          session: {
            periodId: filters.periodId,
          },
        },
        include: {
          session: {
            include: {
              period: true,
            },
          },
        },
        orderBy: {
          session: {
            examDate: "desc",
          },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { examNumber: "asc" }],
    take: 30,
  });

  return students.map((student) => ({
    examNumber: student.examNumber,
    name: student.name,
    phone: student.phone,
    examType: student.examType,
    currentStatus: student.currentStatus,
    isActive: student.isActive,
    scores: student.scores.map((score) => ({
      scoreId: score.id,
      periodName: score.session.period.name,
      examDate: score.session.examDate,
      week: score.session.week,
      subject: score.session.subject,
      attendType: score.attendType,
      rawScore: score.rawScore,
      finalScore: score.finalScore,
      sourceType: score.sourceType,
      note: sanitizeAbsenceNoteDisplay(score.note),
    })),
  }));
}

export async function runQuery(filters: QueryFilters) {
  switch (filters.mode) {
    case "date":
      return {
        mode: filters.mode,
        rows: await getDateQueryRows(filters),
      };
    case "subject":
      return {
        mode: filters.mode,
        rows: await getSubjectTrendRows(filters),
      };
    case "student":
      return {
        mode: filters.mode,
        rows: await getStudentHistoryRows(filters),
      };
    default:
      return {
        mode: filters.mode,
        rows: [],
      };
  }
}
