/**
 * 면담 권장 대상(운영자 요청 2026-10-07). 벌점 기준만 보던 목록에 성적 신호(과락·점수 하락)를 더한다.
 * 기준값은 모두 학원 설정이 정한다 — 벌점 기준(warnInterview)과 과락 기준(failCutoffPercent)·하락 판정(학원 시험 분석 설정).
 * 새 판정을 만들지 않고 이미 계산된 반 분석의 학생별 취약점(report-summary.ts)을 그대로 모은다.
 */
export type InterviewScoreSignal = {
  studentId: string;
  source: "morning" | "regular";
  /** 과락(정기) 또는 과락선 미만(아침) 과목. 아침은 "형법(2회)"처럼 횟수를 붙인다. */
  failed: string[];
  /** 점수 하락 과목(아침) 또는 "총점 하락"·"석차 하락"(정기) */
  declining: string[];
};

export type RecommendReason = { kind: "demerit" | "fail" | "decline"; text: string };

export type RecommendedStudent<T> = {
  student: T;
  demerit: number;
  reasons: RecommendReason[];
  byDemerit: boolean;
  byScore: boolean;
};

export function recommendStudents<T extends { id: string; name: string }>(
  students: T[],
  options: { demeritOf: (student: T) => number; warnInterview: number; signals: InterviewScoreSignal[] },
): Array<RecommendedStudent<T>> {
  const signalsByStudent = new Map<string, InterviewScoreSignal[]>();
  for (const signal of options.signals) {
    signalsByStudent.set(signal.studentId, [...(signalsByStudent.get(signal.studentId) ?? []), signal]);
  }
  const label = (source: InterviewScoreSignal["source"]) => (source === "morning" ? "아침" : "정기");

  const rows = students.flatMap((student) => {
    const demerit = options.demeritOf(student);
    const reasons: RecommendReason[] = [];
    const byDemerit = demerit >= options.warnInterview;
    if (byDemerit) reasons.push({ kind: "demerit", text: `벌점 ${demerit}점` });
    for (const signal of signalsByStudent.get(student.id) ?? []) {
      if (signal.failed.length) reasons.push({ kind: "fail", text: `${label(signal.source)} 과락: ${signal.failed.join(", ")}` });
      if (signal.declining.length) reasons.push({ kind: "decline", text: `${label(signal.source)} 하락: ${signal.declining.join(", ")}` });
    }
    const byScore = reasons.some((reason) => reason.kind !== "demerit");
    return byDemerit || byScore ? [{ student, demerit, reasons, byDemerit, byScore }] : [];
  });

  const count = (row: RecommendedStudent<T>, kind: RecommendReason["kind"]) => row.reasons.filter((reason) => reason.kind === kind).length;
  // 벌점 기준에 닿은 학생이 먼저(기존 순서), 그다음 과락이 많은 학생, 하락이 많은 학생 순.
  return rows.sort((a, b) =>
    Number(b.byDemerit) - Number(a.byDemerit)
    || b.demerit - a.demerit
    || count(b, "fail") - count(a, "fail")
    || count(b, "decline") - count(a, "decline")
    || a.student.name.localeCompare(b.student.name),
  );
}
