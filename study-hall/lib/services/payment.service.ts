import { cache } from "react";

import { DEFAULT_PAYMENT_CATEGORY_NAMES } from "@/lib/payment-meta";
import { getMockAdminSession, isMockMode } from "@/lib/mock-data";
import { parseUtcDateFromYmd } from "@/lib/date-utils";
import { notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockPaymentCategoryRecord,
  type MockPaymentRecord,
} from "@/lib/mock-store";

type PaymentActor = {
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
  notes: string | null;
  recordedById: string;
  recordedByName: string;
  createdAt: string;
};

export type PaymentInput = {
  studentId: string;
  paymentTypeId: string;
  amount: number;
  paymentDate: string;
  method?: string | null;
  notes?: string | null;
};

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDateString(value: string) {
  return parseUtcDateFromYmd(value, "납부일");
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

const getDivisionOrThrow = cache(async function getDivisionOrThrow(divisionSlug: string) {
  const { prisma } = await import("@/lib/prisma");

  const division = await prisma.division.findUnique({
    where: {
      slug: divisionSlug,
    },
  });

  if (!division) {
    throw notFound("직렬 정보를 찾을 수 없습니다.");
  }

  return division;
});

async function ensureDefaultPaymentCategories(divisionId: string) {
  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.paymentCategory.findMany({
    where: {
      divisionId,
    },
    orderBy: {
      displayOrder: "asc",
    },
  });

  if (existing.length > 0) {
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
    notes: record.notes,
    recordedById: record.recordedById,
    recordedByName: getMockAdminSession(divisionSlug).name,
    createdAt: record.createdAt,
  } satisfies PaymentItem;
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
      .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate))
      .map((record) => serializeMockPayment(record, categories, students, divisionSlug))
      .filter(Boolean) as PaymentItem[];
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultPaymentCategories(division.id);
  const { prisma } = await import("@/lib/prisma");

  const { from, to } = toUtcRange(options?.dateFrom, options?.dateTo);
  const payments = await prisma.payment.findMany({
    where: {
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
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          studentNumber: true,
        },
      },
      paymentType: {
        select: {
          id: true,
          name: true,
        },
      },
      recordedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
  });

  return payments.map((payment) => ({
    id: payment.id,
    studentId: payment.student.id,
    studentName: payment.student.name,
    studentNumber: payment.student.studentNumber,
    paymentTypeId: payment.paymentType.id,
    paymentTypeName: payment.paymentType.name,
    amount: payment.amount,
    paymentDate: toDateString(payment.paymentDate),
    method: payment.method,
    notes: payment.notes,
    recordedById: payment.recordedBy.id,
    recordedByName: payment.recordedBy.name,
    createdAt: payment.createdAt.toISOString(),
  })) satisfies PaymentItem[];
}

export async function createPayment(
  divisionSlug: string,
  actor: PaymentActor,
  input: PaymentInput,
) {
  if (isMockMode()) {
    const record = await updateMockState((state) => {
      const student = (state.studentsByDivision[divisionSlug] ?? []).find((item) => item.id === input.studentId);
      const category = (state.paymentCategoriesByDivision[divisionSlug] ?? []).find(
        (item) => item.id === input.paymentTypeId,
      );

      if (!student) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      if (!category) {
        throw notFound("수납 유형을 찾을 수 없습니다.");
      }

      const nextRecord: MockPaymentRecord = {
        id: `mock-payment-record-${divisionSlug}-${Date.now()}`,
        studentId: input.studentId,
        paymentTypeId: input.paymentTypeId,
        amount: input.amount,
        paymentDate: input.paymentDate,
        method: normalizeOptionalText(input.method),
        notes: normalizeOptionalText(input.notes),
        recordedById: actor.id,
        createdAt: new Date().toISOString(),
      };

      state.paymentRecordsByDivision[divisionSlug] = [
        nextRecord,
        ...(state.paymentRecordsByDivision[divisionSlug] ?? []),
      ];

      return nextRecord;
    });

    return (
      await listPayments(divisionSlug, {
        studentId: input.studentId,
        paymentTypeId: input.paymentTypeId,
      })
    ).find((item) => item.id === record.id) ?? null;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultPaymentCategories(division.id);
  const { prisma } = await import("@/lib/prisma");

  const [student, category] = await Promise.all([
    prisma.student.findFirst({
      where: {
        id: input.studentId,
        divisionId: division.id,
      },
      select: {
        id: true,
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

  if (!category) {
    throw notFound("수납 유형을 찾을 수 없습니다.");
  }

  const payment = await prisma.payment.create({
    data: {
      studentId: input.studentId,
      paymentTypeId: input.paymentTypeId,
      amount: input.amount,
      paymentDate: parseDateString(input.paymentDate),
      method: normalizeOptionalText(input.method),
      notes: normalizeOptionalText(input.notes),
      recordedById: actor.id,
    },
    include: {
      student: { select: { id: true, name: true, studentNumber: true } },
      paymentType: { select: { id: true, name: true } },
      recordedBy: { select: { id: true, name: true } },
    },
  });

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
    notes: payment.notes,
    recordedById: payment.recordedBy.id,
    recordedByName: payment.recordedBy.name,
    createdAt: payment.createdAt.toISOString(),
  } satisfies PaymentItem;
}

export async function updatePayment(
  divisionSlug: string,
  paymentId: string,
  input: PaymentInput,
) {
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

      if (!category) {
        throw notFound("수납 유형을 찾을 수 없습니다.");
      }

      state.paymentRecordsByDivision[divisionSlug] = current.map((record) =>
        record.id === paymentId
          ? {
              ...record,
              studentId: input.studentId,
              paymentTypeId: input.paymentTypeId,
              amount: input.amount,
              paymentDate: input.paymentDate,
              method: normalizeOptionalText(input.method),
              notes: normalizeOptionalText(input.notes),
            }
          : record,
      );
    });

    return (await listPayments(divisionSlug)).find((item) => item.id === paymentId) ?? null;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultPaymentCategories(division.id);
  const { prisma } = await import("@/lib/prisma");

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
    throw new Error("학생 정보를 찾을 수 없습니다.");
  }

  if (!category) {
    throw new Error("수납 유형을 찾을 수 없습니다.");
  }

  const updated = await prisma.payment.update({
    where: {
      id: paymentId,
    },
    data: {
      studentId: input.studentId,
      paymentTypeId: input.paymentTypeId,
      amount: input.amount,
      paymentDate: parseDateString(input.paymentDate),
      method: normalizeOptionalText(input.method),
      notes: normalizeOptionalText(input.notes),
    },
    include: {
      student: { select: { id: true, name: true, studentNumber: true } },
      paymentType: { select: { id: true, name: true } },
      recordedBy: { select: { id: true, name: true } },
    },
  });

  return {
    id: updated.id,
    studentId: updated.student.id,
    studentName: updated.student.name,
    studentNumber: updated.student.studentNumber,
    paymentTypeId: updated.paymentType.id,
    paymentTypeName: updated.paymentType.name,
    amount: updated.amount,
    paymentDate: toDateString(updated.paymentDate),
    method: updated.method,
    notes: updated.notes,
    recordedById: updated.recordedBy.id,
    recordedByName: updated.recordedBy.name,
    createdAt: updated.createdAt.toISOString(),
  } satisfies PaymentItem;
}

export async function deletePayment(divisionSlug: string, paymentId: string) {
  if (isMockMode()) {
    await updateMockState((state) => {
      const current = state.paymentRecordsByDivision[divisionSlug] ?? [];

      if (!current.some((record) => record.id === paymentId)) {
        throw new Error("수납 기록을 찾을 수 없습니다.");
      }

      state.paymentRecordsByDivision[divisionSlug] = current.filter((record) => record.id !== paymentId);
    });
    return true;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

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
    throw new Error("수납 기록을 찾을 수 없습니다.");
  }

  await prisma.payment.delete({
    where: {
      id: paymentId,
    },
  });

  return true;
}
