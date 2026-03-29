import { EnrollmentStatus, SettlementStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

const ACTIVE_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  "ACTIVE",
  "COMPLETED",
  "PENDING",
];

function courseNameOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? "강좌 미지정";
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRecentMonthKeys(months: number) {
  const today = new Date();
  const keys: string[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const target = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    keys.push(formatMonthKey(target));
  }
  return keys;
}

export type SpecialLectureRevenueRow = {
  lectureId: string;
  lectureName: string;
  lectureType: string;
  examCategory: string | null;
  isActive: boolean;
  startDate: string;
  endDate: string;
  subjectCount: number;
  instructorNames: string[];
  enrollCount: number;
  totalRevenue: number;
  instructorShare: number;
  academyShare: number;
  avgRevenuePerStudent: number;
  pendingSettlementAmount: number;
  latestSettlementMonth: string | null;
};

export type SpecialLectureInstructorRow = {
  instructorId: string;
  instructorName: string;
  lectureCount: number;
  subjectCount: number;
  totalRevenue: number;
  totalInstructorShare: number;
};

export type SpecialLectureRecentEnrollmentRow = {
  enrollmentId: string;
  lectureId: string;
  lectureName: string;
  examNumber: string;
  studentName: string;
  mobile: string | null;
  finalFee: number;
  status: EnrollmentStatus;
  createdAt: string;
  enrollments: Array<{
    id: string;
    name: string;
    status: EnrollmentStatus;
  }>;
};

export type SpecialLectureRevenueAnalytics = {
  summary: {
    lectureCount: number;
    activeLectureCount: number;
    totalEnrollments: number;
    totalRevenue: number;
    totalInstructorShare: number;
    totalAcademyShare: number;
    pendingSettlementAmount: number;
    pendingSettlementCount: number;
    paidSettlementCount: number;
  };
  monthlyTrend: Array<{
    monthKey: string;
    revenue: number;
    enrollCount: number;
  }>;
  lectureRows: SpecialLectureRevenueRow[];
  instructorRows: SpecialLectureInstructorRow[];
  recentEnrollments: SpecialLectureRecentEnrollmentRow[];
};

export async function getSpecialLectureRevenueAnalytics(): Promise<SpecialLectureRevenueAnalytics> {
  const prisma = getPrisma();
  const monthKeys = getRecentMonthKeys(6);
  const firstMonthKey = monthKeys[0] ?? formatMonthKey(new Date());

  const [lectures, recentEnrollments, settlements] = await Promise.all([
    prisma.specialLecture.findMany({
      include: {
        subjects: {
          include: {
            instructor: { select: { id: true, name: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
        enrollments: {
          where: { status: { in: ACTIVE_ENROLLMENT_STATUSES } },
          select: {
            id: true,
            examNumber: true,
            finalFee: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    }),
    prisma.courseEnrollment.findMany({
      where: {
        specialLectureId: { not: null },
        status: { in: ACTIVE_ENROLLMENT_STATUSES },
      },
      include: {
        student: {
          select: {
            name: true,
            phone: true,
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
        },
        specialLecture: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.specialLectureSettlement.findMany({
      where: {
        settlementMonth: { gte: firstMonthKey },
      },
      select: {
        specialLectureId: true,
        instructorAmount: true,
        settlementMonth: true,
        status: true,
        createdAt: true,
      },
      orderBy: [{ settlementMonth: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const settlementMap = new Map<
    string,
    Array<{
      specialLectureId: string;
      instructorAmount: number;
      settlementMonth: string;
      status: SettlementStatus;
    }>
  >();

  for (const settlement of settlements) {
    const current = settlementMap.get(settlement.specialLectureId) ?? [];
    current.push(settlement);
    settlementMap.set(settlement.specialLectureId, current);
  }

  const instructorAccumulator = new Map<
    string,
    {
      instructorId: string;
      instructorName: string;
      lectureIds: Set<string>;
      subjectCount: number;
      totalRevenue: number;
      totalInstructorShare: number;
    }
  >();

  const monthlyRevenueMap = new Map<string, { revenue: number; enrollCount: number }>(
    monthKeys.map((key) => [key, { revenue: 0, enrollCount: 0 }]),
  );

  const lectureRows: SpecialLectureRevenueRow[] = lectures.map((lecture) => {
    const totalRevenue = lecture.enrollments.reduce((sum, item) => sum + item.finalFee, 0);
    const enrollCount = lecture.enrollments.length;
    const totalSubjectPrice = lecture.subjects.reduce((sum, item) => sum + item.price, 0);

    let instructorShare = 0;
    for (const subject of lecture.subjects) {
      const subjectRevenue = lecture.isMultiSubject
        ? totalSubjectPrice > 0
          ? Math.round(totalRevenue * (subject.price / totalSubjectPrice))
          : 0
        : totalRevenue;
      const subjectInstructorShare = Math.round(
        (subjectRevenue * subject.instructorRate) / 100,
      );
      instructorShare += subjectInstructorShare;

      const existing = instructorAccumulator.get(subject.instructorId) ?? {
        instructorId: subject.instructorId,
        instructorName: subject.instructor.name,
        lectureIds: new Set<string>(),
        subjectCount: 0,
        totalRevenue: 0,
        totalInstructorShare: 0,
      };
      existing.lectureIds.add(lecture.id);
      existing.subjectCount += 1;
      existing.totalRevenue += subjectRevenue;
      existing.totalInstructorShare += subjectInstructorShare;
      instructorAccumulator.set(subject.instructorId, existing);
    }

    for (const enrollment of lecture.enrollments) {
      const monthKey = formatMonthKey(enrollment.createdAt);
      const currentMonth = monthlyRevenueMap.get(monthKey);
      if (currentMonth) {
        currentMonth.revenue += enrollment.finalFee;
        currentMonth.enrollCount += 1;
      }
    }

    const lectureSettlements = settlementMap.get(lecture.id) ?? [];
    const pendingSettlementAmount = lectureSettlements
      .filter((item) => item.status === "PENDING")
      .reduce((sum, item) => sum + item.instructorAmount, 0);
    const latestSettlementMonth =
      lectureSettlements
        .map((item) => item.settlementMonth)
        .sort((a, b) => b.localeCompare(a))[0] ?? null;

    return {
      lectureId: lecture.id,
      lectureName: lecture.name,
      lectureType: lecture.lectureType,
      examCategory: lecture.examCategory ?? null,
      isActive: lecture.isActive,
      startDate: lecture.startDate.toISOString(),
      endDate: lecture.endDate.toISOString(),
      subjectCount: lecture.subjects.length,
      instructorNames: [...new Set(lecture.subjects.map((item) => item.instructor.name))],
      enrollCount,
      totalRevenue,
      instructorShare,
      academyShare: totalRevenue - instructorShare,
      avgRevenuePerStudent: enrollCount > 0 ? Math.round(totalRevenue / enrollCount) : 0,
      pendingSettlementAmount,
      latestSettlementMonth,
    };
  });

  const instructorRows: SpecialLectureInstructorRow[] = Array.from(
    instructorAccumulator.values(),
  )
    .map((item) => ({
      instructorId: item.instructorId,
      instructorName: item.instructorName,
      lectureCount: item.lectureIds.size,
      subjectCount: item.subjectCount,
      totalRevenue: item.totalRevenue,
      totalInstructorShare: item.totalInstructorShare,
    }))
    .sort((a, b) => b.totalInstructorShare - a.totalInstructorShare);

  const recentEnrollmentRows: SpecialLectureRecentEnrollmentRow[] = recentEnrollments.map(
    (enrollment) => ({
      enrollmentId: enrollment.id,
      lectureId: enrollment.specialLectureId ?? "",
      lectureName: enrollment.specialLecture?.name ?? "특강 미지정",
      examNumber: enrollment.examNumber,
      studentName: enrollment.student.name,
      mobile: enrollment.student.phone ?? null,
      finalFee: enrollment.finalFee,
      status: enrollment.status,
      createdAt: enrollment.createdAt.toISOString(),
      enrollments: enrollment.student.courseEnrollments.map((item) => ({
        id: item.id,
        name: courseNameOf(item),
        status: item.status,
      })),
    }),
  );

  const pendingSettlementCount = settlements.filter((item) => item.status === "PENDING").length;
  const paidSettlementCount = settlements.filter((item) => item.status === "PAID").length;
  const pendingSettlementAmount = settlements
    .filter((item) => item.status === "PENDING")
    .reduce((sum, item) => sum + item.instructorAmount, 0);

  const totalRevenue = lectureRows.reduce((sum, item) => sum + item.totalRevenue, 0);
  const totalInstructorShare = lectureRows.reduce(
    (sum, item) => sum + item.instructorShare,
    0,
  );
  const totalAcademyShare = lectureRows.reduce((sum, item) => sum + item.academyShare, 0);

  return {
    summary: {
      lectureCount: lectureRows.length,
      activeLectureCount: lectureRows.filter((item) => item.isActive).length,
      totalEnrollments: lectureRows.reduce((sum, item) => sum + item.enrollCount, 0),
      totalRevenue,
      totalInstructorShare,
      totalAcademyShare,
      pendingSettlementAmount,
      pendingSettlementCount,
      paidSettlementCount,
    },
    monthlyTrend: monthKeys.map((monthKey) => ({
      monthKey,
      revenue: monthlyRevenueMap.get(monthKey)?.revenue ?? 0,
      enrollCount: monthlyRevenueMap.get(monthKey)?.enrollCount ?? 0,
    })),
    lectureRows: lectureRows.sort((a, b) => b.totalRevenue - a.totalRevenue),
    instructorRows,
    recentEnrollments: recentEnrollmentRows,
  };
}
