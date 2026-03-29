import { AttendType, ExamType, StudentStatus, Subject } from "@prisma/client";
import { EXAM_TYPE_SUBJECTS } from "@/lib/constants";
import { loadDataset } from "@/lib/analytics/data";
import { formatTuesdayWeekLabel, getTuesdayWeekKey } from "@/lib/analytics/week";
import { buildAggregates } from "@/lib/analytics/service";
import { isPlaceholderStudentRecord } from "@/lib/students/placeholder";
import { isPoliceOxOnlySession } from "@/lib/exam-session-rules";

type Aggregate = ReturnType<typeof buildAggregates>[number];

type CohortGroup = {
  key: string;
  generation: number | null;
  label: string;
  aggregates: Aggregate[];
};

export type GenerationCohortSummaryRow = {
  key: string;
  generation: number | null;
  label: string;
  studentCount: number;
  activeStudentCount: number;
  averageScore: number | null;
  attendanceRate: number;
  dropoutRate: number;
  dropoutCount: number;
  warningCount: number;
  strongSubject: Subject | null;
  strongSubjectAverage: number | null;
  weakSubject: Subject | null;
  weakSubjectAverage: number | null;
};

export type GenerationCohortTrendRow = {
  weekKey: string;
  weekLabel: string;
  values: Array<{
    key: string;
    label: string;
    averageScore: number | null;
    scoredCount: number;
  }>;
};

export type GenerationCohortHeatmapData = {
  subjects: Array<{
    subject: Subject;
    sessionCount: number;
  }>;
  rows: Array<{
    key: string;
    generation: number | null;
    label: string;
    studentCount: number;
    cells: Array<{
      subject: Subject;
      averageScore: number | null;
      scoredCount: number;
      sessionCount: number;
    }>;
  }>;
};

export type GenerationCohortAnalysisData = {
  periodId: number;
  periodName: string;
  examType: ExamType;
  studentCount: number;
  activeStudentCount: number;
  cohortCount: number;
  sessionCount: number;
  overallAverageScore: number | null;
  overallAttendanceRate: number;
  overallDropoutRate: number;
  summaryRows: GenerationCohortSummaryRow[];
  trendRows: GenerationCohortTrendRow[];
  heatmap: GenerationCohortHeatmapData;
};

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function roundTo(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function cohortKey(generation: number | null) {
  return generation === null ? "generation-unassigned" : `generation-${generation}`;
}

function cohortLabel(generation: number | null) {
  return generation === null ? "미지정" : `${generation}기`;
}

function sortGeneration(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
}

function groupByGeneration(aggregates: Aggregate[]) {
  const grouped = new Map<string, CohortGroup>();

  for (const aggregate of aggregates) {
    const generation = aggregate.student.generation ?? null;
    const key = cohortKey(generation);
    const existing = grouped.get(key) ?? {
      key,
      generation,
      label: cohortLabel(generation),
      aggregates: [],
    };

    existing.aggregates.push(aggregate);
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).sort(
    (left, right) =>
      sortGeneration(left.generation, right.generation) ||
      left.label.localeCompare(right.label, "ko-KR"),
  );
}

function buildSubjectOrder(examType: ExamType, subjects: Subject[]) {
  const preferred = EXAM_TYPE_SUBJECTS[examType];
  const ordered = new Set<Subject>(preferred);

  for (const subject of subjects) {
    ordered.add(subject);
  }

  return Array.from(ordered);
}

function relevantEntries(aggregate: Aggregate, sessionIdSet: Set<number>) {
  return aggregate.entries.filter((entry) => sessionIdSet.has(entry.session.id));
}

function normalScoredEntries(entries: Aggregate["entries"]) {
  return entries.filter(
    (entry) => entry.attendType === AttendType.NORMAL && entry.normalizedScore !== null,
  );
}

function buildHeatmapData(
  groups: CohortGroup[],
  subjects: Subject[],
  sessionIdSet: Set<number>,
  sessionCountBySubject: Map<Subject, number>,
): GenerationCohortHeatmapData {
  return {
    subjects: subjects.map((subject) => ({
      subject,
      sessionCount: sessionCountBySubject.get(subject) ?? 0,
    })),
    rows: groups.map((group) => ({
      key: group.key,
      generation: group.generation,
      label: group.label,
      studentCount: group.aggregates.length,
      cells: subjects.map((subject) => {
        const values = group.aggregates.flatMap((aggregate) =>
          normalScoredEntries(relevantEntries(aggregate, sessionIdSet))
            .filter((entry) => entry.session.subject === subject)
            .map((entry) => entry.normalizedScore as number),
        );

        return {
          subject,
          averageScore: average(values),
          scoredCount: values.length,
          sessionCount: sessionCountBySubject.get(subject) ?? 0,
        };
      }),
    })),
  };
}

function buildSummaryRow(
  group: CohortGroup,
  subjects: Subject[],
  sessionIdSet: Set<number>,
  totalSessionCount: number,
): GenerationCohortSummaryRow {
  const scoredEntries = group.aggregates.flatMap((aggregate) =>
    normalScoredEntries(relevantEntries(aggregate, sessionIdSet)),
  );
  const scoreValues = scoredEntries.map((entry) => entry.normalizedScore as number);
  const attendanceCount = group.aggregates.reduce(
    (sum, aggregate) =>
      sum + relevantEntries(aggregate, sessionIdSet).filter((entry) => entry.countsAsAttendance).length,
    0,
  );
  const subjectAverages = subjects
    .map((subject) => {
      const values = scoredEntries
        .filter((entry) => entry.session.subject === subject)
        .map((entry) => entry.normalizedScore as number);

      return {
        subject,
        averageScore: average(values),
      };
    })
    .filter((row) => row.averageScore !== null) as Array<{
      subject: Subject;
      averageScore: number;
    }>;
  const strongSubject =
    subjectAverages.length > 0
      ? [...subjectAverages].sort((left, right) => right.averageScore - left.averageScore)[0] ?? null
      : null;
  const weakSubject =
    subjectAverages.length > 0
      ? [...subjectAverages].sort((left, right) => left.averageScore - right.averageScore)[0] ?? null
      : null;
  const dropoutCount = group.aggregates.filter(
    (aggregate) => aggregate.overallStatus === StudentStatus.DROPOUT,
  ).length;
  const warningCount = group.aggregates.filter(
    (aggregate) =>
      aggregate.overallStatus === StudentStatus.WARNING_1 ||
      aggregate.overallStatus === StudentStatus.WARNING_2,
  ).length;
  const possibleAttendanceCount = totalSessionCount * group.aggregates.length;

  return {
    key: group.key,
    generation: group.generation,
    label: group.label,
    studentCount: group.aggregates.length,
    activeStudentCount: group.aggregates.filter((aggregate) => aggregate.student.isActive).length,
    averageScore: average(scoreValues),
    attendanceRate:
      possibleAttendanceCount === 0
        ? 0
        : roundTo((attendanceCount / possibleAttendanceCount) * 100),
    dropoutRate:
      group.aggregates.length === 0
        ? 0
        : roundTo((dropoutCount / group.aggregates.length) * 100),
    dropoutCount,
    warningCount,
    strongSubject: strongSubject?.subject ?? null,
    strongSubjectAverage: strongSubject?.averageScore ?? null,
    weakSubject: weakSubject?.subject ?? null,
    weakSubjectAverage: weakSubject?.averageScore ?? null,
  };
}

export async function getGenerationCohortAnalysis(input: {
  periodId: number;
  examType: ExamType;
}): Promise<GenerationCohortAnalysisData> {
  const dataset = await loadDataset(input.periodId, input.examType);
  const students = dataset.students.filter(
    (student) => !isPlaceholderStudentRecord(student),
  );
  const allowedExamNumbers = new Set(students.map((student) => student.examNumber));
  const filteredDataset = {
    ...dataset,
    students,
    scores: dataset.scores.filter((score) => allowedExamNumbers.has(score.examNumber)),
    absenceNotes: dataset.absenceNotes.filter((note) => allowedExamNumbers.has(note.examNumber)),
    pointLogs: dataset.pointLogs.filter((log) => allowedExamNumbers.has(log.examNumber)),
  };
  const aggregates = buildAggregates(filteredDataset);
  const referenceEntries = (aggregates[0]?.entries ?? []).filter(
    (entry) =>
      entry.isOccurred &&
      !entry.isPendingInput &&
      !entry.session.isCancelled &&
      !isPoliceOxOnlySession(entry.session, filteredDataset.sessions),
  );
  const countedSessions = referenceEntries.map((entry) => entry.session);
  const sessionIdSet = new Set(countedSessions.map((session) => session.id));
  const subjects = buildSubjectOrder(
    input.examType,
    countedSessions.map((session) => session.subject),
  );
  const groups = groupByGeneration(aggregates);
  const sessionCountBySubject = new Map<Subject, number>();

  for (const session of countedSessions) {
    sessionCountBySubject.set(
      session.subject,
      (sessionCountBySubject.get(session.subject) ?? 0) + 1,
    );
  }

  const summaryRows = groups.map((group) =>
    buildSummaryRow(group, subjects, sessionIdSet, countedSessions.length),
  );
  const trendWeeks = Array.from(
    new Map(
      countedSessions.map((session) => {
        const weekKey = getTuesdayWeekKey(session.examDate);
        return [weekKey, { weekKey, weekLabel: formatTuesdayWeekLabel(weekKey) }];
      }),
    ).values(),
  );
  const trendRows = trendWeeks.map((week) => ({
    weekKey: week.weekKey,
    weekLabel: week.weekLabel,
    values: groups.map((group) => {
      const values = group.aggregates.flatMap((aggregate) =>
        normalScoredEntries(relevantEntries(aggregate, sessionIdSet))
          .filter((entry) => getTuesdayWeekKey(entry.session.examDate) === week.weekKey)
          .map((entry) => entry.normalizedScore as number),
      );

      return {
        key: group.key,
        label: group.label,
        averageScore: average(values),
        scoredCount: values.length,
      };
    }),
  }));
  const overallScoreValues = aggregates.flatMap((aggregate) =>
    normalScoredEntries(relevantEntries(aggregate, sessionIdSet)).map(
      (entry) => entry.normalizedScore as number,
    ),
  );
  const overallAttendanceCount = aggregates.reduce(
    (sum, aggregate) =>
      sum + relevantEntries(aggregate, sessionIdSet).filter((entry) => entry.countsAsAttendance).length,
    0,
  );
  const totalPossibleAttendanceCount = countedSessions.length * aggregates.length;
  const totalDropoutCount = summaryRows.reduce((sum, row) => sum + row.dropoutCount, 0);

  return {
    periodId: filteredDataset.period.id,
    periodName: filteredDataset.period.name,
    examType: input.examType,
    studentCount: aggregates.length,
    activeStudentCount: aggregates.filter((aggregate) => aggregate.student.isActive).length,
    cohortCount: summaryRows.length,
    sessionCount: countedSessions.length,
    overallAverageScore: average(overallScoreValues),
    overallAttendanceRate:
      totalPossibleAttendanceCount === 0
        ? 0
        : roundTo((overallAttendanceCount / totalPossibleAttendanceCount) * 100),
    overallDropoutRate:
      aggregates.length === 0 ? 0 : roundTo((totalDropoutCount / aggregates.length) * 100),
    summaryRows,
    trendRows,
    heatmap: buildHeatmapData(groups, subjects, sessionIdSet, sessionCountBySubject),
  };
}
