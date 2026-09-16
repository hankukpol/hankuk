import {
  loadAnalysisSource,
  loadLegacyAnalysisScores,
  loadAnalysisCounseling,
} from "./source";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import type { Viewer } from "@/lib/exam-analysis-types";
import {
  authorizeRegularViewer,
  regularHistoryRange,
} from "@/lib/exam-analysis-assembler";
import {
  getRegularCohortAnalysis,
  getRegularStudentReport,
} from "@/lib/services/exam-analysis.service";
import {
  getMorningCohortAnalysis,
  getMorningStudentReport,
} from "@/lib/services/morning-exam-analysis.service";
import { getExamAnalysisSettings } from "@/lib/services/settings.service";
import {
  defaultMorningAnalysisRange,
  morningAnalysisRangeSchema,
} from "@/lib/morning-exam-analysis-schemas";
import { enrichSessions, ymd } from "./metrics";
import type { PreviewData } from "./types";
import { totalHistory } from "./total-history";

export async function getExamPreview(
  slug: string,
  kind: "regular" | "morning",
  query: {
    examTypeId: string;
    examDate?: string;
    from?: string;
    to?: string;
    studentId?: string;
  },
  viewer: Viewer,
): Promise<PreviewData> {
  if (
    viewer.role === "ASSISTANT" ||
    (!query.studentId && viewer.role === "STUDENT")
  )
    throw forbidden("관리자만 전체 성적을 조회할 수 있습니다.");
  if (query.studentId) authorizeRegularViewer(query.studentId, viewer);
  const source = await loadAnalysisSource(slug);
  const { divisionId, examTypes, students } = source;
  const legacy = await loadLegacyAnalysisScores(
    slug,
    divisionId,
    query.studentId,
  );
  const type = examTypes.find(
    (t) =>
      t.id === query.examTypeId &&
      t.category === (kind === "regular" ? "REGULAR" : "MORNING"),
  );
  if (!type) throw notFound("시험 종류를 찾을 수 없습니다.");
  const student = query.studentId
    ? students.find((s) => s.id === query.studentId)
    : null;
  if (query.studentId && !student) throw notFound("학생을 찾을 수 없습니다.");
  const sessions = source.sessions.filter(
    (s) =>
      s.divisionId === divisionId &&
      s.examTypeId === type.id &&
      (kind === "regular"
        ? s.primarySubjectId === null
        : s.primarySubjectId !== null),
  );
  const recordDates = (kind === "regular" ? legacy.regular : legacy.morning)
    .filter((r) => r.examTypeId === type.id)
    .map((r) => r.examDate)
    .filter((d): d is string => Boolean(d));
  const dates = Array.from(
    new Set([...sessions.map((s) => ymd(s.examDate)), ...recordDates]),
  )
    .sort()
    .reverse();
  const today = defaultMorningAnalysisRange();
  const examDate = query.examDate || dates[0] || today.to;
  const range =
    kind === "regular"
      ? regularHistoryRange(examDate)
      : morningAnalysisRangeSchema.parse({
          from: query.from ?? today.from,
          to: query.to ?? today.to,
        });
  if (kind === "regular" && !/^\d{4}-\d{2}-\d{2}$/.test(examDate))
    throw badRequest("시험 날짜를 확인해주세요.");
  const selected = sessions.filter(
    (s) => ymd(s.examDate) >= range.from && ymd(s.examDate) <= range.to,
  );
  const enriched = enrichSessions(
    source,
    type.id,
    selected.map((s) => s.id),
    student?.id,
  );
  const settings = await getExamAnalysisSettings(slug);
  const result: PreviewData = {
    kind,
    scope: student ? "student" : "cohort",
    examType: { id: type.id, name: type.name },
    student: student
      ? {
          id: student.id,
          name: student.name,
          studentNumber: student.studentNumber,
        }
      : null,
    range: { from: range.from, to: range.to },
    dates,
    subjects: type.subjects.map((s) => ({ id: s.id, name: s.name })),
    comparisons: enriched.comparisons,
    items: enriched.items.filter(
      (i) => kind === "morning" || i.date === examDate,
    ),
    easyThreshold: settings.common.easyMissedRatePercent,
    records: [],
  };
  const current = sessions.find((s) => ymd(s.examDate) === examDate);
  if (kind === "regular" && student)
    result.totalHistory = totalHistory(
      source,
      type.id,
      student.id,
      range.from,
      range.to,
    );
  if (kind === "regular" && current) {
    if (!student)
      result.regularCohort = await getRegularCohortAnalysis(
        slug,
        type.id,
        examDate,
        20,
      );
    else if (
      source.participants.some(
        (p) =>
          p.divisionId === divisionId &&
          p.sessionId === current.id &&
          p.studentId === student.id,
      )
    ) {
      result.regular = await getRegularStudentReport(
        slug,
        type.id,
        examDate,
        student.id,
        viewer,
      );
      const distribution = (
        current.externalStats as {
          distribution?: { score: number; count: number }[];
        } | null
      )?.distribution;
      const valid =
        Array.isArray(distribution) &&
        distribution.length > 0 &&
        distribution.every(
          (row) =>
            Number.isFinite(row.score) &&
            Number.isInteger(row.count) &&
            row.count > 0,
        ) &&
        distribution.reduce((sum, row) => sum + row.count, 0) ===
          result.regular.ranks.external.count;
      result.peerOverallRanks = result.regular.competitors.map((peer) =>
        valid && distribution.some((row) => row.score === peer.total)
          ? 1 +
            distribution
              .filter((row) => row.score > peer.total)
              .reduce((sum, row) => sum + row.count, 0)
          : null,
      );
    }
  }
  if (kind === "morning") {
    if (student)
      result.morning = await getMorningStudentReport(
        slug,
        type.id,
        student.id,
        range,
        viewer,
      );
    else
      result.morningCohort = await getMorningCohortAnalysis(
        slug,
        type.id,
        range,
      );
  }
  if (student) {
    // Retain manual-only records, including undated legacy scores. No invented item diagnostics.
    if (kind === "regular") {
      result.legacyResults = legacy.regular.filter(r => r.studentId === student.id && r.examTypeId === type.id && (!r.examDate || (r.examDate >= range.from && r.examDate <= range.to)) && !source.participants.some(p => p.divisionId === divisionId && p.derivedScoreId === r.id)).map(r => ({id:r.id,date:r.examDate,total:r.totalScore,rank:r.rankInClass,notes:r.notes,scores:r.scores}));
      result.records = legacy.regular
        .filter(
          (r) =>
            r.studentId === student.id &&
            r.examTypeId === type.id &&
            (!r.examDate ||
              (r.examDate >= range.from && r.examDate <= range.to)),
        )
        .flatMap((r) =>
          type.subjects
            .filter((s) => Object.hasOwn(r.scores, s.id))
            .map((s) => ({
              id: `${r.id}-${s.id}`,
              date: r.examDate,
              subject: s.name,
              score: r.scores[s.id] ?? null,
              fullScore: null,
              source: source.participants.some(
                (p) => p.divisionId === divisionId && p.derivedScoreId === r.id,
              )
                ? "가져온 성적"
                : "입력 성적 (당시 만점 미보관)",
            })),
        );
    } else {
      result.records = legacy.morning
        .filter(
          (r) =>
            r.studentId === student.id &&
            r.examTypeId === type.id &&
            r.examDate >= range.from &&
            r.examDate <= range.to,
        )
        .map((r) => ({
          id: r.id,
          date: r.examDate,
          subject:
            type.subjects.find((s) => s.id === r.subjectId)?.name ?? "과목",
          score: r.score,
          fullScore: null,
          source: sessions.some(
            (s) =>
              ymd(s.examDate) === r.examDate &&
              s.primarySubjectId === r.subjectId,
          )
            ? "가져온 성적"
            : "입력 성적 (당시 만점 미보관)",
        }));
    }
    if (viewer.role !== "STUDENT") {
      const from =
          kind === "regular" ? `${examDate.slice(0, 7)}-01` : range.from,
        to = range.to;
      result.counseling = await loadAnalysisCounseling(
        slug,
        divisionId,
        student.id,
        from,
        to,
      );
    }
  }
  return result;
}
