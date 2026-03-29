import { EnrollmentStatus, PaymentCategory, PaymentStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

const COUNTED_PAYMENT_STATUSES: PaymentStatus[] = ["APPROVED", "PARTIAL_REFUNDED"];
const ACTIVEISH_ENROLLMENT_STATUSES: EnrollmentStatus[] = ["PENDING", "ACTIVE", "COMPLETED"];
const WITHDRAWN_ENROLLMENT_STATUSES: EnrollmentStatus[] = ["WITHDRAWN", "CANCELLED"];

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthKeys(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function courseNameOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? "강좌 미지정";
}

function isInRange(value: Date | null | undefined, start: Date, end: Date) {
  return Boolean(value && value >= start && value < end);
}

export type YearEndMonthlyRow = {
  monthKey: string;
  grossRevenue: number;
  approvedNetRevenue: number;
  refundTotal: number;
  collectedNetRevenue: number;
  discountTotal: number;
  paymentCount: number;
  newEnrollments: number;
  withdrawnEnrollments: number;
  specialLectureRevenue: number;
  writtenPasses: number;
  finalPasses: number;
};

export type YearEndCategoryRow = {
  category: PaymentCategory;
  paymentCount: number;
  grossAmount: number;
  approvedNetAmount: number;
  refundAmount: number;
  collectedNetAmount: number;
  discountAmount: number;
};

export type YearEndCohortRow = {
  cohortId: string;
  cohortName: string;
  examCategory: string;
  enrollCount: number;
  activeCount: number;
  revenue: number;
  averageRevenue: number;
};

export type YearEndSpecialLectureRow = {
  lectureId: string;
  lectureName: string;
  lectureType: string;
  enrollCount: number;
  activeStudentCount: number;
  revenue: number;
  pendingSettlementAmount: number;
  instructorNames: string[];
};

export type YearEndStudentRow = {
  examNumber: string;
  name: string;
  mobile: string | null;
  totalRegisteredAmount: number;
  enrollmentCount: number;
  latestEnrollmentAt: string;
  enrollments: Array<{
    id: string;
    name: string;
    status: EnrollmentStatus;
  }>;
};

export type YearEndReportData = {
  summary: {
    year: number;
    totalGrossRevenue: number;
    totalApprovedNetRevenue: number;
    totalCollectedNetRevenue: number;
    totalRefundAmount: number;
    totalDiscountAmount: number;
    paymentCount: number;
    newEnrollmentCount: number;
    withdrawnEnrollmentCount: number;
    currentActiveEnrollmentCount: number;
    writtenPassCount: number;
    finalPassCount: number;
    specialLectureRevenue: number;
    pendingSpecialLectureSettlementAmount: number;
  };
  monthlyRows: YearEndMonthlyRow[];
  categoryRows: YearEndCategoryRow[];
  cohortRows: YearEndCohortRow[];
  specialLectureRows: YearEndSpecialLectureRow[];
  studentRows: YearEndStudentRow[];
};

export async function getYearEndReport(year: number): Promise<YearEndReportData> {
  const prisma = getPrisma();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const monthKeys = getMonthKeys(year);

  const [payments, refunds, enrollments, withdrawnEvents, currentActiveEnrollmentCount, graduateRecords, settlements] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: { in: COUNTED_PAYMENT_STATUSES },
        processedAt: { gte: yearStart, lt: yearEnd },
      },
      select: {
        id: true,
        examNumber: true,
        category: true,
        grossAmount: true,
        discountAmount: true,
        netAmount: true,
        processedAt: true,
      },
    }),
    prisma.refund.findMany({
      where: {
        status: "COMPLETED",
        processedAt: { gte: yearStart, lt: yearEnd },
      },
      select: {
        amount: true,
        processedAt: true,
        payment: {
          select: {
            category: true,
          },
        },
      },
    }),
    prisma.courseEnrollment.findMany({
      where: {
        createdAt: { gte: yearStart, lt: yearEnd },
      },
      select: {
        id: true,
        examNumber: true,
        finalFee: true,
        status: true,
        createdAt: true,
        cohort: {
          select: {
            id: true,
            name: true,
            examCategory: true,
          },
        },
        specialLecture: {
          select: {
            id: true,
            name: true,
            lectureType: true,
            subjects: {
              select: {
                instructor: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        student: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.courseEnrollment.findMany({
      where: {
        status: { in: WITHDRAWN_ENROLLMENT_STATUSES },
        updatedAt: { gte: yearStart, lt: yearEnd },
      },
      select: {
        status: true,
        updatedAt: true,
      },
    }),
    prisma.courseEnrollment.count({
      where: { status: "ACTIVE" },
    }),
    prisma.graduateRecord.findMany({
      where: {
        OR: [
          { writtenPassDate: { gte: yearStart, lt: yearEnd } },
          { finalPassDate: { gte: yearStart, lt: yearEnd } },
        ],
      },
      select: {
        writtenPassDate: true,
        finalPassDate: true,
      },
    }),
    prisma.specialLectureSettlement.findMany({
      where: {
        settlementMonth: {
          gte: `${year}-01`,
          lte: `${year}-12`,
        },
      },
      select: {
        specialLectureId: true,
        instructorAmount: true,
        status: true,
      },
    }),
  ]);

  const monthlyMap = new Map<string, YearEndMonthlyRow>(
    monthKeys.map((monthKey) => [
      monthKey,
      {
        monthKey,
        grossRevenue: 0,
        approvedNetRevenue: 0,
        refundTotal: 0,
        collectedNetRevenue: 0,
        discountTotal: 0,
        paymentCount: 0,
        newEnrollments: 0,
        withdrawnEnrollments: 0,
        specialLectureRevenue: 0,
        writtenPasses: 0,
        finalPasses: 0,
      },
    ]),
  );

  const categoryMap = new Map<PaymentCategory, YearEndCategoryRow>();
  const cohortMap = new Map<
    string,
    {
      cohortId: string;
      cohortName: string;
      examCategory: string;
      enrollCount: number;
      activeCount: number;
      revenue: number;
    }
  >();
  const lectureMap = new Map<
    string,
    {
      lectureId: string;
      lectureName: string;
      lectureType: string;
      enrollCount: number;
      activeStudentCount: number;
      revenue: number;
      instructorNames: Set<string>;
    }
  >();
  const studentMap = new Map<
    string,
    {
      examNumber: string;
      name: string;
      mobile: string | null;
      totalRegisteredAmount: number;
      enrollmentCount: number;
      latestEnrollmentAt: Date;
    }
  >();

  const pendingSettlementByLecture = new Map<string, number>();
  for (const settlement of settlements) {
    if (settlement.status !== "PENDING") continue;
    pendingSettlementByLecture.set(
      settlement.specialLectureId,
      (pendingSettlementByLecture.get(settlement.specialLectureId) ?? 0) + settlement.instructorAmount,
    );
  }

  for (const payment of payments) {
    const monthKey = formatMonthKey(payment.processedAt);
    const month = monthlyMap.get(monthKey);
    if (month) {
      month.grossRevenue += payment.grossAmount;
      month.approvedNetRevenue += payment.netAmount;
      month.discountTotal += payment.discountAmount;
      month.paymentCount += 1;
    }

    const category = categoryMap.get(payment.category) ?? {
      category: payment.category,
      paymentCount: 0,
      grossAmount: 0,
      approvedNetAmount: 0,
      refundAmount: 0,
      collectedNetAmount: 0,
      discountAmount: 0,
    };
    category.paymentCount += 1;
    category.grossAmount += payment.grossAmount;
    category.approvedNetAmount += payment.netAmount;
    category.discountAmount += payment.discountAmount;
    categoryMap.set(payment.category, category);
  }

  for (const refund of refunds) {
    const monthKey = formatMonthKey(refund.processedAt);
    const month = monthlyMap.get(monthKey);
    if (month) {
      month.refundTotal += refund.amount;
    }

    const category = categoryMap.get(refund.payment.category) ?? {
      category: refund.payment.category,
      paymentCount: 0,
      grossAmount: 0,
      approvedNetAmount: 0,
      refundAmount: 0,
      collectedNetAmount: 0,
      discountAmount: 0,
    };
    category.refundAmount += refund.amount;
    categoryMap.set(refund.payment.category, category);
  }

  for (const enrollment of enrollments) {
    const monthKey = formatMonthKey(enrollment.createdAt);
    const month = monthlyMap.get(monthKey);
    if (month) {
      month.newEnrollments += 1;
      if (enrollment.specialLecture) {
        month.specialLectureRevenue += enrollment.finalFee;
      }
    }

    if (enrollment.cohort) {
      const cohort = cohortMap.get(enrollment.cohort.id) ?? {
        cohortId: enrollment.cohort.id,
        cohortName: enrollment.cohort.name,
        examCategory: enrollment.cohort.examCategory,
        enrollCount: 0,
        activeCount: 0,
        revenue: 0,
      };
      cohort.enrollCount += 1;
      cohort.revenue += enrollment.finalFee;
      if (ACTIVEISH_ENROLLMENT_STATUSES.includes(enrollment.status)) {
        cohort.activeCount += 1;
      }
      cohortMap.set(enrollment.cohort.id, cohort);
    }

    if (enrollment.specialLecture) {
      const lecture = lectureMap.get(enrollment.specialLecture.id) ?? {
        lectureId: enrollment.specialLecture.id,
        lectureName: enrollment.specialLecture.name,
        lectureType: enrollment.specialLecture.lectureType,
        enrollCount: 0,
        activeStudentCount: 0,
        revenue: 0,
        instructorNames: new Set<string>(),
      };
      lecture.enrollCount += 1;
      lecture.revenue += enrollment.finalFee;
      if (ACTIVEISH_ENROLLMENT_STATUSES.includes(enrollment.status)) {
        lecture.activeStudentCount += 1;
      }
      for (const subject of enrollment.specialLecture.subjects) {
        lecture.instructorNames.add(subject.instructor.name);
      }
      lectureMap.set(enrollment.specialLecture.id, lecture);
    }

    const student = studentMap.get(enrollment.examNumber) ?? {
      examNumber: enrollment.examNumber,
      name: enrollment.student.name,
      mobile: enrollment.student.phone ?? null,
      totalRegisteredAmount: 0,
      enrollmentCount: 0,
      latestEnrollmentAt: enrollment.createdAt,
    };
    student.totalRegisteredAmount += enrollment.finalFee;
    student.enrollmentCount += 1;
    if (enrollment.createdAt > student.latestEnrollmentAt) {
      student.latestEnrollmentAt = enrollment.createdAt;
    }
    studentMap.set(enrollment.examNumber, student);
  }

  for (const event of withdrawnEvents) {
    const monthKey = formatMonthKey(event.updatedAt);
    const month = monthlyMap.get(monthKey);
    if (month) {
      month.withdrawnEnrollments += 1;
    }
  }

  let writtenPassCount = 0;
  let finalPassCount = 0;
  for (const graduateRecord of graduateRecords) {
    if (isInRange(graduateRecord.writtenPassDate, yearStart, yearEnd) && graduateRecord.writtenPassDate) {
      writtenPassCount += 1;
      const month = monthlyMap.get(formatMonthKey(graduateRecord.writtenPassDate));
      if (month) {
        month.writtenPasses += 1;
      }
    }
    if (isInRange(graduateRecord.finalPassDate, yearStart, yearEnd) && graduateRecord.finalPassDate) {
      finalPassCount += 1;
      const month = monthlyMap.get(formatMonthKey(graduateRecord.finalPassDate));
      if (month) {
        month.finalPasses += 1;
      }
    }
  }

  const monthlyRows = monthKeys.map((monthKey) => {
    const row = monthlyMap.get(monthKey)!;
    return {
      ...row,
      collectedNetRevenue: row.approvedNetRevenue - row.refundTotal,
    };
  });

  const categoryRows = Array.from(categoryMap.values())
    .map((row) => ({
      ...row,
      collectedNetAmount: row.approvedNetAmount - row.refundAmount,
    }))
    .sort((a, b) => b.collectedNetAmount - a.collectedNetAmount);

  const cohortRows: YearEndCohortRow[] = Array.from(cohortMap.values())
    .map((row) => ({
      cohortId: row.cohortId,
      cohortName: row.cohortName,
      examCategory: row.examCategory,
      enrollCount: row.enrollCount,
      activeCount: row.activeCount,
      revenue: row.revenue,
      averageRevenue: row.enrollCount > 0 ? Math.round(row.revenue / row.enrollCount) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const specialLectureRows: YearEndSpecialLectureRow[] = Array.from(lectureMap.values())
    .map((row) => ({
      lectureId: row.lectureId,
      lectureName: row.lectureName,
      lectureType: row.lectureType,
      enrollCount: row.enrollCount,
      activeStudentCount: row.activeStudentCount,
      revenue: row.revenue,
      pendingSettlementAmount: pendingSettlementByLecture.get(row.lectureId) ?? 0,
      instructorNames: [...row.instructorNames],
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const topStudentBase = Array.from(studentMap.values())
    .sort((a, b) => {
      if (b.totalRegisteredAmount !== a.totalRegisteredAmount) {
        return b.totalRegisteredAmount - a.totalRegisteredAmount;
      }
      return b.latestEnrollmentAt.getTime() - a.latestEnrollmentAt.getTime();
    })
    .slice(0, 12);

  const studentDetails = topStudentBase.length
    ? await prisma.student.findMany({
        where: {
          examNumber: {
            in: topStudentBase.map((row) => row.examNumber),
          },
        },
        select: {
          examNumber: true,
          courseEnrollments: {
            orderBy: [{ createdAt: "desc" }],
            select: {
              id: true,
              status: true,
              cohort: { select: { name: true } },
              product: { select: { name: true } },
              specialLecture: { select: { name: true } },
            },
          },
        },
      })
    : [];

  const studentDetailMap = new Map(
    studentDetails.map((student) => [student.examNumber, student]),
  );

  const studentRows: YearEndStudentRow[] = topStudentBase.map((row) => ({
    examNumber: row.examNumber,
    name: row.name,
    mobile: row.mobile,
    totalRegisteredAmount: row.totalRegisteredAmount,
    enrollmentCount: row.enrollmentCount,
    latestEnrollmentAt: row.latestEnrollmentAt.toISOString(),
    enrollments:
      studentDetailMap.get(row.examNumber)?.courseEnrollments.map((item) => ({
        id: item.id,
        name: courseNameOf(item),
        status: item.status,
      })) ?? [],
  }));

  const totalGrossRevenue = categoryRows.reduce((sum, row) => sum + row.grossAmount, 0);
  const totalApprovedNetRevenue = categoryRows.reduce((sum, row) => sum + row.approvedNetAmount, 0);
  const totalRefundAmount = categoryRows.reduce((sum, row) => sum + row.refundAmount, 0);
  const totalDiscountAmount = categoryRows.reduce((sum, row) => sum + row.discountAmount, 0);
  const totalCollectedNetRevenue = totalApprovedNetRevenue - totalRefundAmount;
  const specialLectureRevenue = specialLectureRows.reduce((sum, row) => sum + row.revenue, 0);
  const pendingSpecialLectureSettlementAmount = Array.from(pendingSettlementByLecture.values()).reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    summary: {
      year,
      totalGrossRevenue,
      totalApprovedNetRevenue,
      totalCollectedNetRevenue,
      totalRefundAmount,
      totalDiscountAmount,
      paymentCount: payments.length,
      newEnrollmentCount: enrollments.length,
      withdrawnEnrollmentCount: withdrawnEvents.length,
      currentActiveEnrollmentCount,
      writtenPassCount,
      finalPassCount,
      specialLectureRevenue,
      pendingSpecialLectureSettlementAmount,
    },
    monthlyRows,
    categoryRows,
    cohortRows,
    specialLectureRows,
    studentRows,
  };
}
