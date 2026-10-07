/**
 * 면담 화면에 붙이는 성적 요약. 새 통계를 만들지 않는다 — 개인 성적표가 쓰는 함수
 * (morningPersonalSummary · morningStudyRows · regularHeadline · subjectVerdict)를 그대로 불러
 * 선생님이 면담 중 보는 숫자·문장이 학생 성적표와 같게 한다.
 */
import { gapText, morningPersonalSummary, morningStudyRows } from "@/lib/exam-preview/morning-personal";
import { reviewGroups } from "@/lib/exam-preview/metrics";
import { regularHeadline, subjectVerdict } from "@/lib/exam-preview/report-summary";
import type { PreviewData } from "@/lib/exam-preview/types";
import { VERDICT_WORDS } from "@/lib/student-words";

export type ScoreTone = "danger" | "warning" | "success" | "info";

export type InterviewMorningSummary = {
  examTypeName: string;
  range: { from: string; to: string };
  headline: { text: string; tone: ScoreTone };
  subjects: Array<{ subjectId: string; name: string; my: number | null; gapText: string; gap: number | null; statusLabel: string; status: string; few: boolean; paired: number }>;
  /** 과목마다 가장 먼저 다시 볼 시험 하나. 순서는 성적표 '공부할 것' 탭과 같다. */
  study: Array<{ subjectId: string; subjectName: string; date: string; topic: string | null; gapText: string; easyItemNos: number[]; otherItemNos: number[] }>;
};

export type InterviewRegularSummary = {
  examTypeName: string;
  date: string;
  headline: { text: string; tone: ScoreTone };
  subjects: Array<{ name: string; my: number; fullScore: number; verdict: string; tone: ScoreTone }>;
};

export type InterviewScoreSummary = { morning: InterviewMorningSummary | null; regular: InterviewRegularSummary | null };

export function summarizeMorningForInterview(data: PreviewData): InterviewMorningSummary | null {
  if (!data.comparisons.length) return null;
  const summary = morningPersonalSummary(data);
  const seen = new Set<string>();
  const study = morningStudyRows(data).flatMap((row) => {
    if (seen.has(row.subjectId)) return [];
    seen.add(row.subjectId);
    return [{
      subjectId: row.subjectId, subjectName: row.subjectName, date: row.date, topic: row.topic, gapText: gapText(row.gap),
      easyItemNos: row.easy.map((i) => i.itemNo), otherItemNos: row.other.map((i) => i.itemNo),
    }];
  });
  return {
    examTypeName: data.examType.name,
    range: data.range,
    headline: summary.headline,
    subjects: summary.subjects.filter((s) => s.expected > 0).map((s) => ({
      subjectId: s.subjectId, name: s.name, my: s.my, gap: s.gap, gapText: gapText(s.gap), statusLabel: s.statusLabel, status: s.status, few: s.few, paired: s.paired,
    })),
    study,
  };
}

export function summarizeRegularForInterview(data: PreviewData): InterviewRegularSummary | null {
  const report = data.regular;
  if (!report || !data.dates.length) return null;
  const headline = regularHeadline({
    total: report.myScore.total, fullScore: report.session.fullScore, isPartial: report.myScore.isPartial,
    rank: report.ranks.external.rank, count: report.ranks.external.count, topPercent: report.ranks.external.topPercent,
    subjects: report.stats.subjects.map((s) => ({ name: s.name, my: s.my, fullScore: s.fullScore, grade: s.grade })),
    failCutoffPercent: data.failCutoffPercent,
    easyWrong: reviewGroups(data.items, data.easyThreshold).easy.length,
    repeatedTopic: null,
    wrong: data.items.filter((i) => i.correct === false).length,
    declining: report.flags.some((f) => f.kind === "totalDrop" || f.kind === "rankDrop"),
  });
  return {
    examTypeName: data.examType.name,
    date: data.range.to,
    headline: { text: headline.text, tone: headline.tone },
    subjects: report.stats.subjects.map((s) => {
      const verdict = subjectVerdict(s, data.failCutoffPercent);
      return { name: s.name, my: s.my, fullScore: s.fullScore, verdict: VERDICT_WORDS[verdict], tone: verdict === "과락" || verdict === "취약" ? "danger" : verdict === "우수" ? "success" : "info" };
    }),
  };
}
