import {
  AbsenceStatus,
  AcademyType,
  AdminRole,
  AttendSource,
  AttendStatus,
  AttendType,
  CourseType,
  EnrollmentStatus,
  ExamCategory,
  ExamType,
  LinkStatus,
  NoticeTargetType,
  NotificationChannel,
  NotificationType,
  PaymentCategory,
  PaymentMethod,
  PaymentStatus,
  PointType,
  PrismaClient,
  ScoreSource,
  StaffRole,
  StudentStatus,
  StudentType,
  Subject,
} from "@prisma/client";
const prisma = new PrismaClient();

const LOCAL_ADMIN_ID = process.env.LOCAL_DEV_ADMIN_ID?.trim() || "00000000-0000-0000-0000-000000000001";
const LOCAL_ADMIN_EMAIL = process.env.LOCAL_DEV_ADMIN_EMAIL?.trim() || "local-admin@morningmock.local";
const PRIMARY_STUDENT_EXAM_NUMBER = "2501001";
const SECONDARY_STUDENT_EXAM_NUMBER = "2501002";
const PRIMARY_ACADEMY_ID = 1;
const SECONDARY_ACADEMY_ID = 2;

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function withTime(date: Date, hour: number, minute = 0) {
  const value = new Date(date);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const directUrl = process.env.DIRECT_URL ?? "";

  if (process.env.LOCAL_DEV_MODE !== "mock") {
    throw new Error("LOCAL_DEV_MODE=mock 환경에서만 로컬 목업 시드를 실행할 수 있습니다.");
  }

  if (!databaseUrl.includes("127.0.0.1:51214") && !directUrl.includes("127.0.0.1:51214")) {
    throw new Error("로컬 Prisma Postgres(127.0.0.1:51214)에 연결된 상태에서만 실행할 수 있습니다.");
  }

  const today = startOfDay();
  const nextMonth = addDays(today, 30);
  const nextWeek = addDays(today, 7);
  const lastWeek = addDays(today, -7);
  const threeDaysAgo = addDays(today, -3);
  const yesterday = addDays(today, -1);
  await prisma.academy.upsert({
    where: { id: PRIMARY_ACADEMY_ID },
    update: {
      code: "police-main",
      name: "한국경찰학원",
      type: AcademyType.POLICE,
      isActive: true,
    },
    create: {
      id: PRIMARY_ACADEMY_ID,
      code: "police-main",
      name: "한국경찰학원",
      type: AcademyType.POLICE,
      isActive: true,
    },
  });

  await prisma.academy.upsert({
    where: { id: SECONDARY_ACADEMY_ID },
    update: {
      code: "police-dongseong",
      name: "한국경찰학원 동성로지점",
      type: AcademyType.POLICE,
      isActive: true,
    },
    create: {
      id: SECONDARY_ACADEMY_ID,
      code: "police-dongseong",
      name: "한국경찰학원 동성로지점",
      type: AcademyType.POLICE,
      isActive: true,
    },
  });

  await prisma.adminUser.upsert({
    where: { id: LOCAL_ADMIN_ID },
    update: {
      email: LOCAL_ADMIN_EMAIL,
      name: "로컬 관리자",
      phone: "010-9000-0001",
      role: AdminRole.SUPER_ADMIN,
      academyId: null,
      isActive: true,
    },
    create: {
      id: LOCAL_ADMIN_ID,
      email: LOCAL_ADMIN_EMAIL,
      name: "로컬 관리자",
      phone: "010-9000-0001",
      role: AdminRole.SUPER_ADMIN,
      academyId: null,
      isActive: true,
    },
  });

  await prisma.staff.upsert({
    where: { email: LOCAL_ADMIN_EMAIL },
    update: {
      authUid: LOCAL_ADMIN_ID,
      name: "로컬 관리자",
      role: StaffRole.DIRECTOR,
      mobile: "010-9000-0001",
      isActive: true,
      adminUserId: LOCAL_ADMIN_ID,
    },
    create: {
      id: "staff-local-admin",
      authUid: LOCAL_ADMIN_ID,
      email: LOCAL_ADMIN_EMAIL,
      name: "로컬 관리자",
      role: StaffRole.DIRECTOR,
      mobile: "010-9000-0001",
      isActive: true,
      adminUserId: LOCAL_ADMIN_ID,
    },
  });

  await prisma.systemConfig.upsert({
    where: { id: "singleton" },
    update: {
      data: { localMockMode: true },
      updatedBy: LOCAL_ADMIN_ID,
    },
    create: {
      id: "singleton",
      data: { localMockMode: true },
      updatedBy: LOCAL_ADMIN_ID,
    },
  });

  await prisma.academySettings.upsert({
    where: { academyId: PRIMARY_ACADEMY_ID },
    update: {
      academyId: PRIMARY_ACADEMY_ID,
      name: "한국경찰학원",
      directorName: "로컬 테스트 원장",
      address: "대구광역시 중구 중앙대로 390 센트럴엠빌딩",
      phone: "053-241-0112",
      websiteUrl: "http://127.0.0.1:3024",
      documentIssuer: "교무처 로컬 테스트",
      bankName: "국민은행",
      bankAccount: "111-222-333333",
      bankHolder: "한국경찰학원",
    },
    create: {
      academyId: PRIMARY_ACADEMY_ID,
      name: "한국경찰학원",
      directorName: "로컬 테스트 원장",
      address: "대구광역시 중구 중앙대로 390 센트럴엠빌딩",
      phone: "053-241-0112",
      websiteUrl: "http://127.0.0.1:3024",
      documentIssuer: "교무처 로컬 테스트",
      bankName: "국민은행",
      bankAccount: "111-222-333333",
      bankHolder: "한국경찰학원",
    },
  });

  await prisma.academySettings.upsert({
    where: { academyId: SECONDARY_ACADEMY_ID },
    update: {
      academyId: SECONDARY_ACADEMY_ID,
      name: "한국경찰학원 동성로지점",
      directorName: "로컬 테스트 부원장",
      address: "대구광역시 중구 국채보상로 600",
      phone: "053-241-0222",
      websiteUrl: "http://127.0.0.1:3024",
      documentIssuer: "동성로지점 행정실",
      bankName: "신한은행",
      bankAccount: "222-333-444444",
      bankHolder: "한국경찰학원 동성로지점",
    },
    create: {
      academyId: SECONDARY_ACADEMY_ID,
      name: "한국경찰학원 동성로지점",
      directorName: "로컬 테스트 부원장",
      address: "대구광역시 중구 국채보상로 600",
      phone: "053-241-0222",
      websiteUrl: "http://127.0.0.1:3024",
      documentIssuer: "동성로지점 행정실",
      bankName: "신한은행",
      bankAccount: "222-333-444444",
      bankHolder: "한국경찰학원 동성로지점",
    },
  });

  await prisma.student.upsert({
    where: { examNumber: PRIMARY_STUDENT_EXAM_NUMBER },
    update: {
      academyId: PRIMARY_ACADEMY_ID,
      name: "홍길동",
      phone: "010-1111-2222",
      birthDate: new Date(2000, 0, 15),
      generation: 52,
      className: "52기 공채 종합반",
      examType: ExamType.GONGCHAE,
      studentType: StudentType.EXISTING,
      isActive: true,
      notificationConsent: true,
      consentedAt: today,
      currentStatus: StudentStatus.NORMAL,
      targetScores: {
        [Subject.CONSTITUTIONAL_LAW]: 85,
        [Subject.CRIMINAL_LAW]: 82,
        [Subject.CRIMINAL_PROCEDURE]: 80,
        [Subject.POLICE_SCIENCE]: 78,
      },
      parentName: "홍부모",
      parentRelation: "부",
      parentMobile: "010-3333-4444",
    },
    create: {
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      academyId: PRIMARY_ACADEMY_ID,
      name: "홍길동",
      phone: "010-1111-2222",
      birthDate: new Date(2000, 0, 15),
      generation: 52,
      className: "52기 공채 종합반",
      examType: ExamType.GONGCHAE,
      studentType: StudentType.EXISTING,
      isActive: true,
      notificationConsent: true,
      consentedAt: today,
      currentStatus: StudentStatus.NORMAL,
      targetScores: {
        [Subject.CONSTITUTIONAL_LAW]: 85,
        [Subject.CRIMINAL_LAW]: 82,
        [Subject.CRIMINAL_PROCEDURE]: 80,
        [Subject.POLICE_SCIENCE]: 78,
      },
      parentName: "홍부모",
      parentRelation: "부",
      parentMobile: "010-3333-4444",
    },
  });

  await prisma.student.upsert({
    where: { examNumber: SECONDARY_STUDENT_EXAM_NUMBER },
    update: {
      academyId: SECONDARY_ACADEMY_ID,
      name: "김경채",
      phone: "010-5555-6666",
      birthDate: new Date(2001, 1, 25),
      generation: 52,
      className: "52기 경채 종합반",
      examType: ExamType.GYEONGCHAE,
      studentType: StudentType.NEW,
      isActive: true,
      notificationConsent: false,
      currentStatus: StudentStatus.WARNING_1,
    },
    create: {
      examNumber: SECONDARY_STUDENT_EXAM_NUMBER,
      academyId: SECONDARY_ACADEMY_ID,
      name: "김경채",
      phone: "010-5555-6666",
      birthDate: new Date(2001, 1, 25),
      generation: 52,
      className: "52기 경채 종합반",
      examType: ExamType.GYEONGCHAE,
      studentType: StudentType.NEW,
      isActive: true,
      notificationConsent: false,
      currentStatus: StudentStatus.WARNING_1,
    },
  });

  await prisma.memberProfile.upsert({
    where: { examNumber: PRIMARY_STUDENT_EXAM_NUMBER },
    update: {},
    create: {
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
    },
  });

  await prisma.examPeriod.upsert({
    where: { id: 1001 },
    update: {
      academyId: PRIMARY_ACADEMY_ID,
      name: "2026년 3월 로컬 목업 모의고사",
      startDate: addDays(today, -14),
      endDate: addDays(today, 42),
      totalWeeks: 8,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
    },
    create: {
      id: 1001,
      academyId: PRIMARY_ACADEMY_ID,
      name: "2026년 3월 로컬 목업 모의고사",
      startDate: addDays(today, -14),
      endDate: addDays(today, 42),
      totalWeeks: 8,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
    },
  });

  await prisma.examPeriod.upsert({
    where: { id: 1002 },
    update: {
      academyId: SECONDARY_ACADEMY_ID,
      name: "2026년 3월 동성로지점 로컬 목업 모의고사",
      startDate: addDays(today, -14),
      endDate: addDays(today, 42),
      totalWeeks: 8,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
    },
    create: {
      id: 1002,
      academyId: SECONDARY_ACADEMY_ID,
      name: "2026년 3월 동성로지점 로컬 목업 모의고사",
      startDate: addDays(today, -14),
      endDate: addDays(today, 42),
      totalWeeks: 8,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
    },
  });

  await prisma.periodEnrollment.deleteMany({
    where: {
      periodId: { in: [1001, 1002] },
      examNumber: {
        in: [PRIMARY_STUDENT_EXAM_NUMBER, SECONDARY_STUDENT_EXAM_NUMBER],
      },
    },
  });

  await prisma.periodEnrollment.createMany({
    data: [
      { periodId: 1001, examNumber: PRIMARY_STUDENT_EXAM_NUMBER },
      { periodId: 1002, examNumber: SECONDARY_STUDENT_EXAM_NUMBER },
    ],
  });

  await prisma.examSession.upsert({
    where: { id: 1001 },
    update: {
      periodId: 1001,
      examType: ExamType.GONGCHAE,
      week: 1,
      subject: Subject.CONSTITUTIONAL_LAW,
      displaySubjectName: "헌법",
      examDate: withTime(lastWeek, 8, 30),
      isCancelled: false,
      isLocked: false,
    },
    create: {
      id: 1001,
      periodId: 1001,
      examType: ExamType.GONGCHAE,
      week: 1,
      subject: Subject.CONSTITUTIONAL_LAW,
      displaySubjectName: "헌법",
      examDate: withTime(lastWeek, 8, 30),
      isCancelled: false,
      isLocked: false,
    },
  });

  await prisma.examSession.upsert({
    where: { id: 1002 },
    update: {
      periodId: 1001,
      examType: ExamType.GONGCHAE,
      week: 2,
      subject: Subject.CRIMINAL_LAW,
      displaySubjectName: "형사법",
      examDate: withTime(today, 8, 30),
      isCancelled: false,
      isLocked: false,
    },
    create: {
      id: 1002,
      periodId: 1001,
      examType: ExamType.GONGCHAE,
      week: 2,
      subject: Subject.CRIMINAL_LAW,
      displaySubjectName: "형사법",
      examDate: withTime(today, 8, 30),
      isCancelled: false,
      isLocked: false,
    },
  });

  await prisma.examSession.upsert({
    where: { id: 1003 },
    update: {
      periodId: 1002,
      examType: ExamType.GYEONGCHAE,
      week: 2,
      subject: Subject.POLICE_SCIENCE,
      displaySubjectName: "경찰학",
      examDate: withTime(threeDaysAgo, 8, 30),
      isCancelled: false,
      isLocked: false,
    },
    create: {
      id: 1003,
      periodId: 1002,
      examType: ExamType.GYEONGCHAE,
      week: 2,
      subject: Subject.POLICE_SCIENCE,
      displaySubjectName: "경찰학",
      examDate: withTime(threeDaysAgo, 8, 30),
      isCancelled: false,
      isLocked: false,
    },
  });

  await prisma.examSession.upsert({
    where: { id: 1004 },
    update: {
      periodId: 1002,
      examType: ExamType.GYEONGCHAE,
      week: 1,
      subject: Subject.CRIMINOLOGY,
      displaySubjectName: "범죄학",
      examDate: withTime(yesterday, 8, 30),
      isCancelled: false,
      isLocked: false,
    },
    create: {
      id: 1004,
      periodId: 1002,
      examType: ExamType.GYEONGCHAE,
      week: 1,
      subject: Subject.CRIMINOLOGY,
      displaySubjectName: "범죄학",
      examDate: withTime(yesterday, 8, 30),
      isCancelled: false,
      isLocked: false,
    },
  });

  await prisma.score.upsert({
    where: { id: 1001 },
    update: {
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      sessionId: 1001,
      rawScore: 78,
      finalScore: 78,
      attendType: AttendType.NORMAL,
      sourceType: ScoreSource.MANUAL_INPUT,
      note: "로컬 목업 지난주 성적",
    },
    create: {
      id: 1001,
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      sessionId: 1001,
      rawScore: 78,
      finalScore: 78,
      attendType: AttendType.NORMAL,
      sourceType: ScoreSource.MANUAL_INPUT,
      note: "로컬 목업 지난주 성적",
    },
  });

  await prisma.score.upsert({
    where: { id: 1002 },
    update: {
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      sessionId: 1002,
      rawScore: 83,
      finalScore: 83,
      attendType: AttendType.NORMAL,
      sourceType: ScoreSource.MANUAL_INPUT,
      note: "로컬 목업 오늘 성적",
    },
    create: {
      id: 1002,
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      sessionId: 1002,
      rawScore: 83,
      finalScore: 83,
      attendType: AttendType.NORMAL,
      sourceType: ScoreSource.MANUAL_INPUT,
      note: "로컬 목업 오늘 성적",
    },
  });

  await prisma.score.upsert({
    where: { id: 1003 },
    update: {
      academyId: SECONDARY_ACADEMY_ID,
      examNumber: SECONDARY_STUDENT_EXAM_NUMBER,
      sessionId: 1003,
      rawScore: 71,
      finalScore: 71,
      attendType: AttendType.NORMAL,
      sourceType: ScoreSource.MANUAL_INPUT,
      note: "로컬 목업 경채 성적",
    },
    create: {
      id: 1003,
      academyId: SECONDARY_ACADEMY_ID,
      examNumber: SECONDARY_STUDENT_EXAM_NUMBER,
      sessionId: 1003,
      rawScore: 71,
      finalScore: 71,
      attendType: AttendType.NORMAL,
      sourceType: ScoreSource.MANUAL_INPUT,
      note: "로컬 목업 경채 성적",
    },
  });

  await prisma.notice.upsert({
    where: { id: 1001 },
    update: {
      title: "3월 모의고사 안내",
      content: "<p>이번 주 토요일 08:30까지 입실해 주세요.</p>",
      targetType: NoticeTargetType.ALL,
      isPinned: true,
      isPublished: true,
      publishedAt: withTime(today, 7, 0),
    },
    create: {
      id: 1001,
      title: "3월 모의고사 안내",
      content: "<p>이번 주 토요일 08:30까지 입실해 주세요.</p>",
      targetType: NoticeTargetType.ALL,
      isPinned: true,
      isPublished: true,
      publishedAt: withTime(today, 7, 0),
    },
  });

  await prisma.notice.upsert({
    where: { id: 1002 },
    update: {
      title: "공채 종합반 주간 브리핑",
      content: "<p>형사법 보충 강의는 금요일 19:00에 진행됩니다.</p>",
      targetType: NoticeTargetType.GONGCHAE,
      isPinned: false,
      isPublished: true,
      publishedAt: withTime(threeDaysAgo, 18, 0),
    },
    create: {
      id: 1002,
      title: "공채 종합반 주간 브리핑",
      content: "<p>형사법 보충 강의는 금요일 19:00에 진행됩니다.</p>",
      targetType: NoticeTargetType.GONGCHAE,
      isPinned: false,
      isPublished: true,
      publishedAt: withTime(threeDaysAgo, 18, 0),
    },
  });

  await prisma.comprehensiveCourseProduct.upsert({
    where: { id: "product-gongchae-52" },
    update: {
      name: "52기 공채 종합반",
      examCategory: ExamCategory.GONGCHAE,
      durationMonths: 12,
      regularPrice: 1200000,
      salePrice: 1100000,
      features: "관리형 자습, 주간 피드백, 성적 분석",
      isActive: true,
    },
    create: {
      id: "product-gongchae-52",
      name: "52기 공채 종합반",
      examCategory: ExamCategory.GONGCHAE,
      durationMonths: 12,
      regularPrice: 1200000,
      salePrice: 1100000,
      features: "관리형 자습, 주간 피드백, 성적 분석",
      isActive: true,
    },
  });

  await prisma.cohort.upsert({
    where: { id: "cohort-gongchae-52" },
    update: {
      name: "52기 공채 종합반",
      examCategory: ExamCategory.GONGCHAE,
      targetExamYear: today.getFullYear() + 1,
      startDate: addDays(today, -20),
      endDate: nextMonth,
      maxCapacity: 80,
      isActive: true,
    },
    create: {
      id: "cohort-gongchae-52",
      name: "52기 공채 종합반",
      examCategory: ExamCategory.GONGCHAE,
      targetExamYear: today.getFullYear() + 1,
      startDate: addDays(today, -20),
      endDate: nextMonth,
      maxCapacity: 80,
      isActive: true,
    },
  });

  await prisma.courseEnrollment.upsert({
    where: { id: "enrollment-gildong-01" },
    update: {
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      courseType: CourseType.COMPREHENSIVE,
      productId: "product-gongchae-52",
      cohortId: "cohort-gongchae-52",
      startDate: addDays(today, -20),
      endDate: nextMonth,
      regularFee: 1200000,
      discountAmount: 100000,
      finalFee: 1100000,
      status: EnrollmentStatus.ACTIVE,
      staffId: LOCAL_ADMIN_ID,
      isRe: false,
    },
    create: {
      id: "enrollment-gildong-01",
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      courseType: CourseType.COMPREHENSIVE,
      productId: "product-gongchae-52",
      cohortId: "cohort-gongchae-52",
      startDate: addDays(today, -20),
      endDate: nextMonth,
      regularFee: 1200000,
      discountAmount: 100000,
      finalFee: 1100000,
      status: EnrollmentStatus.ACTIVE,
      staffId: LOCAL_ADMIN_ID,
      isRe: false,
    },
  });

  await prisma.payment.upsert({
    where: { id: "payment-gildong-01" },
    update: {
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      enrollmentId: "enrollment-gildong-01",
      category: PaymentCategory.TUITION,
      method: PaymentMethod.CARD,
      status: PaymentStatus.APPROVED,
      grossAmount: 600000,
      discountAmount: 0,
      couponAmount: 0,
      pointAmount: 0,
      netAmount: 600000,
      note: "로컬 목업 1차 등록금",
      processedBy: LOCAL_ADMIN_ID,
      processedAt: withTime(today, 10, 15),
    },
    create: {
      id: "payment-gildong-01",
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      enrollmentId: "enrollment-gildong-01",
      category: PaymentCategory.TUITION,
      method: PaymentMethod.CARD,
      status: PaymentStatus.APPROVED,
      grossAmount: 600000,
      discountAmount: 0,
      couponAmount: 0,
      pointAmount: 0,
      netAmount: 600000,
      note: "로컬 목업 1차 등록금",
      processedBy: LOCAL_ADMIN_ID,
      processedAt: withTime(today, 10, 15),
    },
  });

  await prisma.paymentItem.upsert({
    where: { id: "payment-item-gildong-01" },
    update: {
      paymentId: "payment-gildong-01",
      itemType: PaymentCategory.TUITION,
      itemId: "enrollment-gildong-01",
      itemName: "52기 공채 종합반 1차 등록금",
      unitPrice: 600000,
      quantity: 1,
      amount: 600000,
    },
    create: {
      id: "payment-item-gildong-01",
      paymentId: "payment-gildong-01",
      itemType: PaymentCategory.TUITION,
      itemId: "enrollment-gildong-01",
      itemName: "52기 공채 종합반 1차 등록금",
      unitPrice: 600000,
      quantity: 1,
      amount: 600000,
    },
  });

  await prisma.installment.upsert({
    where: {
      paymentId_seq: {
        paymentId: "payment-gildong-01",
        seq: 1,
      },
    },
    update: {
      amount: 500000,
      dueDate: withTime(yesterday, 12, 0),
      paidAt: null,
      paidPaymentId: null,
    },
    create: {
      id: "installment-gildong-01",
      paymentId: "payment-gildong-01",
      seq: 1,
      amount: 500000,
      dueDate: withTime(yesterday, 12, 0),
      paidAt: null,
      paidPaymentId: null,
    },
  });

  await prisma.paymentLink.upsert({
    where: { id: 1001 },
    update: {
      title: "52기 공채 종합반 온라인 결제",
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      cohortId: "cohort-gongchae-52",
      productId: "product-gongchae-52",
      courseType: CourseType.COMPREHENSIVE,
      amount: 1100000,
      discountAmount: 50000,
      finalAmount: 1050000,
      allowPoint: true,
      expiresAt: withTime(nextWeek, 23, 59),
      status: LinkStatus.ACTIVE,
      note: "로컬 목업 결제 링크",
      createdBy: LOCAL_ADMIN_ID,
    },
    create: {
      id: 1001,
      title: "52기 공채 종합반 온라인 결제",
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      cohortId: "cohort-gongchae-52",
      productId: "product-gongchae-52",
      courseType: CourseType.COMPREHENSIVE,
      amount: 1100000,
      discountAmount: 50000,
      finalAmount: 1050000,
      allowPoint: true,
      expiresAt: withTime(nextWeek, 23, 59),
      status: LinkStatus.ACTIVE,
      note: "로컬 목업 결제 링크",
      createdBy: LOCAL_ADMIN_ID,
    },
  });

  await prisma.pointBalance.upsert({
    where: { examNumber: PRIMARY_STUDENT_EXAM_NUMBER },
    update: { balance: 15000 },
    create: {
      id: "point-balance-gildong",
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      balance: 15000,
    },
  });

  await prisma.pointLog.upsert({
    where: { id: 1001 },
    update: {
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      type: PointType.MANUAL,
      amount: 15000,
      reason: "로컬 테스트 보너스 포인트",
      periodId: 1001,
      grantedBy: "로컬 관리자",
    },
    create: {
      id: 1001,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      type: PointType.MANUAL,
      amount: 15000,
      reason: "로컬 테스트 보너스 포인트",
      periodId: 1001,
      grantedBy: "로컬 관리자",
    },
  });

  await prisma.notificationLog.upsert({
    where: { id: 1001 },
    update: {
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      type: NotificationType.NOTICE,
      channel: NotificationChannel.SMS,
      message: "공지 발송 재시도가 필요합니다.",
      status: "failed",
      failReason: "로컬 테스트용 실패 로그",
      sentAt: withTime(today, 9, 0),
    },
    create: {
      id: 1001,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      type: NotificationType.NOTICE,
      channel: NotificationChannel.SMS,
      message: "공지 발송 재시도가 필요합니다.",
      status: "failed",
      failReason: "로컬 테스트용 실패 로그",
      sentAt: withTime(today, 9, 0),
    },
  });

  await prisma.absenceNote.upsert({
    where: { id: 1001 },
    update: {
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      sessionId: 1002,
      reason: "병원 진료 확인서 제출 예정",
      status: AbsenceStatus.PENDING,
      submittedAt: withTime(today, 7, 45),
      adminNote: "로컬 목업 검토 대기",
    },
    create: {
      id: 1001,
      academyId: PRIMARY_ACADEMY_ID,
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      sessionId: 1002,
      reason: "병원 진료 확인서 제출 예정",
      status: AbsenceStatus.PENDING,
      submittedAt: withTime(today, 7, 45),
      adminNote: "로컬 목업 검토 대기",
    },
  });

  await prisma.civilServiceExam.upsert({
    where: { id: 1001 },
    update: {
      name: "2026년 경찰공무원 1차 필기",
      examType: ExamType.GONGCHAE,
      year: today.getFullYear(),
      writtenDate: addDays(today, 28),
      interviewDate: addDays(today, 55),
      resultDate: addDays(today, 42),
      description: "로컬 목업 일정",
      isActive: true,
    },
    create: {
      id: 1001,
      name: "2026년 경찰공무원 1차 필기",
      examType: ExamType.GONGCHAE,
      year: today.getFullYear(),
      writtenDate: addDays(today, 28),
      interviewDate: addDays(today, 55),
      resultDate: addDays(today, 42),
      description: "로컬 목업 일정",
      isActive: true,
    },
  });

  await prisma.classroom.upsert({
    where: { id: "classroom-local-a" },
    update: {
      name: "로컬 A반",
      teacherId: LOCAL_ADMIN_ID,
      generation: 52,
      note: "로컬 목업 반",
      isActive: true,
    },
    create: {
      id: "classroom-local-a",
      name: "로컬 A반",
      teacherId: LOCAL_ADMIN_ID,
      generation: 52,
      note: "로컬 목업 반",
      isActive: true,
    },
  });

  await prisma.classroomStudent.upsert({
    where: { id: "classroom-student-gildong" },
    update: {
      classroomId: "classroom-local-a",
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      leftAt: null,
    },
    create: {
      id: "classroom-student-gildong",
      classroomId: "classroom-local-a",
      examNumber: PRIMARY_STUDENT_EXAM_NUMBER,
      leftAt: null,
    },
  });

  await prisma.classroomStudent.upsert({
    where: { id: "classroom-student-gyeongchae" },
    update: {
      classroomId: "classroom-local-a",
      examNumber: SECONDARY_STUDENT_EXAM_NUMBER,
      leftAt: null,
    },
    create: {
      id: "classroom-student-gyeongchae",
      classroomId: "classroom-local-a",
      examNumber: SECONDARY_STUDENT_EXAM_NUMBER,
      leftAt: null,
    },
  });

  await prisma.classroomAttendanceLog.upsert({
    where: { id: "attendance-log-gyeongchae-today" },
    update: {
      academyId: SECONDARY_ACADEMY_ID,
      classroomId: "classroom-local-a",
      examNumber: SECONDARY_STUDENT_EXAM_NUMBER,
      attendDate: today,
      attendType: AttendType.ABSENT,
      source: AttendSource.MANUAL,
      updatedBy: LOCAL_ADMIN_ID,
    },
    create: {
      id: "attendance-log-gyeongchae-today",
      academyId: SECONDARY_ACADEMY_ID,
      classroomId: "classroom-local-a",
      examNumber: SECONDARY_STUDENT_EXAM_NUMBER,
      attendDate: today,
      attendType: AttendType.ABSENT,
      source: AttendSource.MANUAL,
      updatedBy: LOCAL_ADMIN_ID,
    },
  });

  await prisma.lectureSchedule.upsert({
    where: { id: "lecture-schedule-local-1" },
    update: {
      cohortId: "cohort-gongchae-52",
      subjectName: "형사법",
      instructorName: "로컬 강사",
      dayOfWeek: today.getDay(),
      startTime: "09:00",
      endTime: "11:00",
      isActive: true,
    },
    create: {
      id: "lecture-schedule-local-1",
      cohortId: "cohort-gongchae-52",
      subjectName: "형사법",
      instructorName: "로컬 강사",
      dayOfWeek: today.getDay(),
      startTime: "09:00",
      endTime: "11:00",
      isActive: true,
    },
  });

  await prisma.lectureSession.upsert({
    where: { id: "lecture-session-local-1" },
    update: {
      scheduleId: "lecture-schedule-local-1",
      sessionDate: today,
      startTime: "09:00",
      endTime: "11:00",
      isCancelled: false,
      note: "로컬 목업 수업",
    },
    create: {
      id: "lecture-session-local-1",
      scheduleId: "lecture-schedule-local-1",
      sessionDate: today,
      startTime: "09:00",
      endTime: "11:00",
      isCancelled: false,
      note: "로컬 목업 수업",
    },
  });

  await prisma.lectureAttendance.upsert({
    where: { id: "lecture-attendance-gildong-1" },
    update: {
      sessionId: "lecture-session-local-1",
      studentId: PRIMARY_STUDENT_EXAM_NUMBER,
      status: AttendStatus.PRESENT,
      note: "로컬 목업 출석",
      checkedBy: LOCAL_ADMIN_ID,
    },
    create: {
      id: "lecture-attendance-gildong-1",
      sessionId: "lecture-session-local-1",
      studentId: PRIMARY_STUDENT_EXAM_NUMBER,
      status: AttendStatus.PRESENT,
      note: "로컬 목업 출석",
      checkedBy: LOCAL_ADMIN_ID,
    },
  });

  console.log("[seed-local-mock] local mock data is ready");
  console.log(`[seed-local-mock] adminId=${LOCAL_ADMIN_ID}`);
  console.log(`[seed-local-mock] student=${PRIMARY_STUDENT_EXAM_NUMBER} / birthDate=000115`);
}

main()
  .catch((error) => {
    console.error("[seed-local-mock] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



