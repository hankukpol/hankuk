import { ExamType, Gender } from "@prisma/client";

export const EXAM_NUMBER_PATTERN = /^\d{10}$/;

export type ExamNumberCohort =
  | "PUBLIC_MALE"
  | "PUBLIC_FEMALE"
  | "CAREER_RESCUE"
  | "CAREER_ACADEMIC_MALE"
  | "CAREER_ACADEMIC_FEMALE"
  | "CAREER_ACADEMIC_COMBINED"
  | "CAREER_EMT_MALE"
  | "CAREER_EMT_FEMALE";

type GenderDigit = "1" | "2";
type ExamTypeCode = "01" | "03" | "04" | "05";

interface ExamNumberRule {
  label: string;
  typeCode: ExamTypeCode;
  allowedGenderDigits: readonly GenderDigit[];
}

const RULES: Record<ExamNumberCohort, ExamNumberRule> = {
  PUBLIC_MALE: {
    label: "공채(남)",
    typeCode: "01",
    allowedGenderDigits: ["1"],
  },
  PUBLIC_FEMALE: {
    label: "공채(여)",
    typeCode: "01",
    allowedGenderDigits: ["2"],
  },
  CAREER_RESCUE: {
    label: "구조",
    typeCode: "04",
    allowedGenderDigits: ["1"],
  },
  CAREER_ACADEMIC_MALE: {
    label: "소방관련학과(남)",
    typeCode: "05",
    allowedGenderDigits: ["1"],
  },
  CAREER_ACADEMIC_FEMALE: {
    label: "소방관련학과(여)",
    typeCode: "05",
    allowedGenderDigits: ["2"],
  },
  CAREER_ACADEMIC_COMBINED: {
    label: "소방관련학과(양성)",
    typeCode: "05",
    allowedGenderDigits: ["1", "2"],
  },
  CAREER_EMT_MALE: {
    label: "구급(남)",
    typeCode: "03",
    allowedGenderDigits: ["1"],
  },
  CAREER_EMT_FEMALE: {
    label: "구급(여)",
    typeCode: "03",
    allowedGenderDigits: ["2"],
  },
};

export interface ExamNumberContext {
  examType: ExamType;
  gender: Gender;
  recruitAcademicCombined?: number;
}

export interface ExamNumberRangeSource {
  recruitAcademicCombined?: number;
  examNumberStartPublicMale?: string | null;
  examNumberEndPublicMale?: string | null;
  examNumberStartPublicFemale?: string | null;
  examNumberEndPublicFemale?: string | null;
  examNumberStartCareerRescue?: string | null;
  examNumberEndCareerRescue?: string | null;
  examNumberStartCareerAcademicMale?: string | null;
  examNumberEndCareerAcademicMale?: string | null;
  examNumberStartCareerAcademicFemale?: string | null;
  examNumberEndCareerAcademicFemale?: string | null;
  examNumberStartCareerAcademicCombined?: string | null;
  examNumberEndCareerAcademicCombined?: string | null;
  examNumberStartCareerEmtMale?: string | null;
  examNumberEndCareerEmtMale?: string | null;
  examNumberStartCareerEmtFemale?: string | null;
  examNumberEndCareerEmtFemale?: string | null;
  examNumberStart?: string | null; // deprecated
  examNumberEnd?: string | null; // deprecated
}

interface ExamNumberRangePair {
  start: string;
  end: string;
}

interface ExamNumberValidationBaseResult {
  ok: boolean;
  cohort: ExamNumberCohort;
  message?: string;
}

export interface ExamNumberValidationResult extends ExamNumberValidationBaseResult {
  range?: ExamNumberRangePair | null;
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseExamNumberInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!EXAM_NUMBER_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function resolveExamNumberCohort(context: ExamNumberContext): ExamNumberCohort {
  if (context.examType === ExamType.PUBLIC) {
    return context.gender === Gender.FEMALE ? "PUBLIC_FEMALE" : "PUBLIC_MALE";
  }

  if (context.examType === ExamType.CAREER_RESCUE) {
    return "CAREER_RESCUE";
  }

  if (context.examType === ExamType.CAREER_ACADEMIC) {
    if ((context.recruitAcademicCombined ?? 0) > 0) {
      return "CAREER_ACADEMIC_COMBINED";
    }
    return context.gender === Gender.FEMALE ? "CAREER_ACADEMIC_FEMALE" : "CAREER_ACADEMIC_MALE";
  }

  return context.gender === Gender.FEMALE ? "CAREER_EMT_FEMALE" : "CAREER_EMT_MALE";
}

function validateExamNumberForCohort(examNumber: string, cohort: ExamNumberCohort): ExamNumberValidationBaseResult {
  const rule = RULES[cohort];

  if (!EXAM_NUMBER_PATTERN.test(examNumber)) {
    return {
      ok: false,
      cohort,
      message: "응시번호는 10자리 숫자여야 합니다.",
    };
  }

  const genderDigit = examNumber[3] as GenderDigit;
  if (!rule.allowedGenderDigits.includes(genderDigit)) {
    return {
      ok: false,
      cohort,
      message: `${rule.label} 응시번호 규칙(4번째 자리 성별코드)과 일치하지 않습니다.`,
    };
  }

  const typeCode = examNumber.slice(4, 6) as ExamTypeCode;
  if (typeCode !== rule.typeCode) {
    return {
      ok: false,
      cohort,
      message: `${rule.label} 응시번호 규칙(5~6번째 자리 유형코드)과 일치하지 않습니다.`,
    };
  }

  return { ok: true, cohort };
}

export function validateExamNumberByContext(params: {
  examNumber: string;
  context: ExamNumberContext;
}): ExamNumberValidationBaseResult {
  const cohort = resolveExamNumberCohort(params.context);
  return validateExamNumberForCohort(params.examNumber, cohort);
}

function getRangePairByCohort(
  quota: ExamNumberRangeSource,
  cohort: ExamNumberCohort
): { start: string | null; end: string | null } {
  if (cohort === "PUBLIC_MALE") {
    return {
      start: trimToNull(quota.examNumberStartPublicMale),
      end: trimToNull(quota.examNumberEndPublicMale),
    };
  }
  if (cohort === "PUBLIC_FEMALE") {
    return {
      start: trimToNull(quota.examNumberStartPublicFemale),
      end: trimToNull(quota.examNumberEndPublicFemale),
    };
  }
  if (cohort === "CAREER_RESCUE") {
    return {
      start: trimToNull(quota.examNumberStartCareerRescue),
      end: trimToNull(quota.examNumberEndCareerRescue),
    };
  }
  if (cohort === "CAREER_ACADEMIC_MALE") {
    return {
      start: trimToNull(quota.examNumberStartCareerAcademicMale),
      end: trimToNull(quota.examNumberEndCareerAcademicMale),
    };
  }
  if (cohort === "CAREER_ACADEMIC_FEMALE") {
    return {
      start: trimToNull(quota.examNumberStartCareerAcademicFemale),
      end: trimToNull(quota.examNumberEndCareerAcademicFemale),
    };
  }
  if (cohort === "CAREER_ACADEMIC_COMBINED") {
    return {
      start: trimToNull(quota.examNumberStartCareerAcademicCombined),
      end: trimToNull(quota.examNumberEndCareerAcademicCombined),
    };
  }
  if (cohort === "CAREER_EMT_MALE") {
    return {
      start: trimToNull(quota.examNumberStartCareerEmtMale),
      end: trimToNull(quota.examNumberEndCareerEmtMale),
    };
  }
  return {
    start: trimToNull(quota.examNumberStartCareerEmtFemale),
    end: trimToNull(quota.examNumberEndCareerEmtFemale),
  };
}

function parseValidRangePair(
  start: string | null,
  end: string | null,
  cohort: ExamNumberCohort
): ExamNumberRangePair | null {
  if (!start && !end) return null;
  if (!start || !end) return null;

  const startValidation = validateExamNumberForCohort(start, cohort);
  const endValidation = validateExamNumberForCohort(end, cohort);
  if (!startValidation.ok || !endValidation.ok) return null;
  if (start > end) return null;

  return { start, end };
}

export function resolveExamNumberRange(params: {
  context: ExamNumberContext;
  quota: ExamNumberRangeSource | null | undefined;
}): ExamNumberRangePair | null {
  if (!params.quota) return null;

  const cohort = resolveExamNumberCohort(params.context);
  const selected = getRangePairByCohort(params.quota, cohort);
  const selectedRange = parseValidRangePair(selected.start, selected.end, cohort);
  if (selectedRange) return selectedRange;

  const legacyStart = trimToNull(params.quota.examNumberStart);
  const legacyEnd = trimToNull(params.quota.examNumberEnd);
  return parseValidRangePair(legacyStart, legacyEnd, cohort);
}

export function validateExamNumberWithRange(params: {
  examNumber: string;
  context: ExamNumberContext;
  quota?: ExamNumberRangeSource | null;
}): ExamNumberValidationResult {
  const baseValidation = validateExamNumberByContext({
    examNumber: params.examNumber,
    context: params.context,
  });
  if (!baseValidation.ok) {
    return baseValidation;
  }

  const range = resolveExamNumberRange({
    context: params.context,
    quota: params.quota,
  });

  if (range && (params.examNumber < range.start || params.examNumber > range.end)) {
    return {
      ok: false,
      cohort: baseValidation.cohort,
      message: `응시번호가 유효 범위(${range.start}~${range.end}) 밖입니다.`,
      range,
    };
  }

  return {
    ok: true,
    cohort: baseValidation.cohort,
    range,
  };
}

export function validateAdminExamNumberRange(params: {
  cohort: ExamNumberCohort;
  label: string;
  start: string | null;
  end: string | null;
}): string | null {
  const start = trimToNull(params.start);
  const end = trimToNull(params.end);

  if (!start && !end) {
    return null;
  }
  if (!start || !end) {
    return `${params.label} 응시번호 범위는 시작/끝을 모두 입력하거나 모두 비워야 합니다.`;
  }
  if (!EXAM_NUMBER_PATTERN.test(start) || !EXAM_NUMBER_PATTERN.test(end)) {
    return `${params.label} 응시번호 범위는 10자리 숫자만 입력할 수 있습니다.`;
  }

  const startValidation = validateExamNumberForCohort(start, params.cohort);
  if (!startValidation.ok) {
    return `${params.label} 시작번호가 직렬/성별 규칙과 일치하지 않습니다.`;
  }
  const endValidation = validateExamNumberForCohort(end, params.cohort);
  if (!endValidation.ok) {
    return `${params.label} 끝번호가 직렬/성별 규칙과 일치하지 않습니다.`;
  }
  if (start > end) {
    return `${params.label} 응시번호 범위의 시작값은 끝값보다 클 수 없습니다.`;
  }

  return null;
}

