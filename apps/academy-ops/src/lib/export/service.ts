import { EnrollmentStatus, ExamType } from "@prisma/client";
import { sanitizeAbsenceNoteDisplay } from "@/lib/absence-notes/system-note";
import { ATTEND_TYPE_LABEL, ENROLLMENT_STATUS_LABEL, EXAM_TYPE_LABEL, SCORE_SOURCE_LABEL, STUDENT_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate, formatFileDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { NON_PLACEHOLDER_STUDENT_FILTER } from "@/lib/students/placeholder";

export type StudentExportFilters = {
  examType?: ExamType;
  activeOnly?: boolean;
  generation?: number;
  includeEnrollments?: boolean;
  includePoints?: boolean;
};

export type ScoreExportFilters = {
  periodId?: number;
  examType?: ExamType;
};

export async function getStudentExportRows(filters: StudentExportFilters) {
  const prisma = getPrisma();

  const students = await prisma.student.findMany({
    where: {
      AND: [
        NON_PLACEHOLDER_STUDENT_FILTER,
        {
          examType: filters.examType,
          isActive: filters.activeOnly === false ? undefined : true,
          generation: filters.generation,
        },
      ],
    },
    orderBy: [{ examType: "asc" }, { generation: "desc" }, { examNumber: "asc" }],
    select: {
      examNumber: true,
      name: true,
      phone: true,
      generation: true,
      className: true,
      examType: true,
      studentType: true,
      onlineId: true,
      registeredAt: true,
      isActive: true,
      note: true,
      createdAt: true,
    },
  });

  const examNumbers = students.map((s) => s.examNumber);

  // 현재 수강 강좌 (ACTIVE 상태인 CourseEnrollment → cohort/product 이름 추출)
  const enrollmentMap = new Map<string, string>();
  if (filters.includeEnrollments !== false && examNumbers.length > 0) {
    const activeEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        examNumber: { in: examNumbers },
        status: "ACTIVE",
      },
      select: {
        examNumber: true,
        courseType: true,
        cohortId: true,
        productId: true,
        specialLectureId: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 관련 이름을 별도 조회
    const cohortIds = [...new Set(activeEnrollments.map((e) => e.cohortId).filter(Boolean) as string[])];
    const productIds = [...new Set(activeEnrollments.map((e) => e.productId).filter(Boolean) as string[])];
    const lectureIds = [...new Set(activeEnrollments.map((e) => e.specialLectureId).filter(Boolean) as string[])];

    const [cohorts, products, lectures] = await Promise.all([
      cohortIds.length > 0
        ? prisma.cohort.findMany({ where: { id: { in: cohortIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      productIds.length > 0
        ? prisma.comprehensiveCourseProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      lectureIds.length > 0
        ? prisma.specialLecture.findMany({ where: { id: { in: lectureIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);

    const cohortNameById = new Map(cohorts.map((c) => [c.id, c.name]));
    const productNameById = new Map(products.map((p) => [p.id, p.name]));
    const lectureNameById = new Map(lectures.map((l) => [l.id, l.name]));

    for (const enrollment of activeEnrollments) {
      if (!enrollmentMap.has(enrollment.examNumber)) {
        const courseName =
          (enrollment.cohortId ? cohortNameById.get(enrollment.cohortId) : undefined) ??
          (enrollment.productId ? productNameById.get(enrollment.productId) : undefined) ??
          (enrollment.specialLectureId ? lectureNameById.get(enrollment.specialLectureId) : undefined) ??
          enrollment.courseType;
        enrollmentMap.set(enrollment.examNumber, courseName);
      }
    }
  }

  // 포인트 잔액 (amount 합산)
  const pointMap = new Map<string, number>();
  if (filters.includePoints !== false && examNumbers.length > 0) {
    const pointRows = await prisma.pointLog.groupBy({
      by: ["examNumber"],
      where: { examNumber: { in: examNumbers } },
      _sum: { amount: true },
    });
    for (const row of pointRows) {
      pointMap.set(row.examNumber, row._sum.amount ?? 0);
    }
  }

  return {
    fileName: `수강생명단_${formatFileDate()}`,
    sheetName: "Students",
    rows: students.map((student) => ({
      examNumber: student.examNumber,
      name: student.name,
      phone: student.phone ?? "",
      generation: student.generation ?? "",
      className: student.className ?? "",
      examType: EXAM_TYPE_LABEL[student.examType],
      studentType: STUDENT_TYPE_LABEL[student.studentType],
      onlineId: student.onlineId ?? "",
      registeredAt: student.registeredAt ? formatDate(student.registeredAt) : "",
      createdAt: formatDate(student.createdAt),
      isActive: student.isActive ? "활성" : "비활성",
      note: student.note ?? "",
      activeCourse: enrollmentMap.get(student.examNumber) ?? "",
      pointBalance: pointMap.get(student.examNumber) ?? 0,
    })),
  };
}

// ----- 수강 등록 기반 학생 내보내기 -----

export type EnrollmentStudentExportFilters = {
  cohortId?: string;
  enrollmentStatus?: EnrollmentStatus;
  startDateFrom?: string; // YYYY-MM-DD
  startDateTo?: string;   // YYYY-MM-DD
};

export async function getEnrollmentStudentExportRows(filters: EnrollmentStudentExportFilters) {
  const prisma = getPrisma();

  // 수강 등록 조회
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      cohortId: filters.cohortId ?? undefined,
      status: filters.enrollmentStatus ?? undefined,
      startDate: {
        gte: filters.startDateFrom ? new Date(filters.startDateFrom) : undefined,
        lte: filters.startDateTo ? new Date(filters.startDateTo + "T23:59:59") : undefined,
      },
      student: NON_PLACEHOLDER_STUDENT_FILTER,
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
          generation: true,
          className: true,
          examType: true,
          studentType: true,
          isActive: true,
        },
      },
      cohort: {
        select: { name: true },
      },
    },
  });

  // 납부액: 해당 수강 등록의 Payment(취소 제외) netAmount 합산
  const enrollmentIds = enrollments.map((e) => e.id);
  const paymentRows =
    enrollmentIds.length > 0
      ? await prisma.payment.groupBy({
          by: ["enrollmentId"],
          where: {
            enrollmentId: { in: enrollmentIds },
            status: { not: "CANCELLED" },
          },
          _sum: { netAmount: true },
        })
      : [];
  const paidAmountMap = new Map<string, number>();
  for (const row of paymentRows) {
    if (row.enrollmentId) {
      paidAmountMap.set(row.enrollmentId, row._sum.netAmount ?? 0);
    }
  }

  return {
    fileName: `수강등록명단_${formatFileDate()}`,
    sheetName: "Enrollments",
    rows: enrollments.map((e) => {
      const paidAmount = paidAmountMap.get(e.id) ?? 0;
      return {
        examNumber: e.student.examNumber,
        name: e.student.name,
        phone: e.student.phone ?? "",
        generation: e.student.generation ?? "",
        className: e.student.className ?? "",
        examType: EXAM_TYPE_LABEL[e.student.examType],
        studentType: STUDENT_TYPE_LABEL[e.student.studentType],
        isActive: e.student.isActive ? "활성" : "비활성",
        cohortName: e.cohort?.name ?? "",
        courseType: e.courseType,
        enrollmentStatus: ENROLLMENT_STATUS_LABEL[e.status],
        startDate: e.startDate ? formatDate(e.startDate) : "",
        endDate: e.endDate ? formatDate(e.endDate) : "",
        regularFee: e.regularFee,
        discountAmount: e.discountAmount,
        finalFee: e.finalFee,
        paidAmount,
        unpaidAmount: Math.max(0, e.finalFee - paidAmount),
        waitlistOrder: e.waitlistOrder ?? "",
        enrolledAt: formatDate(e.createdAt),
      };
    }),
  };
}

export async function getScoreExportRows(filters: ScoreExportFilters) {
  const scores = await getPrisma().score.findMany({
    where: {
      student: {
        examType: filters.examType,
      },
      session: {
        periodId: filters.periodId,
      },
    },
    select: {
      examNumber: true,
      rawScore: true,
      oxScore: true,
      finalScore: true,
      attendType: true,
      sourceType: true,
      note: true,
      student: {
        select: {
          name: true,
          onlineId: true,
        },
      },
      session: {
        select: {
          examDate: true,
          examType: true,
          week: true,
          subject: true,
          period: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      { session: { examDate: "asc" } },
      { session: { examType: "asc" } },
      { examNumber: "asc" },
    ],
  });

  return {
    fileName: `성적raw_${formatFileDate()}`,
    sheetName: "Scores",
    rows: scores.map((score) => ({
      periodName: score.session.period.name,
      examDate: formatDate(score.session.examDate),
      examType: EXAM_TYPE_LABEL[score.session.examType],
      week: `${score.session.week}주차`,
      subject: SUBJECT_LABEL[score.session.subject],
      examNumber: score.examNumber,
      studentName: score.student.name,
      onlineId: score.student.onlineId ?? "",
      attendType: ATTEND_TYPE_LABEL[score.attendType],
      sourceType: SCORE_SOURCE_LABEL[score.sourceType],
      rawScore: score.rawScore ?? "",
      oxScore: score.oxScore ?? "",
      finalScore: score.finalScore ?? "",
      note: sanitizeAbsenceNoteDisplay(score.note) ?? "",
    })),
  };
}
