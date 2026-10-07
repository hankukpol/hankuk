/**
 * 학생 상벌점 화면의 집계 기간. 위 숫자와 아래 표가 같은 기간을 보도록 한곳에서 정한다
 * (2026-10-07: 숫자는 이번 달만 세는데 표는 전체 기록을 보여 건수가 맞지 않았다).
 *
 * - 관리 규정이 기간을 정한 학원(pointMetricScope)이나 상점·벌점을 따로 세는 학원(meritPoints)은
 *   학생에게 내려온 pointMetricDateFrom/To, 없으면 이번 달을 쓴다.
 * - 그 밖의 학원은 기간 없이 누적이다(scoped=false). 이때는 표도 전체 기록이다.
 */
export type StudentPointPeriod = { scoped: boolean; from: string | null; to: string | null; label: string };

export function studentPointPeriod(
  student: { pointMetricScope?: string | null; pointMetricDateFrom?: string | null; pointMetricDateTo?: string | null; meritPoints?: number },
  month: { dateFrom: string; dateTo: string },
): StudentPointPeriod {
  const scoped = Boolean(student.pointMetricScope) || student.meritPoints !== undefined;
  if (!scoped) return { scoped: false, from: null, to: null, label: "전체" };
  return {
    scoped: true,
    from: student.pointMetricDateFrom ?? month.dateFrom,
    to: student.pointMetricDateTo ?? month.dateTo,
    label: student.pointMetricScope === "course" ? "수강 기간" : "이번 달",
  };
}

/** 기록 날짜(ISO, KST 기준으로 저장된 문자열)의 앞 10자리로 기간 안인지 본다. 기존 화면과 같은 비교다. */
export function isInStudentPointPeriod(date: string, period: StudentPointPeriod): boolean {
  if (!period.scoped || !period.from || !period.to) return true;
  const day = date.slice(0, 10);
  return day >= period.from && day <= period.to;
}
