import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ExamType, ScoreSource, StudentStatus, Subject } from "@prisma/client";
import { getStudentComparisonAnalysis, getStudentCumulativeAnalysis } from "../src/lib/analytics/analysis";
import { getGenerationCohortAnalysis } from "../src/lib/analytics/cohort-analysis";
import { getScoreDistributionSummary } from "../src/lib/scores/distribution";
import { NON_PLACEHOLDER_STUDENT_FILTER } from "../src/lib/students/placeholder";
import { getSubjectDisplayLabel } from "../src/lib/constants";
import { buildSessionDisplayColumns } from "../src/lib/exam-session-rules";
import { getDropoutMonitor, getWeeklyStatusHistory } from "../src/lib/analytics/service";
import { getPrisma } from "../src/lib/prisma";

function loadEnvFile(filePath: string) {
  try {
    const raw = readFileSync(filePath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env files.
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

function testDisplaySubjectNameColumns() {
  const examDate = new Date("2026-03-13T00:00:00.000Z");
  const columns = buildSessionDisplayColumns([
    {
      id: 10,
      periodId: 3,
      examType: ExamType.GONGCHAE,
      subject: Subject.CRIMINAL_LAW,
      displaySubjectName: "형법 보정명",
      examDate,
    },
    {
      id: 11,
      periodId: 3,
      examType: ExamType.GONGCHAE,
      subject: Subject.POLICE_SCIENCE,
      displaySubjectName: null,
      examDate,
    },
  ]);

  assert.equal(columns.length, 1);
  assert.equal(columns[0]?.subject, Subject.CRIMINAL_LAW);
  assert.equal(columns[0]?.displaySubjectName, "형법 보정명");
  assert.equal(
    getSubjectDisplayLabel(columns[0].subject, columns[0].displaySubjectName),
    "형법 보정명",
  );
}

async function main() {
  testDisplaySubjectNameColumns();
  loadLocalEnv();
  const prisma = getPrisma();

  const periodTargets = await prisma.examSession.findMany({
    select: {
      periodId: true,
      examType: true,
      period: {
        select: {
          name: true,
        },
      },
    },
    distinct: ["periodId", "examType"],
    orderBy: [{ periodId: "asc" }, { examType: "asc" }],
  });

  const monitorSummaries = [];
  for (const target of periodTargets) {
    const monitor = await getDropoutMonitor(target.periodId, target.examType);
    monitorSummaries.push({
      periodId: target.periodId,
      periodName: target.period.name,
      examType: target.examType,
      total: monitor.rows.length,
      dropout: monitor.rows.filter((row) => row.status === StudentStatus.DROPOUT).length,
      warning2: monitor.rows.filter((row) => row.status === StudentStatus.WARNING_2).length,
      warning1: monitor.rows.filter((row) => row.status === StudentStatus.WARNING_1).length,
    });
  }

  const sampleSnapshot = await prisma.weeklyStatusSnapshot.findFirst({
    where: {
      status: {
        in: [StudentStatus.DROPOUT, StudentStatus.WARNING_2, StudentStatus.WARNING_1],
      },
    },
    orderBy: [{ weekStartDate: "desc" }, { examNumber: "asc" }],
  });

  const weeklyHistory =
    sampleSnapshot
      ? await getWeeklyStatusHistory(
          sampleSnapshot.periodId,
          sampleSnapshot.examType,
          sampleSnapshot.weekKey,
        )
      : null;

  const sampleStudent =
    sampleSnapshot?.examNumber ??
    (
      await prisma.student.findFirst({
        where: {
          scores: {
            some: {},
          },
        },
        orderBy: { examNumber: "asc" },
        select: { examNumber: true },
      })
    )?.examNumber ??
    null;

  const cumulative = sampleStudent
    ? await getStudentCumulativeAnalysis(sampleStudent)
    : null;

  const comparisonCandidates = await prisma.student.findMany({
    where: {
      scores: {
        some: {},
      },
    },
    select: {
      examNumber: true,
      examType: true,
    },
    orderBy: [{ examType: "asc" }, { examNumber: "asc" }],
    take: 20,
  });
  let comparisonPair: { examNumberA: string; examNumberB: string } | null = null;

  for (let index = 0; index < comparisonCandidates.length; index += 1) {
    const left = comparisonCandidates[index];
    const right = comparisonCandidates
      .slice(index + 1)
      .find((candidate) => candidate.examType === left?.examType);

    if (left && right) {
      comparisonPair = {
        examNumberA: left.examNumber,
        examNumberB: right.examNumber,
      };
      break;
    }
  }

  const comparison = comparisonPair
    ? await getStudentComparisonAnalysis({
        ...comparisonPair,
        recent: 5,
      })
    : null;

  if (comparison) {
    assert.equal(comparison.kind, "ok");
  }

  const cohortAnalysis = periodTargets[0]
    ? await getGenerationCohortAnalysis({
        periodId: periodTargets[0].periodId,
        examType: periodTargets[0].examType,
      })
    : null;

  if (cohortAnalysis && cohortAnalysis.summaryRows.length > 0) {
    assert.ok(cohortAnalysis.summaryRows.every((row) => row.studentCount > 0));
  }

  const sampleDistributionSession = await prisma.score.findFirst({
    where: {
      attendType: "NORMAL",
      finalScore: {
        not: null,
      },
      student: NON_PLACEHOLDER_STUDENT_FILTER,
      session: {
        isCancelled: false,
      },
    },
    select: {
      sessionId: true,
    },
    orderBy: [{ sessionId: "desc" }],
  });

  const scoreDistribution = sampleDistributionSession
    ? await getScoreDistributionSummary(sampleDistributionSession.sessionId)
    : null;

  if (scoreDistribution) {
    assert.ok(scoreDistribution.totalCount >= 1);
    assert.ok(scoreDistribution.distribution.length >= 1);
    assert.equal(
      scoreDistribution.distribution.reduce((sum, bucket) => sum + bucket.count, 0),
      scoreDistribution.totalCount,
    );

    const rawDistributionRows = await prisma.score.findMany({
      where: {
        sessionId: scoreDistribution.sessionId,
        attendType: "NORMAL",
        student: NON_PLACEHOLDER_STUDENT_FILTER,
      },
      select: {
        finalScore: true,
      },
    });

    const rawValues = rawDistributionRows
      .map((row) => row.finalScore)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    const expectedMean = rawValues.reduce((sum, value) => sum + value, 0) / rawValues.length;
    const expectedStdDev =
      rawValues.length < 2
        ? null
        : Math.round(
            Math.sqrt(
              rawValues.reduce((sum, value) => sum + (value - expectedMean) ** 2, 0) /
                (rawValues.length - 1),
            ) * 10,
          ) / 10;

    assert.equal(scoreDistribution.avgScore, Math.round(expectedMean * 10) / 10);
    assert.equal(scoreDistribution.stdDev, expectedStdDev);

    const expectedBuckets = scoreDistribution.distribution.map((bucket) => ({
      range: bucket.range,
      count: 0,
    }));

    for (const value of rawValues) {
      const index = Math.min(Math.floor(Math.max(0, value) / 10), expectedBuckets.length - 1);
      const bucket = expectedBuckets[index];
      if (bucket) {
        bucket.count += 1;
      }
    }

    assert.deepEqual(scoreDistribution.distribution, expectedBuckets);
  }

  const cancelledDistributionSession = await prisma.examSession.findFirst({
    where: {
      isCancelled: true,
    },
    select: {
      id: true,
    },
  });

  if (cancelledDistributionSession) {
    await assert.rejects(() => getScoreDistributionSummary(cancelledDistributionSession.id));
  }

  await assert.rejects(() => getScoreDistributionSummary(-1));
  const migrationOxSummary = await prisma.score.aggregate({
    where: {
      sourceType: ScoreSource.MIGRATION,
      oxScore: {
        not: null,
      },
    },
    _count: {
      _all: true,
    },
  });

  const migrationOxSamples = await prisma.score.findMany({
    where: {
      sourceType: ScoreSource.MIGRATION,
      oxScore: {
        not: null,
      },
    },
    select: {
      examNumber: true,
      rawScore: true,
      oxScore: true,
      finalScore: true,
      session: {
        select: {
          subject: true,
          examDate: true,
        },
      },
    },
    orderBy: [{ session: { examDate: "desc" } }, { examNumber: "asc" }],
    take: 5,
  });

  console.log(
    JSON.stringify(
      {
        monitorSummaries,
        sampleWeeklyHistory: weeklyHistory
          ? {
              periodId: sampleSnapshot?.periodId ?? null,
              examType: sampleSnapshot?.examType ?? null,
              weekKey: sampleSnapshot?.weekKey ?? null,
              weekLabel: weeklyHistory.week.label,
              rowCount: weeklyHistory.rows.length,
              topRows: weeklyHistory.rows.slice(0, 5).map((row) => ({
                examNumber: row.examNumber,
                status: row.status,
                weekAbsenceCount: row.weekAbsenceCount,
                monthAbsenceCount: row.monthAbsenceCount,
                recoveryDate: row.recoveryDate?.toISOString() ?? null,
                dropoutReason: row.dropoutReason,
              })),
            }
          : null,
        sampleCumulative: cumulative
          ? {
              examNumber: cumulative.student.examNumber,
              totalSessions: cumulative.totalSessions,
              attendedCount: cumulative.attendedCount,
              attendanceRate: cumulative.attendanceRate,
              periodCount: cumulative.periods.length,
              statusHistoryCount: cumulative.statusHistory.length,
              weakSubjects: cumulative.weakSubjects,
              firstTrendRows: cumulative.trend.slice(0, 5).map((row) => ({
                label: row.label,
                subject: row.subject,
                finalScore: row.finalScore,
                periodName: row.periodName,
              })),
            }
          : null,
        sampleComparison:
          comparison && comparison.kind === "ok"
            ? {
                studentA: comparison.data.studentA.student.examNumber,
                studentB: comparison.data.studentB.student.examNumber,
                selectedPeriod: comparison.data.selectedPeriod?.name ?? null,
                recentCount: comparison.data.recentCount,
                subjectRowCount: comparison.data.subjectRows.length,
                firstSubjectRows: comparison.data.subjectRows.slice(0, 3).map((row) => ({
                  subject: row.subject,
                  studentAAverage: row.studentAAverage,
                  studentBAverage: row.studentBAverage,
                  averageDelta: row.averageDelta,
                })),
              }
            : null,
        sampleCohort:
          cohortAnalysis
            ? {
                periodId: cohortAnalysis.periodId,
                periodName: cohortAnalysis.periodName,
                cohortCount: cohortAnalysis.cohortCount,
                studentCount: cohortAnalysis.studentCount,
                sessionCount: cohortAnalysis.sessionCount,
                firstRows: cohortAnalysis.summaryRows.slice(0, 3).map((row) => ({
                  label: row.label,
                  studentCount: row.studentCount,
                  averageScore: row.averageScore,
                  attendanceRate: row.attendanceRate,
                  dropoutRate: row.dropoutRate,
                })),
              }
            : null,
        sampleScoreDistribution:
          scoreDistribution
            ? {
                sessionId: scoreDistribution.sessionId,
                totalCount: scoreDistribution.totalCount,
                avgScore: scoreDistribution.avgScore,
                top10Threshold: scoreDistribution.top10Threshold,
                firstBins: scoreDistribution.distribution.slice(0, 5),
              }
            : null,
        migrationOxSummary: {
          totalRowsWithOx: migrationOxSummary._count._all,
          samples: migrationOxSamples.map((row) => ({
            examNumber: row.examNumber,
            subject: row.session.subject,
            examDate: row.session.examDate.toISOString(),
            rawScore: row.rawScore,
            oxScore: row.oxScore,
            finalScore: row.finalScore,
          })),
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPrisma().$disconnect();
  } catch {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});
