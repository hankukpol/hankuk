import { ExamType } from "@prisma/client";

export const POLICE_EXAM_NUMBER_PATTERN = /^\d{10}$/;

export interface PoliceExamNumberRangeSource {
  examNumberStart?: string | null;
  examNumberEnd?: string | null;
  examNumberStartCareer?: string | null;
  examNumberEndCareer?: string | null;
}

export function parsePoliceExamNumberInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return POLICE_EXAM_NUMBER_PATTERN.test(trimmed) ? trimmed : null;
}

export function validatePoliceAdminExamNumberRange(
  startValue: unknown,
  endValue: unknown,
  label: string
): { start: string | null; end: string | null; error: string | null } {
  const start = trimToNull(typeof startValue === "string" ? startValue : null);
  const end = trimToNull(typeof endValue === "string" ? endValue : null);
  if (!start && !end) return { start: null, end: null, error: null };
  if (!start || !end) {
    return { start, end, error: `${label} 응시번호 시작과 끝을 모두 입력해 주세요.` };
  }
  if (!POLICE_EXAM_NUMBER_PATTERN.test(start) || !POLICE_EXAM_NUMBER_PATTERN.test(end)) {
    return { start, end, error: `${label} 응시번호 범위는 10자리 숫자여야 합니다.` };
  }
  if (start > end) {
    return { start, end, error: `${label} 응시번호 시작값은 끝값보다 클 수 없습니다.` };
  }
  return { start, end, error: null };
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validatePoliceExamNumberWithRange(params: {
  examNumber: string;
  examType: ExamType;
  quota: PoliceExamNumberRangeSource | null | undefined;
}): { ok: boolean; message?: string; range?: { start: string; end: string } | null } {
  if (!POLICE_EXAM_NUMBER_PATTERN.test(params.examNumber)) {
    return { ok: false, message: "응시번호는 10자리 숫자여야 합니다." };
  }

  if (params.examType !== ExamType.PUBLIC && params.examType !== ExamType.CAREER) {
    return { ok: false, message: "경찰 채용유형에 맞지 않는 응시번호입니다." };
  }

  const start = trimToNull(
    params.examType === ExamType.CAREER
      ? params.quota?.examNumberStartCareer
      : params.quota?.examNumberStart
  );
  const end = trimToNull(
    params.examType === ExamType.CAREER
      ? params.quota?.examNumberEndCareer
      : params.quota?.examNumberEnd
  );

  if (!start && !end) return { ok: true, range: null };
  if (!start || !end || !POLICE_EXAM_NUMBER_PATTERN.test(start) || !POLICE_EXAM_NUMBER_PATTERN.test(end)) {
    return { ok: false, message: "관리자에게 설정된 응시번호 범위를 확인해 달라고 요청해 주세요." };
  }
  if (start > end) {
    return { ok: false, message: "관리자 응시번호 범위 설정이 올바르지 않습니다." };
  }
  if (params.examNumber < start || params.examNumber > end) {
    return { ok: false, message: `응시번호는 ${start}~${end} 범위로 입력해 주세요.` };
  }

  return { ok: true, range: { start, end } };
}
