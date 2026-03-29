import { isMockMode } from "@/lib/mock-data";
import {
  readMockState,
  updateMockState,
  type MockMorningExamScoreRecord,
} from "@/lib/mock-store";
import { notFound } from "@/lib/errors";
import type { MorningExamScoresBatchInput } from "@/lib/morning-exam-schemas";
import { listExamTypes, type ExamSubjectItem, type ExamTypeItem } from "@/lib/services/exam.service";
import { listStudents } from "@/lib/services/student.service";

type ExamActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
};

export type MorningExamDailySheetRow = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  score: number | null;
  notes: string | null;
};

export type MorningExamDailySheet = {
  examTypeId: string;
  examTypeName: string;
  subjectId: string;
  subjectName: string;
  maxScore: number | null;
  date: string;
  rows: MorningExamDailySheetRow[];
};

export type MorningWeeklyRankingRow = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  dailyScores: Record<string, { subjectName: string; score: number | null }>;
  weeklyTotal: number | null;
  weeklyAverage: number | null;
  weeklyRank: number | null;
};

export type MorningExamWeeklySummary = {
  examTypeId: string;
  examTypeName: string;
  weekYear: number;
  weekNumber: number;
  weekDateRange: { start: string; end: string };
  totalSubjectCount: number;
  dailyEntries: Array<{
    date: string;
    dayOfWeek: string;
    subjectId: string;
    subjectName: string;
  }>;
  rankings: MorningWeeklyRankingRow[];
};

export type StudentMorningExamWeekItem = {
  examTypeId: string;
  examTypeName: string;
  weekYear: number;
  weekNumber: number;
  weekDateRange: { start: string; end: string };
  dailyScores: Array<{
    date: string;
    dayOfWeek: string;
    subjectId: string;
    subjectName: string;
    score: number | null;
  }>;
  weeklyTotal: number | null;
  weeklyAverage: number | null;
  weeklyRank: number | null;
};

export type MorningExamLatestSummary = {
  examTypeId: string;
  examTypeName: string;
  weekYear: number;
  weekNumber: number;
  weeklyTotal: number | null;
  weeklyAverage: number | null;
  weeklyRank: number | null;
  subjectsEntered: number;
  totalSubjects: number;
};

const DAY_OF_WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function getIsoWeekInfo(dateStr: string): { weekYear: number; weekNumber: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() - ((dayOfWeek + 6) % 7) + 3);
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7,
  );
  return { weekYear: thursday.getUTCFullYear(), weekNumber };
}

function getWeekDateRange(
  weekYear: number,
  weekNumber: number,
): { start: string; end: string } {
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const dayOfWeek = jan4.getUTCDay();
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((dayOfWeek + 6) % 7) + (weekNumber - 1) * 7);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  return {
    start: monday.toISOString().slice(0, 10),
    end: friday.toISOString().slice(0, 10),
  };
}

function getDayOfWeekLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return DAY_OF_WEEK_LABELS[date.getUTCDay()];
}

function toUtcDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function calculateSubjectMaxScore(
  subject: ExamSubjectItem,
): number | null {
  if (
    typeof subject.totalItems === "number" &&
    typeof subject.pointsPerItem === "number"
  ) {
    return subject.totalItems * subject.pointsPerItem;
  }
  return null;
}

function isStudentEligible(
  student: { studyTrack: string | null; status: string },
  studyTrack: string | null,
): boolean {
  const isActive = student.status === "ACTIVE" || student.status === "ON_LEAVE";
  if (!isActive) return false;
  if (!studyTrack) return true;
  return student.studyTrack === studyTrack;
}

function assignWeeklyRanks(
  rows: Array<{ weeklyTotal: number | null }>,
): Array<{ weeklyRank: number | null }> {
  const sorted = rows
    .map((row, index) => ({ index, total: row.weeklyTotal }))
    .filter((item) => item.total !== null)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  const rankMap = new Map<number, number>();
  sorted.forEach((item, sortedIndex) => {
    if (item.total !== null && !rankMap.has(item.total)) {
      rankMap.set(item.total, sortedIndex + 1);
    }
  });

  return rows.map((row) => ({
    weeklyRank:
      row.weeklyTotal === null ? null : rankMap.get(row.weeklyTotal) ?? null,
  }));
}

async function getDivisionOrThrow(divisionSlug: string) {
  const { prisma } = await import("@/lib/prisma");
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
  });
  if (!division) {
    throw notFound("지점 정보를 찾을 수 없습니다.");
  }
  return division;
}

async function getMorningExamType(
  divisionSlug: string,
  examTypeId: string,
): Promise<ExamTypeItem> {
  const examTypes = await listExamTypes(divisionSlug);
  const examType = examTypes.find(
    (item) => item.id === examTypeId && item.category === "MORNING",
  );
  if (!examType) {
    throw notFound("아침모의고사 시험 종류를 찾을 수 없습니다.");
  }
  return examType;
}

export async function getMorningExamDailySheet(
  divisionSlug: string,
  examTypeId: string,
  subjectId: string,
  date: string,
): Promise<MorningExamDailySheet> {
  const examType = await getMorningExamType(divisionSlug, examTypeId);
  const subject = examType.subjects.find(
    (s) => s.id === subjectId && s.isActive,
  );
  if (!subject) {
    throw notFound("과목을 찾을 수 없습니다.");
  }

  const students = await listStudents(divisionSlug);
  const eligibleStudents = students.filter((s) =>
    isStudentEligible(s, examType.studyTrack),
  );

  if (isMockMode()) {
    const state = await readMockState();
    const allScores = state.morningExamScoresByDivision[divisionSlug] ?? [];
    const dateScores = allScores.filter(
      (s) =>
        s.examTypeId === examTypeId &&
        s.subjectId === subjectId &&
        s.examDate === date,
    );
    const scoreMap = new Map(dateScores.map((s) => [s.studentId, s]));

    return {
      examTypeId,
      examTypeName: examType.name,
      subjectId,
      subjectName: subject.name,
      maxScore: calculateSubjectMaxScore(subject),
      date,
      rows: eligibleStudents.map((student) => {
        const record = scoreMap.get(student.id);
        return {
          studentId: student.id,
          studentName: student.name,
          studentNumber: student.studentNumber,
          score: record?.score ?? null,
          notes: record?.notes ?? null,
        };
      }),
    };
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const existingScores = await prisma.morningExamScore.findMany({
    where: {
      examTypeId,
      subjectId,
      examDate: toUtcDate(date),
      student: { divisionId: division.id },
    },
  });
  const scoreMap = new Map(existingScores.map((s) => [s.studentId, s]));

  return {
    examTypeId,
    examTypeName: examType.name,
    subjectId,
    subjectName: subject.name,
    maxScore: calculateSubjectMaxScore(subject),
    date,
    rows: eligibleStudents.map((student) => {
      const record = scoreMap.get(student.id);
      return {
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.studentNumber,
        score: record?.score ?? null,
        notes: record?.notes ?? null,
      };
    }),
  };
}

export async function saveMorningExamScores(
  divisionSlug: string,
  actor: ExamActor,
  input: MorningExamScoresBatchInput,
): Promise<{ savedCount: number }> {
  const examType = await getMorningExamType(divisionSlug, input.examTypeId);
  const subject = examType.subjects.find(
    (s) => s.id === input.subjectId && s.isActive,
  );
  if (!subject) {
    throw notFound("과목을 찾을 수 없습니다.");
  }

  const { weekYear, weekNumber } = getIsoWeekInfo(input.date);

  if (isMockMode()) {
    const savedCount = await updateMockState((state) => {
      const scores = state.morningExamScoresByDivision[divisionSlug] ?? [];
      const now = new Date().toISOString();
      let count = 0;

      for (const row of input.rows) {
        const existingIndex = scores.findIndex(
          (s) =>
            s.studentId === row.studentId &&
            s.examTypeId === input.examTypeId &&
            s.subjectId === input.subjectId &&
            s.examDate === input.date,
        );

        const record: MockMorningExamScoreRecord = {
          id:
            existingIndex >= 0
              ? scores[existingIndex].id
              : `mock-morning-score-${Date.now()}-${count}`,
          studentId: row.studentId,
          examTypeId: input.examTypeId,
          subjectId: input.subjectId,
          examDate: input.date,
          score: row.score,
          weekNumber,
          weekYear,
          notes: row.notes ?? null,
          recordedById: actor.id,
          createdAt:
            existingIndex >= 0 ? scores[existingIndex].createdAt : now,
          updatedAt: now,
        };

        if (existingIndex >= 0) {
          scores[existingIndex] = record;
        } else {
          scores.push(record);
        }
        count += 1;
      }

      state.morningExamScoresByDivision[divisionSlug] = scores;
      return count;
    });

    return { savedCount };
  }

  await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const examDate = toUtcDate(input.date);
  let savedCount = 0;

  for (const row of input.rows) {
    await prisma.morningExamScore.upsert({
      where: {
        studentId_examTypeId_subjectId_examDate: {
          studentId: row.studentId,
          examTypeId: input.examTypeId,
          subjectId: input.subjectId,
          examDate,
        },
      },
      create: {
        studentId: row.studentId,
        examTypeId: input.examTypeId,
        subjectId: input.subjectId,
        examDate,
        score: row.score,
        weekNumber,
        weekYear,
        notes: row.notes ?? null,
        recordedById: actor.id,
      },
      update: {
        score: row.score,
        notes: row.notes ?? null,
        recordedById: actor.id,
      },
    });
    savedCount += 1;
  }

  return { savedCount };
}

export async function getMorningExamWeeklySummary(
  divisionSlug: string,
  examTypeId: string,
  weekYear: number,
  weekNumber: number,
): Promise<MorningExamWeeklySummary> {
  const examType = await getMorningExamType(divisionSlug, examTypeId);
  const weekDateRange = getWeekDateRange(weekYear, weekNumber);
  const activeSubjects = examType.subjects.filter((s) => s.isActive);
  const totalSubjectCount = activeSubjects.length;

  const students = await listStudents(divisionSlug);
  const eligibleStudents = students.filter((s) =>
    isStudentEligible(s, examType.studyTrack),
  );

  let rawScores: Array<{
    studentId: string;
    subjectId: string;
    examDate: string;
    score: number | null;
  }>;

  if (isMockMode()) {
    const state = await readMockState();
    const allScores = state.morningExamScoresByDivision[divisionSlug] ?? [];
    rawScores = allScores
      .filter(
        (s) =>
          s.examTypeId === examTypeId &&
          s.weekYear === weekYear &&
          s.weekNumber === weekNumber,
      )
      .map((s) => ({
        studentId: s.studentId,
        subjectId: s.subjectId,
        examDate: s.examDate,
        score: s.score,
      }));
  } else {
    const { prisma } = await import("@/lib/prisma");
    const dbScores = await prisma.morningExamScore.findMany({
      where: {
        examTypeId,
        weekYear,
        weekNumber,
      },
    });
    rawScores = dbScores.map((s) => ({
      studentId: s.studentId,
      subjectId: s.subjectId,
      examDate:
        s.examDate instanceof Date
          ? s.examDate.toISOString().slice(0, 10)
          : String(s.examDate).slice(0, 10),
      score: s.score,
    }));
  }

  const dateSubjectMap = new Map<string, string>();
  for (const s of rawScores) {
    if (!dateSubjectMap.has(s.examDate)) {
      dateSubjectMap.set(s.examDate, s.subjectId);
    }
  }

  const subjectMap = new Map(activeSubjects.map((s) => [s.id, s]));
  const dailyEntries = Array.from(dateSubjectMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, subjectId]) => ({
      date,
      dayOfWeek: getDayOfWeekLabel(date),
      subjectId,
      subjectName: subjectMap.get(subjectId)?.name ?? "알 수 없는 과목",
    }));

  const testedSubjectCount = dailyEntries.length;

  const rankingRows: Array<
    Omit<MorningWeeklyRankingRow, "weeklyRank">
  > = eligibleStudents.map((student) => {
    const studentScores = rawScores.filter(
      (s) => s.studentId === student.id,
    );
    const dailyScores: Record<
      string,
      { subjectName: string; score: number | null }
    > = {};
    let total = 0;
    let hasAnyScore = false;

    for (const entry of dailyEntries) {
      const scoreRecord = studentScores.find(
        (s) => s.examDate === entry.date && s.subjectId === entry.subjectId,
      );
      const score = scoreRecord?.score ?? null;
      dailyScores[entry.date] = {
        subjectName: entry.subjectName,
        score,
      };
      if (score !== null) {
        total += score;
        hasAnyScore = true;
      }
    }

    const weeklyTotal = hasAnyScore ? total : null;
    const weeklyAverage =
      weeklyTotal !== null && testedSubjectCount > 0
        ? Math.round((weeklyTotal / testedSubjectCount) * 10) / 10
        : null;

    return {
      studentId: student.id,
      studentName: student.name,
      studentNumber: student.studentNumber,
      dailyScores,
      weeklyTotal,
      weeklyAverage,
    };
  });

  const ranks = assignWeeklyRanks(rankingRows);
  const rankings: MorningWeeklyRankingRow[] = rankingRows.map((row, idx) => ({
    ...row,
    weeklyRank: ranks[idx].weeklyRank,
  }));

  return {
    examTypeId,
    examTypeName: examType.name,
    weekYear,
    weekNumber,
    weekDateRange,
    totalSubjectCount,
    dailyEntries,
    rankings,
  };
}

export async function listStudentMorningExamWeeks(
  divisionSlug: string,
  studentId: string,
  examTypeId?: string,
): Promise<StudentMorningExamWeekItem[]> {
  const allExamTypes = await listExamTypes(divisionSlug);
  const morningTypes = allExamTypes.filter(
    (t) =>
      t.category === "MORNING" &&
      t.isActive &&
      (!examTypeId || t.id === examTypeId),
  );

  if (morningTypes.length === 0) return [];

  let rawScores: Array<{
    examTypeId: string;
    subjectId: string;
    examDate: string;
    score: number | null;
    weekYear: number;
    weekNumber: number;
  }>;

  if (isMockMode()) {
    const state = await readMockState();
    const allScores = state.morningExamScoresByDivision[divisionSlug] ?? [];
    rawScores = allScores
      .filter(
        (s) =>
          s.studentId === studentId &&
          morningTypes.some((t) => t.id === s.examTypeId),
      )
      .map((s) => ({
        examTypeId: s.examTypeId,
        subjectId: s.subjectId,
        examDate: s.examDate,
        score: s.score,
        weekYear: s.weekYear,
        weekNumber: s.weekNumber,
      }));
  } else {
    const { prisma } = await import("@/lib/prisma");
    const dbScores = await prisma.morningExamScore.findMany({
      where: {
        studentId,
        examTypeId: { in: morningTypes.map((t) => t.id) },
      },
      orderBy: [{ weekYear: "desc" }, { weekNumber: "desc" }, { examDate: "desc" }],
    });
    rawScores = dbScores.map((s) => ({
      examTypeId: s.examTypeId,
      subjectId: s.subjectId,
      examDate:
        s.examDate instanceof Date
          ? s.examDate.toISOString().slice(0, 10)
          : String(s.examDate).slice(0, 10),
      score: s.score,
      weekYear: s.weekYear,
      weekNumber: s.weekNumber,
    }));
  }

  const weekGroups = new Map<
    string,
    Array<(typeof rawScores)[number]>
  >();
  for (const score of rawScores) {
    const key = `${score.examTypeId}|${score.weekYear}|${score.weekNumber}`;
    const group = weekGroups.get(key) ?? [];
    group.push(score);
    weekGroups.set(key, group);
  }

  const results: StudentMorningExamWeekItem[] = [];

  for (const [key, scores] of Array.from(weekGroups.entries())) {
    const [etId, wyStr, wnStr] = key.split("|");
    const weekYear = Number(wyStr);
    const weekNumber = Number(wnStr);
    const examTypeItem = morningTypes.find((t) => t.id === etId);
    if (!examTypeItem) continue;

    const weekDateRange = getWeekDateRange(weekYear, weekNumber);
    const subjectMap = new Map(
      examTypeItem.subjects.map((s) => [s.id, s]),
    );

    const dailyScores = scores
      .sort((a, b) => a.examDate.localeCompare(b.examDate))
      .map((s) => ({
        date: s.examDate,
        dayOfWeek: getDayOfWeekLabel(s.examDate),
        subjectId: s.subjectId,
        subjectName: subjectMap.get(s.subjectId)?.name ?? "알 수 없는 과목",
        score: s.score,
      }));

    let total = 0;
    let hasAnyScore = false;
    for (const ds of dailyScores) {
      if (ds.score !== null) {
        total += ds.score;
        hasAnyScore = true;
      }
    }

    const testedSubjectCount = dailyScores.length;
    const weeklyTotal = hasAnyScore ? total : null;
    const weeklyAverage =
      weeklyTotal !== null && testedSubjectCount > 0
        ? Math.round((weeklyTotal / testedSubjectCount) * 10) / 10
        : null;

    const summary = await getMorningExamWeeklySummary(
      divisionSlug,
      etId,
      weekYear,
      weekNumber,
    );
    const myRanking = summary.rankings.find(
      (r) => r.studentId === studentId,
    );

    results.push({
      examTypeId: etId,
      examTypeName: examTypeItem.name,
      weekYear,
      weekNumber,
      weekDateRange,
      dailyScores,
      weeklyTotal,
      weeklyAverage,
      weeklyRank: myRanking?.weeklyRank ?? null,
    });
  }

  results.sort((a, b) => {
    if (a.weekYear !== b.weekYear) return b.weekYear - a.weekYear;
    return b.weekNumber - a.weekNumber;
  });

  return results;
}

export async function getStudentMorningExamLatest(
  divisionSlug: string,
  studentId: string,
): Promise<MorningExamLatestSummary | null> {
  const weeks = await listStudentMorningExamWeeks(divisionSlug, studentId);
  if (weeks.length === 0) return null;

  const latest = weeks[0];
  const allExamTypes = await listExamTypes(divisionSlug);
  const examType = allExamTypes.find((t) => t.id === latest.examTypeId);
  const totalSubjects = examType?.subjects.filter((s) => s.isActive).length ?? 0;

  return {
    examTypeId: latest.examTypeId,
    examTypeName: latest.examTypeName,
    weekYear: latest.weekYear,
    weekNumber: latest.weekNumber,
    weeklyTotal: latest.weeklyTotal,
    weeklyAverage: latest.weeklyAverage,
    weeklyRank: latest.weeklyRank,
    subjectsEntered: latest.dailyScores.length,
    totalSubjects,
  };
}

export { getIsoWeekInfo, getWeekDateRange, getDayOfWeekLabel };
