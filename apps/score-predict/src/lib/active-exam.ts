import type { Prisma, PrismaClient } from "@prisma/client";
import type { TenantType } from "@/lib/tenant";

type ActiveExamDb = PrismaClient | Prisma.TransactionClient;

const ACTIVE_EXAM_LOCK_NAMESPACE = "score-predict-active-exam";

export type ActiveExamSummary = {
  id: number;
  name: string;
  year: number;
  round: number;
  examDate: Date;
  isActive: boolean;
};

export type ActiveExamHealth = {
  healthy: boolean;
  activeExamCount: number;
  activeExams: ActiveExamSummary[];
};

export class ActiveExamInvariantError extends Error {
  readonly status = 503;
  readonly code = "ACTIVE_EXAM_INVARIANT";
  readonly activeExamIds: number[];

  constructor(activeExamIds: number[]) {
    super("현재 시험 운영 상태를 확인하고 있습니다. 잠시 후 다시 시도해 주세요.");
    this.name = "ActiveExamInvariantError";
    this.activeExamIds = activeExamIds;
  }
}

export class PastExamWriteError extends Error {
  readonly status = 409;
  readonly code = "PAST_EXAM_WRITE_BLOCKED";

  constructor() {
    super("현재 활성화된 시험에만 입력하거나 수정할 수 있습니다.");
    this.name = "PastExamWriteError";
  }
}

export class ArchivedExamAdminWriteError extends Error {
  readonly status = 409;
  readonly code = "ARCHIVED_EXAM_WRITE_BLOCKED";

  constructor() {
    super("제출 데이터가 있는 종료 회차는 관리자 화면에서도 수정할 수 없습니다.");
    this.name = "ArchivedExamAdminWriteError";
  }
}

export function isNewActiveExamTransition(
  currentIsActive: boolean,
  requestedIsActive: boolean | undefined
) {
  return requestedIsActive === true && !currentIsActive;
}

const activeExamSelect = {
  id: true,
  name: true,
  year: true,
  round: true,
  examDate: true,
  isActive: true,
} as const;

export async function getActiveExamHealth(db: ActiveExamDb): Promise<ActiveExamHealth> {
  const activeExams = await db.exam.findMany({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: activeExamSelect,
  });

  return {
    healthy: activeExams.length === 1,
    activeExamCount: activeExams.length,
    activeExams,
  };
}

export async function requireSoleActiveExam(params: {
  db: ActiveExamDb;
  tenantType: TenantType;
  context: string;
}): Promise<ActiveExamSummary> {
  const health = await getActiveExamHealth(params.db);
  if (!health.healthy) {
    const activeExamIds = health.activeExams.map((exam) => exam.id);
    console.error("[active-exam-invariant]", {
      tenantType: params.tenantType,
      context: params.context,
      activeExamCount: health.activeExamCount,
      activeExamIds,
    });
    throw new ActiveExamInvariantError(activeExamIds);
  }

  return health.activeExams[0];
}

export async function resolveActiveExamForWrite(params: {
  db: ActiveExamDb;
  tenantType: TenantType;
  context: string;
  requestedExamId: number | null;
}): Promise<ActiveExamSummary> {
  const activeExam = await requireSoleActiveExam(params);

  if (params.requestedExamId === null) {
    console.warn("[exam-id-fallback]", {
      tenantType: params.tenantType,
      context: params.context,
      resolvedExamId: activeExam.id,
    });
    return activeExam;
  }

  if (params.requestedExamId !== activeExam.id) {
    console.warn("[past-exam-write-blocked]", {
      tenantType: params.tenantType,
      context: params.context,
      requestedExamId: params.requestedExamId,
      activeExamId: activeExam.id,
    });
    throw new PastExamWriteError();
  }

  return activeExam;
}

/**
 * 다음 회차의 사전 설정은 허용하되, 제출이 이미 존재하는 비활성 회차는 보존한다.
 * 명시적인 회차 상태 모델이 도입되기 전까지 제출 존재 여부를 보수적인 보관 경계로 사용한다.
 */
export async function assertExamWritableForAdminSetup(params: {
  db: ActiveExamDb;
  tenantType: TenantType;
  context: string;
  examId: number;
}): Promise<void> {
  const exam = await params.db.exam.findUnique({
    where: { id: params.examId },
    select: {
      id: true,
      isActive: true,
      _count: { select: { submissions: true } },
    },
  });
  if (!exam || exam.isActive || exam._count.submissions < 1) return;

  console.warn("[archived-exam-admin-write-blocked]", {
    tenantType: params.tenantType,
    context: params.context,
    examId: params.examId,
    submissionCount: exam._count.submissions,
  });
  throw new ArchivedExamAdminWriteError();
}

function getActiveExamLockKey(tenantType: TenantType) {
  return `${ACTIVE_EXAM_LOCK_NAMESPACE}:${tenantType}`;
}

/**
 * 학생의 회차 종속 쓰기는 shared lock, 관리자 회차 전환은 exclusive lock을 사용한다.
 * 같은 DB의 경찰·소방 스키마가 동시에 운영되므로 tenantType을 lock key에 포함한다.
 */
export async function lockActiveExamStateForWrite(
  tx: Prisma.TransactionClient,
  tenantType: TenantType
): Promise<void> {
  const lockKey = getActiveExamLockKey(tenantType);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${lockKey}, 0))`;
}

export async function lockActiveExamStateForTransition(
  tx: Prisma.TransactionClient,
  tenantType: TenantType
): Promise<void> {
  const lockKey = getActiveExamLockKey(tenantType);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

export function isActiveExamRouteError(
  error: unknown
): error is ActiveExamInvariantError | PastExamWriteError | ArchivedExamAdminWriteError {
  return (
    error instanceof ActiveExamInvariantError ||
    error instanceof PastExamWriteError ||
    error instanceof ArchivedExamAdminWriteError
  );
}
