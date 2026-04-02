import { randomUUID } from "node:crypto";
import { cache } from "react";

import { Prisma } from "@prisma/client/index";

import {
  DEFAULT_PAYMENT_CATEGORY_NAMES,
  getPaymentMethodLabel,
  normalizePaymentMethodValue,
  serializePaymentMethodValue,
} from "@/lib/payment-meta";
import type {
  EnrollPaymentSchemaInput,
  PaymentBatchSchemaInput,
  RefundPaymentSchemaInput,
  RenewPaymentSchemaInput,
} from "@/lib/payment-schemas";
import { getMockAdminSession, getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { parseUtcDateFromYmd } from "@/lib/date-utils";
import { badRequest, conflict, notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockPaymentCategoryRecord,
  type MockPaymentRecord,
  type MockStudentRecord,
  type MockTuitionPlanRecord,
} from "@/lib/mock-store";
import {
  getPrismaClient,
  isPrismaSchemaMismatchError,
  logSchemaCompatibilityFallback,
  normalizeOptionalText,
} from "@/lib/service-helpers";
import type { StudentDetail } from "@/lib/services/student.service";
import { getStudentDetail } from "@/lib/services/student.service";
import type { StudentStatusValue } from "@/lib/student-meta";
import { addDays, calculateCourseEndDate } from "@/lib/tuition-meta";

export type PaymentActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  name?: string;
};

export type PaymentCategoryItem = {
  id: string;
  divisionId: string;
  name: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PaymentItem = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  paymentTypeId: string;
  paymentTypeName: string;
  amount: number;
  paymentDate: string;
  method: string | null;
  paymentGroupId: string | null;
  originalPaymentId: string | null;
  notes: string | null;
  recordedById: string;
  recordedByName: string;
  createdAt: string;
};

export type PaymentEntryInput = {
  paymentTypeId: string;
  amount: number;
  paymentDate: string;
  method?: string | null;
  notes?: string | null;
};

export type PaymentInput = {
  studentId: string;
} & PaymentEntryInput;

export type PaymentBatchInput = {
  studentId: string;
  payments: PaymentEntryInput[];
};

export type EnrollPaymentResult = {
  student: StudentDetail;
  payments: PaymentItem[];
  payment: PaymentItem | null;
};

export type RenewPaymentResult = {
  student: StudentDetail;
  payments: PaymentItem[];
  payment: PaymentItem | null;
};

export type SettlementMethodSummary = {
  method: string;
  methodLabel: string;
  count: number;
  amount: number;
};

export type SettlementCategorySummary = {
  categoryId: string;
  categoryName: string;
  count: number;
  amount: number;
};

export type SettlementSummary = {
  dateFrom: string;
  dateTo: string;
  totalCount: number;
  totalAmount: number;
  byMethod: SettlementMethodSummary[];
  byCategory: SettlementCategorySummary[];
  payments: PaymentItem[];
};

type PaymentSchemaCompatibility = {
  supportsGroupedPayments: boolean;
};

type PaymentPrismaClient = Awaited<ReturnType<typeof getPrismaClient>> | Prisma.TransactionClient;

type PaymentCreateMeta = {
  paymentGroupId?: string | null;
  originalPaymentId?: string | null;
};

const PAYMENT_SCHEMA_MISMATCH_PATTERNS = [
  "payments",
  "payment_group_id",
  "original_payment_id",
] as const;

let paymentSchemaCompatibilityPromise: Promise<PaymentSchemaCompatibility> | null = null;

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDateString(value: string) {
  return parseUtcDateFromYmd(value, "날짜");
}

async function detectPaymentSchemaCompatibility(): Promise<PaymentSchemaCompatibility> {
  const prisma = await getPrismaClient();
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'payments'
      AND table_schema IN (current_schema(), 'study_hall')
      AND column_name IN ('payment_group_id', 'original_payment_id')
  `;
  const columnNames = new Set(columns.map((column) => column.column_name));

  return {
    supportsGroupedPayments:
      columnNames.has("payment_group_id") && columnNames.has("original_payment_id"),
  };
}

async function getPaymentSchemaCompatibility() {
  if (!paymentSchemaCompatibilityPromise) {
    paymentSchemaCompatibilityPromise = detectPaymentSchemaCompatibility().catch((error) => {
      logSchemaCompatibilityFallback("payments:schema-detect", error);

      return {
        supportsGroupedPayments: false,
      } satisfies PaymentSchemaCompatibility;
    });
  }

  return paymentSchemaCompatibilityPromise;
}

function createPaymentGroupId() {
  return `payment-group-${randomUUID()}`;
}

function toDateString(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function toUtcRange(dateFrom?: string, dateTo?: string) {
  const from = dateFrom ? parseDateString(dateFrom) : null;
  const to = dateTo ? parseDateString(dateTo) : null;

  if (to) {
    to.setUTCDate(to.getUTCDate() + 1);
  }

  return { from, to };
}

function normalizeMethodForStorage(value?: string | null) {
  return serializePaymentMethodValue(value);
}

function normalizePaymentGroupId(value?: string | null) {
  const normalized = normalizeOptionalText(value);
  return normalized ?? null;
}

/** 수납/환불 금액 — 음수(환불) 허용, 0 거부 */
function normalizePaymentAmount(value: number) {
  if (!Number.isFinite(value)) {
    throw badRequest("금액이 올바르지 않습니다.");
  }

  const normalized = Math.trunc(value);

  if (normalized === 0) {
    throw badRequest("금액은 0원이 될 수 없습니다.");
  }

  return normalized;
}

/** 수강료 — 항상 0 이상 */
function normalizeTuitionAmount(value: number) {
  if (!Number.isFinite(value)) {
    throw badRequest("금액이 올바르지 않습니다.");
  }

  const normalized = Math.trunc(value);

  if (normalized < 0) {
    throw badRequest("수강료는 0원 이상이어야 합니다.");
  }

  return normalized;
}

function serializePaymentCategory(category: {
  id: string;
  divisionId: string;
  name: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}) {
  return {
    id: category.id,
    divisionId: category.divisionId,
    name: category.name,
    isActive: category.isActive,
    displayOrder: category.displayOrder,
    createdAt: typeof category.createdAt === "string" ? category.createdAt : category.createdAt.toISOString(),
    updatedAt: typeof category.updatedAt === "string" ? category.updatedAt : category.updatedAt.toISOString(),
  } satisfies PaymentCategoryItem;
}

function serializePayment(payment: PaymentWithIncludes) {
  return {
    id: payment.id,
    studentId: payment.student.id,
    studentName: payment.student.name,
    studentNumber: payment.student.studentNumber,
    paymentTypeId: payment.paymentType.id,
    paymentTypeName: payment.paymentType.name,
    amount: payment.amount,
    paymentDate: toDateString(payment.paymentDate),
    method: payment.method,
    paymentGroupId: "paymentGroupId" in payment ? payment.paymentGroupId ?? null : null,
    originalPaymentId: "originalPaymentId" in payment ? payment.originalPaymentId ?? null : null,
    notes: payment.notes,
    recordedById: payment.recordedBy.id,
    recordedByName: payment.recordedBy.name,
    createdAt: payment.createdAt.toISOString(),
  } satisfies PaymentItem;
}

function serializeMockPayment(
  record: MockPaymentRecord,
  categories: Map<string, MockPaymentCategoryRecord>,
  students: Map<string, { id: string; name: string; studentNumber: string }>,
  divisionSlug: string,
) {
  const student = students.get(record.studentId);
  const category = categories.get(record.paymentTypeId);

  if (!student || !category) {
    return null;
  }

  return {
    id: record.id,
    studentId: student.id,
    studentName: student.name,
    studentNumber: student.studentNumber,
    paymentTypeId: category.id,
    paymentTypeName: category.name,
    amount: record.amount,
    paymentDate: record.paymentDate,
    method: record.method,
    paymentGroupId: record.paymentGroupId ?? null,
    originalPaymentId: record.originalPaymentId ?? null,
    notes: record.notes,
    recordedById: record.recordedById,
    recordedByName: getMockAdminSession(divisionSlug).name,
    createdAt: record.createdAt,
  } satisfies PaymentItem;
}

function isPaymentUniqueConstraintError(error: unknown, target: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const rawTarget = error.meta?.target;
  const values = Array.isArray(rawTarget)
    ? rawTarget.map((value) => String(value))
    : rawTarget
      ? [String(rawTarget)]
      : [];

  return values.some((value) => value.includes(target));
}


function ensureStudentStatusForPayment(status: StudentStatusValue) {
  if (!["ACTIVE", "ON_LEAVE"].includes(status)) {
    throw badRequest("현재 수납할 수 없는 학생 상태입니다.");
  }
}

function resolvePaymentEntries(
  payment: EnrollPaymentSchemaInput["payment"] | RenewPaymentSchemaInput["payment"],
  payments?: EnrollPaymentSchemaInput["payments"] | RenewPaymentSchemaInput["payments"],
) {
  if (payments?.length) {
    return payments;
  }

  if (payment) {
    return [payment];
  }

  return [];
}

function ensurePaymentEntries(
  payments: PaymentEntryInput[],
  message: string,
) {
  if (payments.length === 0) {
    throw badRequest(message);
  }

  return payments;
}

function resolveRenewedCourseEndDate(currentCourseEndDate: string | null, durationDays: number | null) {
  if (!durationDays || durationDays < 1) {
    return currentCourseEndDate;
  }

  const today = getKstToday();
  const baseDate =
    currentCourseEndDate && currentCourseEndDate >= today ? currentCourseEndDate : today;

  return addDays(baseDate, durationDays);
}

async function ensureDefaultPaymentCategories(divisionId: string) {
  const prisma = await getPrismaClient();
  const existing = await prisma.paymentCategory.findMany({
    where: {
      divisionId,
    },
    orderBy: {
      displayOrder: "asc",
    },
  });

  if (existing.length > 0) {
    const existingNames = new Set(existing.map((category) => category.name));
    const missing = DEFAULT_PAYMENT_CATEGORY_NAMES.filter((name) => !existingNames.has(name));

    if (missing.length > 0) {
      const maxOrder = Math.max(...existing.map((category) => category.displayOrder));
      await prisma.paymentCategory.createMany({
        data: missing.map((name, index) => ({
          divisionId,
          name,
          displayOrder: maxOrder + 1 + index,
          isActive: true,
        })),
      });

      return prisma.paymentCategory.findMany({
        where: { divisionId },
        orderBy: { displayOrder: "asc" },
      });
    }

    return existing;
  }

  await prisma.paymentCategory.createMany({
    data: DEFAULT_PAYMENT_CATEGORY_NAMES.map((name, index) => ({
      divisionId,
      name,
      displayOrder: index,
      isActive: true,
    })),
  });

  return prisma.paymentCategory.findMany({
    where: {
      divisionId,
    },
    orderBy: {
      displayOrder: "asc",
    },
  });
}

const getDivisionOrThrow = cache(async function getDivisionOrThrow(divisionSlug: string) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: {
      slug: divisionSlug,
    },
  });

  if (!division) {
    throw notFound("지점 정보를 찾을 수 없습니다.");
  }

  return division;
});

function findMockTuitionPlan(
  plans: MockTuitionPlanRecord[],
  tuitionPlanId: string,
) {
  const plan = plans.find((item) => item.id === tuitionPlanId) ?? null;

  if (!plan) {
    throw notFound("수강 플랜을 찾을 수 없습니다.");
  }

  return plan;
}

function findMockPaymentCategory(
  categories: MockPaymentCategoryRecord[],
  paymentTypeId: string,
) {
  const category = categories.find((item) => item.id === paymentTypeId) ?? null;

  if (!category) {
    throw notFound("수납 유형을 찾을 수 없습니다.");
  }

  return category;
}

function buildMockPaymentRecord(
  divisionSlug: string,
  actor: PaymentActor,
  payment: PaymentEntryInput,
  studentId: string,
  meta?: PaymentCreateMeta,
) {
  return {
    id: `mock-payment-record-${divisionSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    studentId,
    paymentTypeId: payment.paymentTypeId,
    amount: normalizePaymentAmount(payment.amount),
    paymentDate: payment.paymentDate,
    method: normalizeMethodForStorage(payment.method) ?? "other",
    paymentGroupId: normalizePaymentGroupId(meta?.paymentGroupId),
    originalPaymentId: normalizePaymentGroupId(meta?.originalPaymentId),
    notes: normalizeOptionalText(payment.notes),
    recordedById: actor.id,
    createdAt: new Date().toISOString(),
  } satisfies MockPaymentRecord;
}

function getMockStudentPaymentBalance(
  records: MockPaymentRecord[],
  studentId: string,
  options?: { excludePaymentId?: string },
) {
  return records
    .filter((record) => record.studentId === studentId)
    .filter((record) => !options?.excludePaymentId || record.id !== options.excludePaymentId)
    .reduce((sum, record) => sum + record.amount, 0);
}

async function getStudentPaymentBalance(
  prisma: PaymentPrismaClient,
  studentId: string,
  options?: { excludePaymentId?: string },
) {
  const aggregate = await prisma.payment.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      studentId,
      ...(options?.excludePaymentId ? { NOT: { id: options.excludePaymentId } } : {}),
    },
  });

  return aggregate._sum.amount ?? 0;
}

function getMockRefundedAmountForOriginalPayment(
  records: MockPaymentRecord[],
  originalPaymentId: string,
) {
  return records
    .filter((record) => record.originalPaymentId === originalPaymentId && record.amount < 0)
    .reduce((sum, record) => sum + Math.abs(record.amount), 0);
}

async function getRefundedAmountForOriginalPayment(
  prisma: PaymentPrismaClient,
  originalPaymentId: string,
) {
  const paymentSchema = await getPaymentSchemaCompatibility();

  if (!paymentSchema.supportsGroupedPayments) {
    return 0;
  }

  const aggregate = await prisma.payment.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      originalPaymentId,
      amount: {
        lt: 0,
      },
    },
  });

  return Math.abs(aggregate._sum.amount ?? 0);
}

function toPrismaPaymentCreateInput(
  supportsGroupedPayments: boolean,
  actor: PaymentActor,
  studentId: string,
  payment: PaymentEntryInput,
  meta?: PaymentCreateMeta,
) {
  const data: Prisma.PaymentUncheckedCreateInput = {
    studentId,
    paymentTypeId: payment.paymentTypeId,
    amount: normalizePaymentAmount(payment.amount),
    paymentDate: parseDateString(payment.paymentDate),
    method: normalizeMethodForStorage(payment.method),
    notes: normalizeOptionalText(payment.notes),
    recordedById: actor.id,
  };

  if (supportsGroupedPayments) {
    data.paymentGroupId = normalizePaymentGroupId(meta?.paymentGroupId);
    data.originalPaymentId = normalizePaymentGroupId(meta?.originalPaymentId);
  }

  return data;
}

const paymentRelationSelect = {
  student: { select: { id: true, name: true, studentNumber: true } },
  paymentType: { select: { id: true, name: true } },
  recordedBy: { select: { id: true, name: true } },
} as const;

const legacyPaymentSelect = {
  id: true,
  amount: true,
  paymentDate: true,
  method: true,
  notes: true,
  createdAt: true,
  ...paymentRelationSelect,
} satisfies Prisma.PaymentSelect;

const paymentSelect = {
  ...legacyPaymentSelect,
  paymentGroupId: true,
  originalPaymentId: true,
} satisfies Prisma.PaymentSelect;

type PaymentWithIncludes =
  | Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>
  | Prisma.PaymentGetPayload<{ select: typeof legacyPaymentSelect }>;

function getPaymentSelect(supportsGroupedPayments: boolean) {
  return supportsGroupedPayments ? paymentSelect : legacyPaymentSelect;
}

function ensureNonNegativePaymentBalance(balance: number) {
  if (balance < 0) {
    throw badRequest("환불 금액이 누적 수납액을 초과할 수 없습니다.");
  }
}

async function findPaymentById(divisionSlug: string, paymentId: string) {
  return (await listPayments(divisionSlug)).find((item) => item.id === paymentId) ?? null;
}

export async function listPaymentCategories(
  divisionSlug: string,
  options?: {
    activeOnly?: boolean;
  },
) {
  if (isMockMode()) {
    const state = await readMockState();
    const categories = [...(state.paymentCategoriesByDivision[divisionSlug] ?? [])]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .filter((category) => !options?.activeOnly || category.isActive);

    return categories.map((category) => serializePaymentCategory(category));
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const categories = await ensureDefaultPaymentCategories(division.id);

  return categories
    .filter((category) => !options?.activeOnly || category.isActive)
    .map((category) => serializePaymentCategory(category));
}

export async function listPayments(
  divisionSlug: string,
  options?: {
    studentId?: string;
    paymentTypeId?: string;
    dateFrom?: string;
    dateTo?: string;
  },
) {
  if (isMockMode()) {
    const state = await readMockState();
    const students = new Map(
      (state.studentsByDivision[divisionSlug] ?? []).map((student) => [student.id, student]),
    );
    const categories = new Map(
      (state.paymentCategoriesByDivision[divisionSlug] ?? []).map((category) => [category.id, category]),
    );

    return (state.paymentRecordsByDivision[divisionSlug] ?? [])
      .filter((record) => !options?.studentId || record.studentId === options.studentId)
      .filter((record) => !options?.paymentTypeId || record.paymentTypeId === options.paymentTypeId)
      .filter((record) => !options?.dateFrom || record.paymentDate >= options.dateFrom)
      .filter((record) => !options?.dateTo || record.paymentDate <= options.dateTo)
      .sort(
        (left, right) =>
          right.paymentDate.localeCompare(left.paymentDate) ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .map((record) => serializeMockPayment(record, categories, students, divisionSlug))
      .filter(Boolean) as PaymentItem[];
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultPaymentCategories(division.id);
  const prisma = await getPrismaClient();
  const { from, to } = toUtcRange(options?.dateFrom, options?.dateTo);
  const paymentSchema = await getPaymentSchemaCompatibility();
  const paymentWhere = {
    student: {
      divisionId: division.id,
    },
    ...(options?.studentId ? { studentId: options.studentId } : {}),
    ...(options?.paymentTypeId ? { paymentTypeId: options.paymentTypeId } : {}),
    ...(from || to
      ? {
          paymentDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
          },
        }
      : {}),
  } satisfies Prisma.PaymentWhereInput;
  let payments: PaymentWithIncludes[];

  try {
    payments = await prisma.payment.findMany({
      where: paymentWhere,
      select: getPaymentSelect(paymentSchema.supportsGroupedPayments),
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    });
  } catch (error) {
    if (!isPrismaSchemaMismatchError(error, [...PAYMENT_SCHEMA_MISMATCH_PATTERNS])) {
      throw error;
    }

    logSchemaCompatibilityFallback("payments:list", error);
    payments = await prisma.payment.findMany({
      where: paymentWhere,
      select: legacyPaymentSelect,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    });
  }

  return payments.map((payment) => serializePayment(payment)) satisfies PaymentItem[];
}

export async function createPaymentsBatch(
  divisionSlug: string,
  actor: PaymentActor,
  input: PaymentBatchInput | PaymentBatchSchemaInput,
) {
  const normalizedPayments = input.payments.map((payment) => ({
    ...payment,
    amount: normalizePaymentAmount(payment.amount),
  }));

  if (normalizedPayments.length === 0) {
    throw badRequest("결제 항목을 1개 이상 입력해 주세요.");
  }

  if (isMockMode()) {
    const paymentIds = await updateMockState((state) => {
      const student = (state.studentsByDivision[divisionSlug] ?? []).find((item) => item.id === input.studentId);
      const categories = state.paymentCategoriesByDivision[divisionSlug] ?? [];
      const records = state.paymentRecordsByDivision[divisionSlug] ?? [];

      if (!student) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      ensureStudentStatusForPayment(student.status);

      for (const payment of normalizedPayments) {
        if (!categories.some((item) => item.id === payment.paymentTypeId)) {
          throw notFound("수납 유형을 찾을 수 없습니다.");
        }
      }

      const balanceDelta = normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0);
      if (balanceDelta < 0) {
        const currentBalance = getMockStudentPaymentBalance(records, input.studentId);
        ensureNonNegativePaymentBalance(currentBalance + balanceDelta);
      }

      const paymentGroupId = normalizedPayments.length > 1 ? createPaymentGroupId() : null;
      const createdRecords = normalizedPayments.map((payment) =>
        buildMockPaymentRecord(divisionSlug, actor, payment, input.studentId, {
          paymentGroupId,
        }),
      );

      state.paymentRecordsByDivision[divisionSlug] = [...createdRecords, ...records];

      return createdRecords.map((record) => record.id);
    });

    return {
      payments: (
        await Promise.all(paymentIds.map((paymentId) => findPaymentById(divisionSlug, paymentId)))
      ).filter((payment): payment is PaymentItem => Boolean(payment)),
    };
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultPaymentCategories(division.id);
  const prisma = await getPrismaClient();
  const paymentSchema = await getPaymentSchemaCompatibility();
  const paymentSelectForWrite = getPaymentSelect(paymentSchema.supportsGroupedPayments);

  const [student, categories] = await Promise.all([
    prisma.student.findFirst({
      where: {
        id: input.studentId,
        divisionId: division.id,
      },
      select: {
        id: true,
        status: true,
      },
    }),
    prisma.paymentCategory.findMany({
      where: {
        divisionId: division.id,
        id: {
          in: Array.from(new Set(normalizedPayments.map((payment) => payment.paymentTypeId))),
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  ensureStudentStatusForPayment(student.status);

  if (categories.length !== new Set(normalizedPayments.map((payment) => payment.paymentTypeId)).size) {
    throw notFound("수납 유형을 찾을 수 없습니다.");
  }

  const balanceDelta = normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  if (balanceDelta < 0) {
    const currentBalance = await getStudentPaymentBalance(prisma, input.studentId);
    ensureNonNegativePaymentBalance(currentBalance + balanceDelta);
  }

  const paymentGroupId = normalizedPayments.length > 1 ? createPaymentGroupId() : null;
  const payments = await prisma.$transaction(async (tx) =>
    Promise.all(
      normalizedPayments.map((payment) =>
        tx.payment.create({
          data: toPrismaPaymentCreateInput(paymentSchema.supportsGroupedPayments, actor, input.studentId, payment, {
            paymentGroupId,
          }),
          select: paymentSelectForWrite,
        }),
      ),
    ),
  );

  revalidateDivisionOperationalViews(divisionSlug, { studentId: input.studentId });
  return {
    payments: payments.map((payment) => serializePayment(payment)),
  };
}

export async function createPayment(
  divisionSlug: string,
  actor: PaymentActor,
  input: PaymentInput,
) {
  const result = await createPaymentsBatch(divisionSlug, actor, {
    studentId: input.studentId,
    payments: [
      {
        paymentTypeId: input.paymentTypeId,
        amount: input.amount,
        paymentDate: input.paymentDate,
        method: input.method,
        notes: input.notes,
      },
    ],
  });

  const payment = result.payments[0] ?? null;

  if (!payment) {
    throw badRequest("수납 등록에 실패했습니다.");
  }

  return payment;
}

export async function updatePayment(
  divisionSlug: string,
  paymentId: string,
  input: PaymentInput,
) {
  const normalizedAmount = normalizePaymentAmount(input.amount);

  if (isMockMode()) {
    await updateMockState((state) => {
      const current = state.paymentRecordsByDivision[divisionSlug] ?? [];
      const target = current.find((record) => record.id === paymentId);
      const student = (state.studentsByDivision[divisionSlug] ?? []).find((item) => item.id === input.studentId);
      const category = (state.paymentCategoriesByDivision[divisionSlug] ?? []).find(
        (item) => item.id === input.paymentTypeId,
      );

      if (!target) {
        throw notFound("수납 기록을 찾을 수 없습니다.");
      }

      if (!student) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      ensureStudentStatusForPayment(student.status);

      if (!category) {
        throw notFound("수납 유형을 찾을 수 없습니다.");
      }

      if (normalizedAmount < 0) {
        const currentBalance = getMockStudentPaymentBalance(
          current,
          input.studentId,
          { excludePaymentId: paymentId },
        );
        ensureNonNegativePaymentBalance(currentBalance + normalizedAmount);
      }

      state.paymentRecordsByDivision[divisionSlug] = current.map((record) =>
        record.id === paymentId
          ? {
              ...record,
              studentId: input.studentId,
              paymentTypeId: input.paymentTypeId,
              amount: normalizedAmount,
              paymentDate: input.paymentDate,
              method: normalizeMethodForStorage(input.method) ?? "other",
              notes: normalizeOptionalText(input.notes),
            }
          : record,
      );
    });

    return findPaymentById(divisionSlug, paymentId);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultPaymentCategories(division.id);
  const prisma = await getPrismaClient();
  const paymentSchema = await getPaymentSchemaCompatibility();
  const paymentSelectForWrite = getPaymentSelect(paymentSchema.supportsGroupedPayments);

  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      student: {
        divisionId: division.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (!payment) {
    throw notFound("수납 기록을 찾을 수 없습니다.");
  }

  const [student, category] = await Promise.all([
    prisma.student.findFirst({
      where: {
        id: input.studentId,
        divisionId: division.id,
      },
      select: {
        id: true,
        status: true,
      },
    }),
    prisma.paymentCategory.findFirst({
      where: {
        id: input.paymentTypeId,
        divisionId: division.id,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  ensureStudentStatusForPayment(student.status);

  if (!category) {
    throw notFound("수납 유형을 찾을 수 없습니다.");
  }

  if (normalizedAmount < 0) {
    const currentBalance = await getStudentPaymentBalance(
      prisma,
      input.studentId,
      { excludePaymentId: paymentId },
    );
    ensureNonNegativePaymentBalance(currentBalance + normalizedAmount);
  }

  const updated = await prisma.payment.update({
    where: {
      id: paymentId,
    },
    data: {
      studentId: input.studentId,
      paymentTypeId: input.paymentTypeId,
      amount: normalizedAmount,
      paymentDate: parseDateString(input.paymentDate),
      method: normalizeMethodForStorage(input.method),
      notes: normalizeOptionalText(input.notes),
    },
    select: paymentSelectForWrite,
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId: input.studentId });
  return serializePayment(updated);
}

export async function deletePayment(divisionSlug: string, paymentId: string) {
  if (isMockMode()) {
    await updateMockState((state) => {
      const current = state.paymentRecordsByDivision[divisionSlug] ?? [];

      if (!current.some((record) => record.id === paymentId)) {
        throw notFound("수납 기록을 찾을 수 없습니다.");
      }

      if (current.some((record) => record.originalPaymentId === paymentId)) {
        throw badRequest("연결된 환불 이력이 있는 원결제는 삭제할 수 없습니다.");
      }

      state.paymentRecordsByDivision[divisionSlug] = current.filter((record) => record.id !== paymentId);
    });

    return true;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const paymentSchema = await getPaymentSchemaCompatibility();

  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      student: {
        divisionId: division.id,
      },
    },
    select: {
      id: true,
      studentId: true,
    },
  });

  if (!payment) {
    throw notFound("수납 기록을 찾을 수 없습니다.");
  }

  const linkedRefundCount = paymentSchema.supportsGroupedPayments
    ? await prisma.payment.count({
        where: {
          originalPaymentId: paymentId,
          student: {
            divisionId: division.id,
          },
        },
      })
    : 0;

  if (linkedRefundCount > 0) {
    throw badRequest("연결된 환불 이력이 있는 원결제는 삭제할 수 없습니다.");
  }

  await prisma.payment.delete({
    where: {
      id: paymentId,
    },
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId: payment.studentId });
  return true;
}

export async function refundPayment(
  divisionSlug: string,
  actor: PaymentActor,
  input: RefundPaymentSchemaInput,
) {
  if (isMockMode()) {
    const result = await updateMockState((state) => {
      const students = state.studentsByDivision[divisionSlug] ?? [];
      const categories = state.paymentCategoriesByDivision[divisionSlug] ?? [];
      const records = state.paymentRecordsByDivision[divisionSlug] ?? [];
      const student = students.find((item) => item.id === input.studentId) ?? null;

      if (!student) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      ensureStudentStatusForPayment(student.status);

      const refundCategory = categories.find((item) => item.id === input.refundPaymentTypeId) ?? null;

      if (!refundCategory) {
        throw notFound("환불 수납 유형을 찾을 수 없습니다.");
      }

      if (input.mode === "simple") {
        const refundAmount = normalizePaymentAmount(input.amount * -1);
        const currentBalance = getMockStudentPaymentBalance(records, input.studentId);
        ensureNonNegativePaymentBalance(currentBalance + refundAmount);

        if (input.originalPaymentId) {
          const originalPayment = records.find(
            (record) => record.id === input.originalPaymentId && record.studentId === input.studentId,
          );

          if (!originalPayment) {
            throw notFound("원결제를 찾을 수 없습니다.");
          }

          if (originalPayment.amount <= 0) {
            throw badRequest("원결제 금액이 올바르지 않습니다.");
          }

          const refundedAmount = getMockRefundedAmountForOriginalPayment(records, originalPayment.id);
          const refundableAmount = originalPayment.amount - refundedAmount;

          if (input.amount > refundableAmount) {
            throw badRequest("환불 금액이 원결제의 남은 환불 가능액을 초과했습니다.");
          }
        }

        const refundGroupId = input.originalPaymentId ? createPaymentGroupId() : null;

        const refundRecord = buildMockPaymentRecord(
          divisionSlug,
          actor,
          {
            paymentTypeId: refundCategory.id,
            amount: refundAmount,
            paymentDate: input.paymentDate,
            method: input.method,
            notes: input.notes,
          },
          input.studentId,
          {
            paymentGroupId: refundGroupId,
            originalPaymentId: input.originalPaymentId ?? null,
          },
        );

        state.paymentRecordsByDivision[divisionSlug] = [refundRecord, ...records];

        return {
          paymentIds: [refundRecord.id],
        };
      }

      const originalPayment = records.find(
        (record) => record.id === input.originalPaymentId && record.studentId === input.studentId,
      ) ?? null;

      if (!originalPayment) {
        throw notFound("원결제를 찾을 수 없습니다.");
      }

      if (normalizePaymentMethodValue(originalPayment.method) !== "card") {
        throw badRequest("카드 전체취소는 카드 결제 건만 선택할 수 있습니다.");
      }

      if (originalPayment.amount <= 0) {
        throw badRequest("원결제 금액이 올바르지 않습니다.");
      }

      const rechargeCategory = categories.find((item) => item.id === input.rechargePaymentTypeId) ?? null;

      if (!rechargeCategory) {
        throw notFound("재결제 수납 유형을 찾을 수 없습니다.");
      }

      if (refundCategory.id === rechargeCategory.id) {
        throw badRequest("환불과 재결제 수납 유형은 서로 달라야 합니다.");
      }

      const rechargeAmount = normalizePaymentAmount(input.rechargeAmount);

      if (rechargeAmount >= originalPayment.amount) {
        throw badRequest("재결제 금액은 원결제 금액보다 작아야 합니다.");
      }

      const refundedAmount = getMockRefundedAmountForOriginalPayment(records, originalPayment.id);
      if (refundedAmount > 0) {
        throw badRequest("이미 환불 이력이 있는 카드 결제는 전체취소를 다시 진행할 수 없습니다.");
      }

      const currentBalance = getMockStudentPaymentBalance(records, input.studentId);
      ensureNonNegativePaymentBalance(currentBalance - originalPayment.amount + rechargeAmount);
      const refundGroupId = createPaymentGroupId();

      const refundRecord = buildMockPaymentRecord(
        divisionSlug,
        actor,
        {
          paymentTypeId: refundCategory.id,
          amount: originalPayment.amount * -1,
          paymentDate: input.paymentDate,
          method: "card",
          notes:
            input.refundNotes ??
            `카드 전체취소 (원결제 ${originalPayment.paymentDate})`,
        },
        input.studentId,
        {
          paymentGroupId: refundGroupId,
          originalPaymentId: originalPayment.id,
        },
      );

      const rechargeRecord = buildMockPaymentRecord(
        divisionSlug,
        actor,
        {
          paymentTypeId: rechargeCategory.id,
          amount: rechargeAmount,
          paymentDate: input.paymentDate,
          method: "card",
          notes: input.rechargeNotes ?? "카드 재결제 (공제 후)",
        },
        input.studentId,
        {
          paymentGroupId: refundGroupId,
          originalPaymentId: originalPayment.id,
        },
      );

      state.paymentRecordsByDivision[divisionSlug] = [refundRecord, rechargeRecord, ...records];

      return {
        paymentIds: [refundRecord.id, rechargeRecord.id],
      };
    });

    const payments = (
      await Promise.all(result.paymentIds.map((paymentId) => findPaymentById(divisionSlug, paymentId)))
    ).filter((payment): payment is PaymentItem => Boolean(payment));

    return { payments };
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultPaymentCategories(division.id);
  const prisma = await getPrismaClient();
  const paymentSchema = await getPaymentSchemaCompatibility();
  const paymentSelectForWrite = getPaymentSelect(paymentSchema.supportsGroupedPayments);

  if (!paymentSchema.supportsGroupedPayments) {
    throw badRequest("현재 데이터베이스에 최신 결제 환불 마이그레이션이 적용되지 않아 환불 기능을 사용할 수 없습니다.");
  }

  if (input.mode === "simple") {
    const refundAmount = normalizePaymentAmount(input.amount * -1);
    const [student, refundCategory, originalPayment] = await Promise.all([
      prisma.student.findFirst({
        where: {
          id: input.studentId,
          divisionId: division.id,
        },
        select: {
          id: true,
          status: true,
        },
      }),
      prisma.paymentCategory.findFirst({
        where: {
          id: input.refundPaymentTypeId,
          divisionId: division.id,
        },
        select: {
          id: true,
        },
      }),
      input.originalPaymentId
        ? prisma.payment.findFirst({
            where: {
              id: input.originalPaymentId,
              studentId: input.studentId,
              student: {
                divisionId: division.id,
              },
            },
            select: {
              id: true,
              amount: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!student) {
      throw notFound("학생 정보를 찾을 수 없습니다.");
    }

    ensureStudentStatusForPayment(student.status);

    if (!refundCategory) {
      throw notFound("환불 수납 유형을 찾을 수 없습니다.");
    }

    const currentBalance = await getStudentPaymentBalance(prisma, student.id);
    ensureNonNegativePaymentBalance(currentBalance + refundAmount);

    if (input.originalPaymentId) {
      if (!originalPayment) {
        throw notFound("원결제를 찾을 수 없습니다.");
      }

      if (originalPayment.amount <= 0) {
        throw badRequest("원결제 금액이 올바르지 않습니다.");
      }

      const refundedAmount = await getRefundedAmountForOriginalPayment(prisma, originalPayment.id);
      const refundableAmount = originalPayment.amount - refundedAmount;

      if (input.amount > refundableAmount) {
        throw badRequest("환불 금액이 원결제의 남은 환불 가능액을 초과했습니다.");
      }
    }

    const refundGroupId = input.originalPaymentId ? createPaymentGroupId() : null;

    const payment = await prisma.payment.create({
      data: toPrismaPaymentCreateInput(
        paymentSchema.supportsGroupedPayments,
        actor,
        student.id,
        {
          paymentTypeId: refundCategory.id,
          amount: refundAmount,
          paymentDate: input.paymentDate,
          method: input.method,
          notes: input.notes,
        },
        {
          paymentGroupId: refundGroupId,
          originalPaymentId: input.originalPaymentId ?? null,
        },
      ),
      select: paymentSelectForWrite,
    });

    revalidateDivisionOperationalViews(divisionSlug, { studentId: student.id });
    return {
      payments: [serializePayment(payment)],
    };
  }

  const [student, refundCategory, rechargeCategory, originalPayment] = await Promise.all([
    prisma.student.findFirst({
      where: {
        id: input.studentId,
        divisionId: division.id,
      },
      select: {
        id: true,
        status: true,
      },
    }),
    prisma.paymentCategory.findFirst({
      where: {
        id: input.refundPaymentTypeId,
        divisionId: division.id,
      },
      select: {
        id: true,
      },
    }),
    prisma.paymentCategory.findFirst({
      where: {
        id: input.rechargePaymentTypeId,
        divisionId: division.id,
      },
      select: {
        id: true,
      },
    }),
    prisma.payment.findFirst({
      where: {
        id: input.originalPaymentId,
        studentId: input.studentId,
        student: {
          divisionId: division.id,
        },
      },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        method: true,
      },
    }),
  ]);

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  ensureStudentStatusForPayment(student.status);

  if (!refundCategory) {
    throw notFound("환불 수납 유형을 찾을 수 없습니다.");
  }

  if (!rechargeCategory) {
    throw notFound("재결제 수납 유형을 찾을 수 없습니다.");
  }

  if (refundCategory.id === rechargeCategory.id) {
    throw badRequest("환불과 재결제 수납 유형은 서로 달라야 합니다.");
  }

  if (!originalPayment) {
    throw notFound("원결제를 찾을 수 없습니다.");
  }

  if (normalizePaymentMethodValue(originalPayment.method) !== "card") {
    throw badRequest("카드 전체취소는 카드 결제 건만 선택할 수 있습니다.");
  }

  if (originalPayment.amount <= 0) {
    throw badRequest("원결제 금액이 올바르지 않습니다.");
  }

  const rechargeAmount = normalizePaymentAmount(input.rechargeAmount);

  if (rechargeAmount >= originalPayment.amount) {
    throw badRequest("재결제 금액은 원결제 금액보다 작아야 합니다.");
  }

  const refundedAmount = await getRefundedAmountForOriginalPayment(prisma, originalPayment.id);
  if (refundedAmount > 0) {
    throw badRequest("이미 환불 이력이 있는 카드 결제는 전체취소를 다시 진행할 수 없습니다.");
  }

  const currentBalance = await getStudentPaymentBalance(prisma, student.id);
  ensureNonNegativePaymentBalance(currentBalance - originalPayment.amount + rechargeAmount);

  const originalPaymentDate = toDateString(originalPayment.paymentDate);
  const refundGroupId = createPaymentGroupId();
  const result = await prisma.$transaction(async (tx) => {
    const refundPaymentRecord = await tx.payment.create({
      data: {
        studentId: student.id,
        paymentTypeId: refundCategory.id,
        amount: originalPayment.amount * -1,
        paymentDate: parseDateString(input.paymentDate),
        method: "card",
        paymentGroupId: refundGroupId,
        originalPaymentId: originalPayment.id,
        notes:
          normalizeOptionalText(input.refundNotes) ??
          `카드 전체취소 (원결제 ${originalPaymentDate})`,
        recordedById: actor.id,
      },
      select: paymentSelectForWrite,
    });

    const rechargePaymentRecord = await tx.payment.create({
      data: {
        studentId: student.id,
        paymentTypeId: rechargeCategory.id,
        amount: rechargeAmount,
        paymentDate: parseDateString(input.paymentDate),
        method: "card",
        paymentGroupId: refundGroupId,
        originalPaymentId: originalPayment.id,
        notes: normalizeOptionalText(input.rechargeNotes) ?? "카드 재결제 (공제 후)",
        recordedById: actor.id,
      },
      select: paymentSelectForWrite,
    });

    return {
      refundPaymentRecord,
      rechargePaymentRecord,
    };
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId: student.id });
  return {
    payments: [
      serializePayment(result.refundPaymentRecord),
      serializePayment(result.rechargePaymentRecord),
    ],
  };
}

export async function enrollAndPay(
  divisionSlug: string,
  actor: PaymentActor,
  input: EnrollPaymentSchemaInput,
): Promise<EnrollPaymentResult> {
  const courseStartDate = input.courseStartDate ?? getKstToday();
  const paymentEntries = input.tuitionExempt
    ? []
    : ensurePaymentEntries(
        resolvePaymentEntries(input.payment, input.payments),
        "면제 학생이 아니면 수납 정보를 입력해 주세요.",
      );

  if (isMockMode()) {
    const result = await updateMockState((state) => {
      const divisionStudents = state.studentsByDivision[divisionSlug] ?? [];
      const divisionId =
        divisionStudents[0]?.divisionId ?? getMockDivisionBySlug(divisionSlug)?.id ?? `div-${divisionSlug}`;
      const duplicate = divisionStudents.find(
        (student) => student.studentNumber === input.student.studentNumber.trim(),
      );

      if (duplicate) {
        throw conflict("이미 사용 중인 수험번호입니다.");
      }

      const plan = findMockTuitionPlan(
        state.tuitionPlansByDivision[divisionSlug] ?? [],
        input.tuitionPlanId,
      );
      for (const payment of paymentEntries) {
        findMockPaymentCategory(
          state.paymentCategoriesByDivision[divisionSlug] ?? [],
          payment.paymentTypeId,
        );
      }

      const now = new Date().toISOString();
      const studentId = `mock-student-${divisionSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tuitionAmount =
        typeof input.tuitionAmount === "number" && Number.isFinite(input.tuitionAmount)
          ? normalizeTuitionAmount(input.tuitionAmount)
          : plan.amount;
      const computedCourseEndDate = calculateCourseEndDate(courseStartDate, plan.durationDays);
      const studentRecord = {
        id: studentId,
        divisionId,
        divisionSlug,
        name: input.student.name.trim(),
        studentNumber: input.student.studentNumber.trim(),
        studyTrack: null,
        phone: normalizeOptionalText(input.student.phone),
        seatId: null,
        seatLabel: null,
        courseStartDate,
        courseEndDate: computedCourseEndDate,
        tuitionPlanId: plan.id,
        tuitionAmount,
        tuitionExempt: Boolean(input.tuitionExempt),
        tuitionExemptReason: input.tuitionExempt ? normalizeOptionalText(input.tuitionExemptReason) : null,
        status: "ACTIVE",
        enrolledAt: now,
        withdrawnAt: null,
        withdrawnNote: null,
        memo: normalizeOptionalText(input.student.memo),
        createdAt: now,
        updatedAt: now,
      } satisfies MockStudentRecord;
      const paymentGroupId = paymentEntries.length > 1 ? createPaymentGroupId() : null;
      const paymentRecords = paymentEntries.map((payment) =>
        buildMockPaymentRecord(divisionSlug, actor, payment, studentId, {
          paymentGroupId,
        }),
      );

      state.studentsByDivision[divisionSlug] = [...divisionStudents, studentRecord];
      if (paymentRecords.length > 0) {
        state.paymentRecordsByDivision[divisionSlug] = [
          ...paymentRecords,
          ...(state.paymentRecordsByDivision[divisionSlug] ?? []),
        ];
      }

      return {
        studentId,
        paymentIds: paymentRecords.map((payment) => payment.id),
      };
    });

    const student = await getStudentDetail(divisionSlug, result.studentId);
    const payments = (
      await Promise.all(result.paymentIds.map((paymentId) => findPaymentById(divisionSlug, paymentId)))
    ).filter((payment): payment is PaymentItem => Boolean(payment));

    return { student, payments, payment: payments[0] ?? null };
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultPaymentCategories(division.id);
  const prisma = await getPrismaClient();
  const paymentSchema = await getPaymentSchemaCompatibility();
  const paymentSelectForWrite = getPaymentSelect(paymentSchema.supportsGroupedPayments);

  const [duplicate, plan, categories] = await Promise.all([
    prisma.student.findFirst({
      where: {
        divisionId: division.id,
        studentNumber: input.student.studentNumber.trim(),
      },
      select: { id: true },
    }),
    prisma.tuitionPlan.findFirst({
      where: {
        id: input.tuitionPlanId,
        divisionId: division.id,
      },
      select: {
        id: true,
        amount: true,
        durationDays: true,
      },
    }),
    paymentEntries.length > 0
      ? prisma.paymentCategory.findMany({
          where: {
            divisionId: division.id,
            id: {
              in: Array.from(new Set(paymentEntries.map((payment) => payment.paymentTypeId))),
            },
          },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  if (duplicate) {
    throw conflict("이미 사용 중인 수험번호입니다.");
  }

  if (!plan) {
    throw notFound("수강 플랜을 찾을 수 없습니다.");
  }

  if (categories.length !== new Set(paymentEntries.map((payment) => payment.paymentTypeId)).size) {
    throw notFound("수납 유형을 찾을 수 없습니다.");
  }

  const tuitionAmount =
    typeof input.tuitionAmount === "number" && Number.isFinite(input.tuitionAmount)
      ? normalizeTuitionAmount(input.tuitionAmount)
      : plan.amount;
  const computedCourseEndDate = calculateCourseEndDate(courseStartDate, plan.durationDays);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          divisionId: division.id,
          name: input.student.name.trim(),
          studentNumber: input.student.studentNumber.trim(),
          phone: normalizeOptionalText(input.student.phone),
          memo: normalizeOptionalText(input.student.memo),
          tuitionPlanId: plan.id,
          tuitionAmount,
          tuitionExempt: Boolean(input.tuitionExempt),
          tuitionExemptReason: input.tuitionExempt ? normalizeOptionalText(input.tuitionExemptReason) : null,
          courseStartDate: parseDateString(courseStartDate),
          courseEndDate: computedCourseEndDate ? parseDateString(computedCourseEndDate) : null,
          status: "ACTIVE",
        },
        select: {
          id: true,
        },
      });

      const paymentGroupId = paymentEntries.length > 1 ? createPaymentGroupId() : null;
      const payments = await Promise.all(
        paymentEntries.map((payment) =>
          tx.payment.create({
            data: toPrismaPaymentCreateInput(paymentSchema.supportsGroupedPayments, actor, student.id, payment, {
              paymentGroupId,
            }),
            select: paymentSelectForWrite,
          }),
        ),
      );

      return {
        studentId: student.id,
        payments: payments.map((payment) => serializePayment(payment)),
      };
    });

    revalidateDivisionOperationalViews(divisionSlug, { studentId: result.studentId });
    return {
      student: await getStudentDetail(divisionSlug, result.studentId),
      payments: result.payments,
      payment: result.payments[0] ?? null,
    };
  } catch (error) {
    if (isPaymentUniqueConstraintError(error, "student_number") || isPaymentUniqueConstraintError(error, "studentNumber")) {
      throw conflict("이미 사용 중인 수험번호입니다.");
    }

    throw error;
  }
}

export async function renewAndPay(
  divisionSlug: string,
  actor: PaymentActor,
  input: RenewPaymentSchemaInput,
): Promise<RenewPaymentResult> {
  if (isMockMode()) {
    const result = await updateMockState((state) => {
      const students = state.studentsByDivision[divisionSlug] ?? [];
      const student = students.find((item) => item.id === input.studentId) ?? null;

      if (!student) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      ensureStudentStatusForPayment(student.status);
      const paymentEntries = student.tuitionExempt
        ? []
        : ensurePaymentEntries(
            resolvePaymentEntries(input.payment, input.payments),
            "면제 학생이 아니면 수납 정보를 입력해 주세요.",
          );

      const plan = findMockTuitionPlan(
        state.tuitionPlansByDivision[divisionSlug] ?? [],
        input.tuitionPlanId,
      );
      for (const payment of paymentEntries) {
        findMockPaymentCategory(
          state.paymentCategoriesByDivision[divisionSlug] ?? [],
          payment.paymentTypeId,
        );
      }

      const nextCourseEndDate = resolveRenewedCourseEndDate(student.courseEndDate, plan.durationDays);
      const tuitionAmount =
        typeof input.tuitionAmount === "number" && Number.isFinite(input.tuitionAmount)
          ? normalizeTuitionAmount(input.tuitionAmount)
          : plan.amount;
      const paymentGroupId = paymentEntries.length > 1 ? createPaymentGroupId() : null;
      const paymentRecords = paymentEntries.map((payment) =>
        buildMockPaymentRecord(divisionSlug, actor, payment, student.id, {
          paymentGroupId,
        }),
      );

      state.studentsByDivision[divisionSlug] = students.map((item) =>
        item.id === student.id
          ? {
              ...item,
              tuitionPlanId: plan.id,
              tuitionAmount,
              courseEndDate: nextCourseEndDate,
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
      if (paymentRecords.length > 0) {
        state.paymentRecordsByDivision[divisionSlug] = [
          ...paymentRecords,
          ...(state.paymentRecordsByDivision[divisionSlug] ?? []),
        ];
      }

      return {
        studentId: student.id,
        paymentIds: paymentRecords.map((payment) => payment.id),
      };
    });

    const student = await getStudentDetail(divisionSlug, result.studentId);
    const payments = (
      await Promise.all(result.paymentIds.map((paymentId) => findPaymentById(divisionSlug, paymentId)))
    ).filter((payment): payment is PaymentItem => Boolean(payment));

    return { student, payments, payment: payments[0] ?? null };
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultPaymentCategories(division.id);
  const prisma = await getPrismaClient();
  const paymentSchema = await getPaymentSchemaCompatibility();
  const paymentSelectForWrite = getPaymentSelect(paymentSchema.supportsGroupedPayments);

  const normalizedPaymentEntries = resolvePaymentEntries(input.payment, input.payments);
  const [student, plan, categories] = await Promise.all([
    prisma.student.findFirst({
      where: {
        id: input.studentId,
        divisionId: division.id,
      },
      select: {
        id: true,
        status: true,
        courseEndDate: true,
        tuitionExempt: true,
      },
    }),
    prisma.tuitionPlan.findFirst({
      where: {
        id: input.tuitionPlanId,
        divisionId: division.id,
      },
      select: {
        id: true,
        amount: true,
        durationDays: true,
      },
    }),
    normalizedPaymentEntries.length > 0
      ? prisma.paymentCategory.findMany({
          where: {
            divisionId: division.id,
            id: {
              in: Array.from(new Set(normalizedPaymentEntries.map((payment) => payment.paymentTypeId))),
            },
          },
          select: {
            id: true,
          },
        })
      : Promise.resolve([]),
  ]);

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  ensureStudentStatusForPayment(student.status);
  const paymentEntries = student.tuitionExempt
    ? []
    : ensurePaymentEntries(
        normalizedPaymentEntries,
        "면제 학생이 아니면 수납 정보를 입력해 주세요.",
      );

  if (!plan) {
    throw notFound("수강 플랜을 찾을 수 없습니다.");
  }

  if (categories.length !== new Set(paymentEntries.map((payment) => payment.paymentTypeId)).size) {
    throw notFound("수납 유형을 찾을 수 없습니다.");
  }

  const currentCourseEndDate = student.courseEndDate ? toDateString(student.courseEndDate) : null;
  const nextCourseEndDate = resolveRenewedCourseEndDate(currentCourseEndDate, plan.durationDays);
  const tuitionAmount =
    typeof input.tuitionAmount === "number" && Number.isFinite(input.tuitionAmount)
      ? normalizeTuitionAmount(input.tuitionAmount)
      : plan.amount;

  const result = await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: {
        id: student.id,
      },
      data: {
        tuitionPlanId: plan.id,
        tuitionAmount,
        courseEndDate: nextCourseEndDate ? parseDateString(nextCourseEndDate) : undefined,
      },
    });

    const paymentGroupId = paymentEntries.length > 1 ? createPaymentGroupId() : null;
    const payments = await Promise.all(
      paymentEntries.map((payment) =>
        tx.payment.create({
          data: toPrismaPaymentCreateInput(paymentSchema.supportsGroupedPayments, actor, student.id, payment, {
            paymentGroupId,
          }),
          select: paymentSelectForWrite,
        }),
      ),
    );

    return {
      studentId: student.id,
      payments: payments.map((payment) => serializePayment(payment)),
    };
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId: result.studentId });
  return {
    student: await getStudentDetail(divisionSlug, result.studentId),
    payments: result.payments,
    payment: result.payments[0] ?? null,
  };
}

export async function getSettlementSummary(
  divisionSlug: string,
  dateFrom: string,
  dateTo: string,
): Promise<SettlementSummary> {
  const [payments, categories] = await Promise.all([
    listPayments(divisionSlug, { dateFrom, dateTo }),
    listPaymentCategories(divisionSlug),
  ]);

  const categoryOrder = new Map(categories.map((category) => [category.id, category.displayOrder]));
  const byMethodMap = new Map<string, SettlementMethodSummary>();
  const byCategoryMap = new Map<string, SettlementCategorySummary>();

  let totalAmount = 0;

  for (const payment of payments) {
    const signedAmount = payment.amount;
    const method = normalizePaymentMethodValue(payment.method) ?? "other";
    const methodSummary = byMethodMap.get(method);
    const categorySummary = byCategoryMap.get(payment.paymentTypeId);

    totalAmount += signedAmount;

    if (methodSummary) {
      methodSummary.count += 1;
      methodSummary.amount += signedAmount;
    } else {
      byMethodMap.set(method, {
        method,
        methodLabel: getPaymentMethodLabel(method),
        count: 1,
        amount: signedAmount,
      });
    }

    if (categorySummary) {
      categorySummary.count += 1;
      categorySummary.amount += signedAmount;
    } else {
      byCategoryMap.set(payment.paymentTypeId, {
        categoryId: payment.paymentTypeId,
        categoryName: payment.paymentTypeName,
        count: 1,
        amount: signedAmount,
      });
    }
  }

  return {
    dateFrom,
    dateTo,
    totalCount: payments.length,
    totalAmount,
    byMethod: Array.from(byMethodMap.values()).sort((left, right) => right.amount - left.amount),
    byCategory: Array.from(byCategoryMap.values()).sort((left, right) => {
      const leftOrder = categoryOrder.get(left.categoryId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = categoryOrder.get(right.categoryId) ?? Number.MAX_SAFE_INTEGER;

      return leftOrder - rightOrder || left.categoryName.localeCompare(right.categoryName, "ko");
    }),
    payments,
  };
}
