import { ExamType, StudentType } from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { recalculateStatusCache } from "@/lib/analytics/service";
import { getPrisma } from "@/lib/prisma";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";

async function recalculateEnrollmentStatuses(periodId: number, examNumbers: string[]) {
  const targetExamNumbers = Array.from(new Set(examNumbers.map((examNumber) => examNumber.trim()).filter(Boolean)));

  if (targetExamNumbers.length === 0) {
    return;
  }

  const students = await getPrisma().student.findMany({
    where: {
      examNumber: {
        in: targetExamNumbers,
      },
    },
    select: {
      examNumber: true,
      examType: true,
    },
  });
  const examNumbersByType = new Map<ExamType, string[]>();

  for (const student of students) {
    const groupedExamNumbers = examNumbersByType.get(student.examType) ?? [];
    groupedExamNumbers.push(student.examNumber);
    examNumbersByType.set(student.examType, groupedExamNumbers);
  }

  await Promise.all(
    Array.from(examNumbersByType.entries()).map(([examType, groupedExamNumbers]) =>
      recalculateStatusCache(periodId, examType, {
        examNumbers: groupedExamNumbers,
      }),
    ),
  );
}

export async function listPeriodEnrollments(periodId: number) {
  return getPrisma().periodEnrollment.findMany({
    where: { periodId },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          examType: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ student: { examType: "asc" } }, { student: { examNumber: "asc" } }],
  });
}

export async function previewEnrollmentPaste(periodId: number, text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedRows = lines.map((line) => {
    const cols = line.split("\t").map((c) => c.trim());
    return {
      examNumber: cols[0] ?? "",
      name: cols[1] ?? null,
    };
  });

  const validRows = parsedRows.filter((row) => row.examNumber);

  if (validRows.length === 0) {
    return { rows: [], totalCount: 0 };
  }

  const prisma = getPrisma();
  const examNumbers = validRows.map((row) => row.examNumber);

  const [existingStudents, existingEnrollments] = await Promise.all([
    prisma.student.findMany({
      where: { examNumber: { in: examNumbers } },
      select: { examNumber: true, name: true, examType: true, isActive: true },
    }),
    prisma.periodEnrollment.findMany({
      where: { periodId, examNumber: { in: examNumbers } },
      select: { examNumber: true },
    }),
  ]);

  const studentMap = new Map(existingStudents.map((student) => [student.examNumber, student]));
  const enrolledSet = new Set(existingEnrollments.map((enrollment) => enrollment.examNumber));

  const rows = validRows.map((row) => {
    const student = studentMap.get(row.examNumber) ?? null;
    let status: "ready" | "already_enrolled" | "not_found";

    if (!student) {
      status = "not_found";
    } else if (enrolledSet.has(row.examNumber)) {
      status = "already_enrolled";
    } else {
      status = "ready";
    }

    return {
      examNumber: row.examNumber,
      name: row.name,
      student,
      status,
    };
  });

  return { rows, totalCount: rows.length };
}

export async function executeEnrollmentPaste(input: {
  adminId: string;
  periodId: number;
  examNumbers: string[];
  ipAddress?: string | null;
}) {
  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    const currentPeriod = await tx.examPeriod.findUniqueOrThrow({
      where: { id: input.periodId },
      select: { startDate: true },
    });

    const students = await tx.student.findMany({
      where: { examNumber: { in: input.examNumbers } },
      select: { examNumber: true },
    });

    const validExamNumbers = students.map((student) => student.examNumber);

    if (validExamNumbers.length === 0) {
      return { enrolledCount: 0, upgradedCount: 0 };
    }

    const existingEnrollments = await tx.periodEnrollment.findMany({
      where: {
        periodId: input.periodId,
        examNumber: { in: validExamNumbers },
      },
      select: { examNumber: true },
    });
    const existingSet = new Set(existingEnrollments.map((enrollment) => enrollment.examNumber));
    const newExamNumbers = validExamNumbers.filter((examNumber) => !existingSet.has(examNumber));

    if (newExamNumbers.length > 0) {
      await tx.periodEnrollment.createMany({
        data: newExamNumbers.map((examNumber) => ({
          periodId: input.periodId,
          examNumber,
        })),
        skipDuplicates: true,
      });
    }

    const priorEnrollments = await tx.periodEnrollment.findMany({
      where: {
        examNumber: { in: newExamNumbers },
        period: { startDate: { lt: currentPeriod.startDate } },
      },
      select: { examNumber: true },
    });

    const examNumbersToUpgrade = [...new Set(priorEnrollments.map((enrollment) => enrollment.examNumber))];
    let upgradedCount = 0;

    if (examNumbersToUpgrade.length > 0) {
      const updateResult = await tx.student.updateMany({
        where: {
          examNumber: { in: examNumbersToUpgrade },
          studentType: StudentType.NEW,
        },
        data: { studentType: StudentType.EXISTING },
      });
      upgradedCount = updateResult.count;
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "PERIOD_ENROLLMENT_ADD",
        targetType: "ExamPeriod",
        targetId: String(input.periodId),
        before: toAuditJson(null),
        after: toAuditJson({
          examNumbers: newExamNumbers,
          skippedExamNumbers: validExamNumbers.filter((examNumber) => existingSet.has(examNumber)),
          upgradedToExisting: examNumbersToUpgrade,
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return { enrolledCount: newExamNumbers.length, upgradedCount };
  });

  await recalculateEnrollmentStatuses(input.periodId, input.examNumbers);
  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}

export async function ensurePeriodEnrollments(periodId: number, examNumbers: string[]) {
  const normalizedExamNumbers = Array.from(
    new Set(
      examNumbers
        .map((examNumber) => examNumber.trim())
        .filter(Boolean),
    ),
  );

  if (normalizedExamNumbers.length === 0) {
    return { enrolledCount: 0 };
  }

  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    const currentPeriod = await tx.examPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: { startDate: true },
    });

    const students = await tx.student.findMany({
      where: { examNumber: { in: normalizedExamNumbers } },
      select: { examNumber: true },
    });

    const validExamNumbers = students.map((student) => student.examNumber);

    if (validExamNumbers.length === 0) {
      return { enrolledCount: 0 };
    }

    await tx.periodEnrollment.createMany({
      data: validExamNumbers.map((examNumber) => ({
        periodId,
        examNumber,
      })),
      skipDuplicates: true,
    });

    const priorEnrollments = await tx.periodEnrollment.findMany({
      where: {
        examNumber: { in: validExamNumbers },
        period: { startDate: { lt: currentPeriod.startDate } },
      },
      select: { examNumber: true },
    });

    const examNumbersToUpgrade = [...new Set(priorEnrollments.map((enrollment) => enrollment.examNumber))];

    if (examNumbersToUpgrade.length > 0) {
      await tx.student.updateMany({
        where: {
          examNumber: { in: examNumbersToUpgrade },
          studentType: StudentType.NEW,
        },
        data: { studentType: StudentType.EXISTING },
      });
    }

    return { enrolledCount: validExamNumbers.length };
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}

export async function removeEnrollment(input: {
  adminId: string;
  periodId: number;
  examNumber: string;
  ipAddress?: string | null;
}) {
  const prisma = getPrisma();

  await prisma.periodEnrollment.delete({
    where: {
      periodId_examNumber: {
        periodId: input.periodId,
        examNumber: input.examNumber,
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: "PERIOD_ENROLLMENT_REMOVE",
      targetType: "ExamPeriod",
      targetId: String(input.periodId),
      before: toAuditJson({ examNumber: input.examNumber }),
      after: toAuditJson(null),
      ipAddress: input.ipAddress ?? null,
    },
  });

  await recalculateEnrollmentStatuses(input.periodId, [input.examNumber]);
  revalidateAdminReadCaches({ analytics: true, periods: false });
}

export async function bulkRemoveEnrollments(input: {
  adminId: string;
  periodId: number;
  examNumbers?: string[];
  removeAll?: boolean;
  ipAddress?: string | null;
}) {
  const requestedExamNumbers = Array.from(
    new Set(
      (input.examNumbers ?? [])
        .map((examNumber) => examNumber.trim())
        .filter(Boolean),
    ),
  );

  if (!input.removeAll && requestedExamNumbers.length === 0) {
    throw new Error("해제할 수강생을 선택해 주세요.");
  }

  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    const targets = await tx.periodEnrollment.findMany({
      where: {
        periodId: input.periodId,
        examNumber: input.removeAll ? undefined : { in: requestedExamNumbers },
      },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            examType: true,
          },
        },
      },
    });

    if (targets.length === 0) {
      throw new Error("해제할 수강생이 없습니다.");
    }

    const examNumbers = targets.map((target) => target.examNumber);

    const deleteResult = await tx.periodEnrollment.deleteMany({
      where: {
        periodId: input.periodId,
        examNumber: { in: examNumbers },
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "PERIOD_ENROLLMENT_BULK_REMOVE",
        targetType: "ExamPeriod",
        targetId: String(input.periodId),
        before: toAuditJson(targets.map((target) => ({
          examNumber: target.examNumber,
          name: target.student.name,
          examType: target.student.examType,
        }))),
        after: toAuditJson({ removedCount: deleteResult.count }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      removedCount: deleteResult.count,
      examNumbers,
    };
  });

  await recalculateEnrollmentStatuses(input.periodId, result.examNumbers);
  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}
