import { ExamType, Prisma, PrismaClient } from "@prisma/client";
import { getRegionRecruitCount } from "@/lib/police/exam-utils";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

type ExamQuotaSnapshot = {
  recruitCount: number;
  recruitCountCareer: number;
  examNumberStart: string | null;
  examNumberEnd: string | null;
  examNumberStartCareer: string | null;
  examNumberEndCareer: string | null;
};

type ExamNumberAvailabilityParams = {
  db?: DbClient;
  examId: number;
  regionId: number;
  examType: ExamType;
  examNumber: string;
  userId: number;
  excludeSubmissionId?: number;
  excludePreRegistrationId?: number;
};

type ExamNumberAvailabilityResult = {
  available: boolean;
  reason?: string;
};

export async function getExamRegionQuotaSnapshot(
  db: DbClient,
  examId: number,
  regionId: number
): Promise<ExamQuotaSnapshot | null> {
  return db.examRegionQuota.findUnique({
    where: {
      examId_regionId: { examId, regionId },
    },
    select: {
      recruitCount: true,
      recruitCountCareer: true,
      examNumberStart: true,
      examNumberEnd: true,
      examNumberStartCareer: true,
      examNumberEndCareer: true,
    },
  });
}

export function getExamNumberRange(
  quota: Pick<ExamQuotaSnapshot, "examNumberStart" | "examNumberEnd" | "examNumberStartCareer" | "examNumberEndCareer"> | null,
  examType: ExamType
): { rangeStart: string | null; rangeEnd: string | null } {
  return {
    rangeStart:
      examType === ExamType.CAREER ? quota?.examNumberStartCareer ?? null : quota?.examNumberStart ?? null,
    rangeEnd:
      examType === ExamType.CAREER ? quota?.examNumberEndCareer ?? null : quota?.examNumberEnd ?? null,
  };
}

export function getQuotaValidationError(
  quota: Pick<ExamQuotaSnapshot, "recruitCount" | "recruitCountCareer"> | null,
  examType: ExamType
): string | null {
  const recruitCount = quota ? getRegionRecruitCount(quota, examType) : 0;
  if (Number.isInteger(recruitCount) && recruitCount > 0) {
    return null;
  }

  return examType === ExamType.CAREER
    ? "선택한 지역의 경행경채 모집인원이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요."
    : "선택한 지역의 모집인원 정보가 아직 설정되지 않았습니다.";
}

export function isExamNumberOutOfRange(
  examNumber: string,
  rangeStart: string,
  rangeEnd: string
): boolean {
  const inputNum = Number(examNumber);
  const startNum = Number(rangeStart);
  const endNum = Number(rangeEnd);

  if (Number.isInteger(inputNum) && Number.isInteger(startNum) && Number.isInteger(endNum)) {
    return inputNum < startNum || inputNum > endNum;
  }

  return examNumber < rangeStart || examNumber > rangeEnd;
}

async function acquireAdvisoryLock(
  tx: Prisma.TransactionClient,
  scope: string,
  parts: Array<string | number>
): Promise<void> {
  const lockKey = [scope, ...parts.map((part) => String(part))].join(":");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

export async function lockUserExamMutation(
  tx: Prisma.TransactionClient,
  params: {
    userId: number;
    examId: number;
  }
): Promise<void> {
  await acquireAdvisoryLock(tx, "user-exam", [params.userId, params.examId]);
}

export async function lockExamNumberMutation(
  tx: Prisma.TransactionClient,
  params: {
    examId: number;
    regionId: number;
    examNumber: string;
  }
): Promise<void> {
  await acquireAdvisoryLock(tx, "exam-number", [params.examId, params.regionId, params.examNumber]);
}

export async function checkExamNumberAvailability(
  params: ExamNumberAvailabilityParams
): Promise<ExamNumberAvailabilityResult> {
  const {
    db = prisma,
    examId,
    regionId,
    examType,
    examNumber,
    userId,
    excludeSubmissionId,
    excludePreRegistrationId,
  } = params;

  const quota = await getExamRegionQuotaSnapshot(db, examId, regionId);
  const { rangeStart, rangeEnd } = getExamNumberRange(quota, examType);

  if (rangeStart && rangeEnd && isExamNumberOutOfRange(examNumber, rangeStart, rangeEnd)) {
    return {
      available: false,
      reason: `수험번호가 유효 범위(${rangeStart}~${rangeEnd}) 밖입니다.`,
    };
  }

  const [duplicateSubmission, duplicatePreRegistration] = await Promise.all([
    db.submission.findFirst({
      where: {
        examId,
        regionId,
        examNumber,
        userId: { not: userId },
        ...(excludeSubmissionId ? { NOT: { id: excludeSubmissionId } } : {}),
      },
      select: { id: true },
    }),
    db.preRegistration.findFirst({
      where: {
        examId,
        regionId,
        examNumber,
        userId: { not: userId },
        ...(excludePreRegistrationId ? { NOT: { id: excludePreRegistrationId } } : {}),
      },
      select: { id: true },
    }),
  ]);

  if (duplicateSubmission) {
    return {
      available: false,
      reason: "이미 다른 사용자가 동일한 수험번호로 답안을 제출했습니다.",
    };
  }

  if (duplicatePreRegistration) {
    return {
      available: false,
      reason: "이미 다른 사용자가 동일한 수험번호를 사전등록했습니다.",
    };
  }

  return { available: true };
}
