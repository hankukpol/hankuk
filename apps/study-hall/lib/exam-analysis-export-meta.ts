import type { RegularCohortAnalysis } from './exam-analysis-types';
import type { MorningCohortAnalysis } from './morning-exam-analysis-types';

export type ExamAnalysisExport = {
  sheets: Array<{ name: string; header: string[]; rows: (string | number | null)[][] }>;
};

/** Administrator export only: retain roster names and exact student numbers. */
export function regularAnalysisExportRows(report: RegularCohortAnalysis): ExamAnalysisExport {
  return { sheets: [
    {
      name: '정기 석차표',
      header: ['시험일', '반 석차', '이름', '수험번호', '총점', ...report.subjects.map(s => s.name), '외부 석차', '외부 상위(%)', '직전 대비 총점', '직전 대비 석차', '일부 미응시'],
      rows: report.ranking.map(r => [report.session.examDate, r.internalRank, r.name, r.studentNumber, r.totalScore,
        ...report.subjects.map(s => r.subjectScores[s.id] ?? null), r.externalRank, r.externalTopPercent,
        r.delta?.total ?? null, r.delta?.rank ?? null, r.isPartial ? '예' : '아니오']),
    },
    {
      name: '정기 과목 평균',
      header: ['시험일', '과목', '만점', '반 평균', '외부 평균', '반-외부 격차', '취약 인원'],
      rows: report.subjects.map(s => {
        const internal = report.internal.subjectAverages[s.id] ?? null;
        const external = report.external.subjectAverages[s.id] ?? null;
        return [report.session.examDate, s.name, s.fullScore, internal, external,
          internal === null || external === null ? null : internal - external,
          report.internal.weakSubjects.find(w => w.subjectId === s.id)?.weakCount ?? null];
      }),
    },
    {
      name: '정기 반 오답 TOP20',
      header: ['시험일', '과목', '문항', '정답', '반 정답률(%)', '외부 정답률(%)', '반-외부 격차(%p)'],
      rows: report.classWrongTop.slice(0, 20).map(r => [report.session.examDate, r.subjectName, r.itemNo, r.answerKey,
        r.internalCorrectRatePct, r.externalCorrectRatePct, r.gap]),
    },
  ] };
}

/** Reuse cohort-wide summaries; exporting does not fetch individual reports. */
export function morningAnalysisExportRows(report: MorningCohortAnalysis): ExamAnalysisExport {
  const names = new Map(report.subjectDefinitions.map(s => [s.id, s.name]));
  return { sheets: [
    {
      name: '아침 학생 과목 평균',
      header: ['시작일', '종료일', '이름', '수험번호', '과목', '평균', '응시 횟수', '시험 횟수', '응시율(%)'],
      rows: report.studentSubjects.map(r => [report.range.from, report.range.to, r.name, r.studentNumber,
        r.subjectName, r.average, r.attended, r.expected, r.attendanceRatePercent]),
    },
    {
      name: '아침 날짜 과목 평균',
      header: ['시험일', '과목', '진도', '반 응시 인원', '반 평균', '외부 평균'],
      rows: report.heatmap.map(r => [r.date, names.get(r.subjectId) ?? '', r.topic, r.count, r.internalAvg, r.externalAvg]),
    },
    {
      name: '아침 단원 평균',
      header: ['시작일', '종료일', '과목', '진도', '시험 횟수', '반 평균', '외부 평균'],
      rows: report.topics.map(r => [report.range.from, report.range.to, r.subjectName, r.topic, r.count, r.internalAvg, r.externalAvg]),
    },
  ] };
}
