import { ExamType } from "@prisma/client";

type PeriodExamTypeFlags = {
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
};

type PeriodSessionCarrier = PeriodExamTypeFlags & {
  sessions?: Array<{ examType: ExamType }>;
};

const EXAM_TYPE_ORDER: ExamType[] = [ExamType.GONGCHAE, ExamType.GYEONGCHAE];

export function isExamTypeEnabled(period: PeriodExamTypeFlags, examType: ExamType) {
  return examType === ExamType.GYEONGCHAE
    ? period.isGyeongchaeEnabled
    : period.isGongchaeEnabled;
}

export function getEnabledExamTypes(period: PeriodExamTypeFlags) {
  return EXAM_TYPE_ORDER.filter((examType) => isExamTypeEnabled(period, examType));
}

export function resolveEnabledExamType(
  period: PeriodSessionCarrier | null,
  requestedExamType?: ExamType,
) {
  if (!period) {
    return requestedExamType ?? ExamType.GONGCHAE;
  }

  if (requestedExamType && isExamTypeEnabled(period, requestedExamType)) {
    return requestedExamType;
  }

  const enabledExamTypes = getEnabledExamTypes(period);
  if (enabledExamTypes.length > 0) {
    return enabledExamTypes[0];
  }

  const availableSessionExamTypes = new Set(period.sessions?.map((session) => session.examType) ?? []);
  if (requestedExamType && availableSessionExamTypes.has(requestedExamType)) {
    return requestedExamType;
  }

  for (const examType of EXAM_TYPE_ORDER) {
    if (availableSessionExamTypes.has(examType)) {
      return examType;
    }
  }

  return requestedExamType ?? ExamType.GONGCHAE;
}

export function filterSessionsByEnabledExamTypes<T extends { examType: ExamType }>(
  period: PeriodExamTypeFlags,
  sessions: T[],
) {
  return sessions.filter((session) => isExamTypeEnabled(period, session.examType));
}
