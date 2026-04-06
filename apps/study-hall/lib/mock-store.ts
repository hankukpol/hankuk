import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getMockDivisionBySlug,
  MOCK_DIVISION_SETTINGS,
  MOCK_DIVISIONS,
  MOCK_STUDENTS,
  type MockAdminRole,
  type MockDivisionSettings,
  type MockStudent,
} from "@/lib/mock-data";
import { DEFAULT_DIVISION_FEATURE_FLAGS } from "@/lib/division-features";
import { DEFAULT_POINT_RULE_TEMPLATES, type PointCategoryValue } from "@/lib/point-meta";
import { createDefaultSeatDraftLayout } from "@/lib/seat-layout";
import { getDefaultTuitionPlanTemplates } from "@/lib/tuition-meta";

export type MockPeriodRecord = {
  id: string;
  divisionId: string;
  name: string;
  label: string | null;
  displayOrder: number;
  startTime: string;
  endTime: string;
  isMandatory: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MockAttendanceStatus =
  | "PRESENT"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE";

export type MockAttendanceRecord = {
  id: string;
  studentId: string;
  periodId: string;
  date: string;
  status: MockAttendanceStatus;
  reason: string | null;
  checkInTime: string | null;
  recordedById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MockDivisionRecord = {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  color: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
};

export type MockDivisionSettingsRecord = Omit<MockDivisionSettings, "updatedAt"> & {
  updatedAt: string;
};

export type MockAdminRecord = {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: MockAdminRole;
  divisionId: string | null;
  divisionSlug: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MockStudentRecord = Omit<
  MockStudent,
  | "seatId"
  | "courseStartDate"
  | "courseEndDate"
  | "tuitionPlanId"
  | "tuitionAmount"
  | "tuitionExempt"
  | "tuitionExemptReason"
> & {
  seatId: string | null;
  courseStartDate: string;
  courseEndDate: string | null;
  tuitionPlanId: string | null;
  tuitionAmount: number | null;
  tuitionExempt: boolean;
  tuitionExemptReason: string | null;
};

export type MockStudyRoomRecord = {
  id: string;
  divisionId: string;
  name: string;
  columns: number;
  rows: number;
  aisleColumns: number[];
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MockSeatRecord = {
  id: string;
  divisionId: string;
  studyRoomId: string;
  label: string;
  positionX: number;
  positionY: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MockTuitionPlanRecord = {
  id: string;
  divisionId: string;
  name: string;
  durationDays: number | null;
  amount: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MockPointRuleRecord = {
  id: string;
  divisionId: string;
  category: PointCategoryValue;
  name: string;
  points: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MockPointRecordRecord = {
  id: string;
  studentId: string;
  ruleId: string | null;
  points: number;
  date: string;
  notes: string | null;
  recordedById: string;
  createdAt: string;
};

export type MockPaymentCategoryRecord = {
  id: string;
  divisionId: string;
  name: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MockPaymentRecord = {
  id: string;
  studentId: string;
  paymentTypeId: string;
  amount: number;
  paymentDate: string;
  method: string;
  paymentGroupId: string | null;
  originalPaymentId: string | null;
  notes: string | null;
  recordedById: string;
  createdAt: string;
};

export type MockLeaveTypeRecord = "HOLIDAY" | "HALF_DAY" | "HEALTH" | "OUTING";

export type MockLeaveStatusRecord = "PENDING" | "APPROVED" | "REJECTED" | "USED";

export type MockLeavePermissionRecord = {
  id: string;
  studentId: string;
  type: MockLeaveTypeRecord;
  date: string;
  reason: string | null;
  approvedById: string;
  status: MockLeaveStatusRecord;
  createdAt: string;
};

export type MockInterviewResultTypeRecord =
  | "WARNING_1"
  | "WARNING_2"
  | "INTERVIEW"
  | "WITHDRAWAL";

export type MockInterviewRecord = {
  id: string;
  studentId: string;
  date: string;
  trigger: string | null;
  reason: string;
  content: string | null;
  result: string | null;
  resultType: MockInterviewResultTypeRecord;
  createdById: string;
  createdAt: string;
};

export type MockAnnouncementRecord = {
  id: string;
  divisionId: string | null;
  title: string;
  content: string;
  isPinned: boolean;
  publishedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type MockExamSubjectRecord = {
  id: string;
  examTypeId: string;
  name: string;
  totalItems: number | null;
  pointsPerItem: number | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MockExamCategory = "MORNING" | "REGULAR";

export type MockExamTypeRecord = {
  id: string;
  divisionId: string;
  name: string;
  category: MockExamCategory;
  studyTrack: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  subjects: MockExamSubjectRecord[];
};

export type MockExamScoreRecord = {
  id: string;
  studentId: string;
  examTypeId: string;
  examRound: number;
  examDate: string | null;
  scores: Record<string, number | null>;
  totalScore: number | null;
  rankInClass: number | null;
  notes: string | null;
  recordedById: string;
  createdAt: string;
  updatedAt: string;
};

export type MockMorningExamScoreRecord = {
  id: string;
  studentId: string;
  examTypeId: string;
  subjectId: string;
  examDate: string;
  score: number | null;
  weekNumber: number;
  weekYear: number;
  notes: string | null;
  recordedById: string;
  createdAt: string;
  updatedAt: string;
};

export type MockScoreTargetRecord = {
  id: string;
  studentId: string;
  examTypeId: string;
  targetScore: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MockExamScheduleType = "WRITTEN" | "PHYSICAL" | "INTERVIEW" | "RESULT" | "OTHER";

export type MockExamScheduleRecord = {
  id: string;
  divisionId: string;
  name: string;
  type: MockExamScheduleType;
  examDate: string;
  description: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type MockPhoneSubmissionStatus = "SUBMITTED" | "NOT_SUBMITTED" | "RENTED";

export type MockPhoneSubmissionRecord = {
  id: string;
  divisionId: string;
  studentId: string;
  periodId: string;
  date: string;
  status: MockPhoneSubmissionStatus;
  rentalNote: string | null;
  recordedById: string;
  createdAt: string;
  updatedAt: string;
};

type MockState = {
  deletedDivisionSlugs: string[];
  divisions: MockDivisionRecord[];
  divisionSettingsByDivision: Record<string, MockDivisionSettingsRecord>;
  admins: MockAdminRecord[];
  periodsByDivision: Record<string, MockPeriodRecord[]>;
  attendanceByDivision: Record<string, MockAttendanceRecord[]>;
  studentsByDivision: Record<string, MockStudentRecord[]>;
  studyRoomsByDivision: Record<string, MockStudyRoomRecord[]>;
  seatsByDivision: Record<string, MockSeatRecord[]>;
  pointRulesByDivision: Record<string, MockPointRuleRecord[]>;
  pointRecordsByDivision: Record<string, MockPointRecordRecord[]>;
  paymentCategoriesByDivision: Record<string, MockPaymentCategoryRecord[]>;
  paymentRecordsByDivision: Record<string, MockPaymentRecord[]>;
  tuitionPlansByDivision: Record<string, MockTuitionPlanRecord[]>;
  leavePermissionsByDivision: Record<string, MockLeavePermissionRecord[]>;
  interviewsByDivision: Record<string, MockInterviewRecord[]>;
  announcementsByDivision: Record<string, MockAnnouncementRecord[]>;
  globalAnnouncements: MockAnnouncementRecord[];
  examTypesByDivision: Record<string, MockExamTypeRecord[]>;
  examScoresByDivision: Record<string, MockExamScoreRecord[]>;
  morningExamScoresByDivision: Record<string, MockMorningExamScoreRecord[]>;
  scoreTargetsByDivision: Record<string, MockScoreTargetRecord[]>;
  examSchedulesByDivision: Record<string, MockExamScheduleRecord[]>;
  phoneSubmissionsByDivision: Record<string, MockPhoneSubmissionRecord[]>;
};

const mockDirectory = path.join(process.cwd(), ".local");
const mockStatePath = path.join(mockDirectory, "mock-db.json");
const mockStateBackupPath = path.join(mockDirectory, "mock-db.backup.json");

let mockStateQueue: Promise<void> = Promise.resolve();

const basePeriods = [
  { name: "0교시", label: "아침 모의고사", startTime: "08:30", endTime: "08:50", isMandatory: true, isActive: true },
  { name: "1교시", label: null, startTime: "09:00", endTime: "10:15", isMandatory: true, isActive: true },
  { name: "2교시", label: null, startTime: "10:30", endTime: "11:45", isMandatory: true, isActive: true },
  { name: "3교시", label: null, startTime: "12:00", endTime: "13:00", isMandatory: true, isActive: true },
  { name: "4교시", label: null, startTime: "14:15", endTime: "15:30", isMandatory: true, isActive: true },
  { name: "5교시", label: null, startTime: "15:45", endTime: "17:00", isMandatory: true, isActive: true },
  { name: "6교시", label: null, startTime: "17:10", endTime: "18:00", isMandatory: true, isActive: true },
  { name: "7교시", label: "야간 자습", startTime: "19:15", endTime: "20:30", isMandatory: false, isActive: true },
  { name: "8교시", label: "야간 자습", startTime: "20:45", endTime: "22:00", isMandatory: false, isActive: true },
];

function serializeDivisionRecord(division: {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  color: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string | Date;
}) {
  return {
    id: division.id,
    slug: division.slug,
    name: division.name,
    fullName: division.fullName,
    color: division.color,
    isActive: division.isActive,
    displayOrder: division.displayOrder,
    createdAt: typeof division.createdAt === "string" ? division.createdAt : division.createdAt.toISOString(),
  } satisfies MockDivisionRecord;
}

function getDefaultDivisionRecords() {
  return MOCK_DIVISIONS.map((division) => serializeDivisionRecord(division)).sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
}

function findDivisionRecord(divisionSlug: string, divisions?: MockDivisionRecord[]) {
  const fromState = divisions?.find((division) => division.slug === divisionSlug);

  if (fromState) {
    return fromState;
  }

  const fallback = getMockDivisionBySlug(divisionSlug);
  return fallback ? serializeDivisionRecord(fallback) : null;
}

function getDefaultAdminId(divisionSlug: string) {
  return `mock-admin-${divisionSlug}`;
}

function getDefaultAssistantId(divisionSlug: string) {
  return `mock-assistant-${divisionSlug}`;
}

function getDefaultAdminName(division: MockDivisionRecord) {
  return `모의 ${division.name} 관리자`;
}

function getDefaultAssistantName(division: MockDivisionRecord) {
  return `모의 ${division.name} 조교`;
}

function createDefaultDivisionSettingsRecord(division: MockDivisionRecord): MockDivisionSettingsRecord {
  const seeded = MOCK_DIVISION_SETTINGS[division.slug];

  if (seeded) {
    return {
      ...seeded,
      updatedAt: seeded.updatedAt.toISOString(),
    };
  }

  return {
    divisionId: division.id,
    warnLevel1: 10,
    warnLevel2: 20,
    warnInterview: 25,
    warnWithdraw: 30,
    warnMsgLevel1:
      "안녕하세요. {학원명}입니다.\n{직렬명} {학생이름} 학생의 벌점이 {벌점}점으로 1차 경고 대상입니다.",
    warnMsgLevel2:
      "안녕하세요. {학원명}입니다.\n{직렬명} {학생이름} 학생의 벌점이 {벌점}점으로 2차 경고 대상입니다.",
    warnMsgInterview:
      "안녕하세요. {학원명}입니다.\n{직렬명} {학생이름} 학생의 벌점이 {벌점}점으로 면담 대상입니다.",
    warnMsgWithdraw:
      "안녕하세요. {학원명}입니다.\n{직렬명} {학생이름} 학생의 벌점이 {벌점}점으로 퇴실 대상입니다.",
    tardyMinutes: 20,
    assistantPastEditAllowed: false,
    assistantPastEditDays: 0,
    holidayLimit: 1,
    halfDayLimit: 2,
    healthLimit: 1,
    holidayUnusedPts: 5,
    halfDayUnusedPts: 2,
    tardyPointRuleId: null,
    absentPointRuleId: null,
    perfectAttendancePtsEnabled: false,
    perfectAttendancePts: 0,
    expirationWarningDays: 14,
    operatingDays: {
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      sat: true,
      sun: false,
    },
    studyTracks: [],
    pointCategories: ["출결", "생활", "시험", "자습", "기타"],
    featureFlags: { ...DEFAULT_DIVISION_FEATURE_FLAGS },
    updatedAt: new Date().toISOString(),
  };
}

function createInitialAdmins(divisions = getDefaultDivisionRecords()) {
  const now = new Date().toISOString();

  return [
    {
      id: "mock-super-admin",
      userId: "mock-user-super-admin",
      email: "super@mock.local",
      name: "모의 최고관리자",
      role: "SUPER_ADMIN",
      divisionId: null,
      divisionSlug: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    ...divisions.flatMap((division) => [
      {
        id: getDefaultAdminId(division.slug),
        userId: `mock-user-${division.slug}-admin`,
        email: `admin-${division.slug}@mock.local`,
        name: getDefaultAdminName(division),
        role: "ADMIN" as const,
        divisionId: division.id,
        divisionSlug: division.slug,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: getDefaultAssistantId(division.slug),
        userId: `mock-user-${division.slug}-assistant`,
        email: `assistant-${division.slug}@mock.local`,
        name: getDefaultAssistantName(division),
        role: "ASSISTANT" as const,
        divisionId: division.id,
        divisionSlug: division.slug,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]),
  ] satisfies MockAdminRecord[];
}

function getDivisionSlugs(state?: Partial<MockState>) {
  const deletedDivisionSlugSet = new Set(state?.deletedDivisionSlugs ?? []);

  return Array.from(
    new Set([
      ...(state?.divisions ?? [])
        .map((division) => division.slug)
        .filter((slug) => !deletedDivisionSlugSet.has(slug)),
      ...MOCK_DIVISIONS.map((division) => division.slug).filter((slug) => !deletedDivisionSlugSet.has(slug)),
      ...Object.keys(state?.divisionSettingsByDivision ?? {}),
      ...Object.keys(state?.periodsByDivision ?? {}),
      ...Object.keys(state?.attendanceByDivision ?? {}),
      ...Object.keys(state?.studentsByDivision ?? {}),
      ...Object.keys(state?.studyRoomsByDivision ?? {}),
      ...Object.keys(state?.seatsByDivision ?? {}),
      ...Object.keys(state?.pointRulesByDivision ?? {}),
      ...Object.keys(state?.pointRecordsByDivision ?? {}),
      ...Object.keys(state?.paymentCategoriesByDivision ?? {}),
      ...Object.keys(state?.paymentRecordsByDivision ?? {}),
      ...Object.keys(state?.tuitionPlansByDivision ?? {}),
      ...Object.keys(state?.leavePermissionsByDivision ?? {}),
      ...Object.keys(state?.interviewsByDivision ?? {}),
      ...Object.keys(state?.announcementsByDivision ?? {}),
      ...Object.keys(state?.examTypesByDivision ?? {}),
      ...Object.keys(state?.examScoresByDivision ?? {}),
      ...Object.keys(state?.scoreTargetsByDivision ?? {}),
      ...Object.keys(state?.examSchedulesByDivision ?? {}),
      ...Object.keys(state?.phoneSubmissionsByDivision ?? {}),
    ]),
  ).filter((slug) => !deletedDivisionSlugSet.has(slug));
}

function createInitialPeriods(divisionSlug: string, divisions?: MockDivisionRecord[]) {
  const division = findDivisionRecord(divisionSlug, divisions);

  if (!division) {
    return [];
  }

  const now = new Date().toISOString();

  return basePeriods.map((period, index) => ({
    id: `mock-period-${divisionSlug}-${index}`,
    divisionId: division.id,
    name: period.name,
    label: period.label,
    displayOrder: index,
    startTime: period.startTime,
    endTime: period.endTime,
    isMandatory: period.isMandatory,
    isActive: period.isActive,
    createdAt: now,
    updatedAt: now,
  }));
}

function createInitialStudents(divisionSlug: string) {
  return MOCK_STUDENTS.filter((student) => student.divisionSlug === divisionSlug).map((student) => ({
    ...student,
    seatId: student.seatId ?? null,
    courseStartDate: student.courseStartDate ?? student.enrolledAt.slice(0, 10),
    courseEndDate: student.courseEndDate ?? null,
    tuitionPlanId: student.tuitionPlanId ?? null,
    tuitionAmount: student.tuitionAmount ?? null,
    tuitionExempt: student.tuitionExempt ?? false,
    tuitionExemptReason: student.tuitionExemptReason ?? null,
  }));
}

function createInitialStudentsWithDivisions(divisionSlug: string) {
  return MOCK_STUDENTS.filter((student) => student.divisionSlug === divisionSlug).map((student) => ({
    ...student,
    seatId: student.seatId ?? null,
    courseStartDate: student.courseStartDate ?? student.enrolledAt.slice(0, 10),
    courseEndDate: student.courseEndDate ?? null,
    tuitionPlanId: student.tuitionPlanId ?? null,
    tuitionAmount: student.tuitionAmount ?? null,
    tuitionExempt: student.tuitionExempt ?? false,
    tuitionExemptReason: student.tuitionExemptReason ?? null,
  }));
}

function getDefaultStudyRoomId(divisionSlug: string) {
  return `mock-study-room-${divisionSlug}-default`;
}

function createInitialStudyRooms(divisionSlug: string, divisions?: MockDivisionRecord[]) {
  const division = findDivisionRecord(divisionSlug, divisions);

  if (!division) {
    return [];
  }

  const now = new Date().toISOString();

  return [
    {
      id: getDefaultStudyRoomId(divisionSlug),
      divisionId: division.id,
      name: "기본 자습실",
      columns: 9,
      rows: 6,
      aisleColumns: [5],
      isActive: true,
      displayOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies MockStudyRoomRecord[];
}

function createInitialSeats(divisionSlug: string, divisions?: MockDivisionRecord[]) {
  const division = findDivisionRecord(divisionSlug, divisions);

  if (!division) {
    return [];
  }

  const now = new Date().toISOString();

  return createDefaultSeatDraftLayout().map((seat, index) => ({
    id: `mock-seat-${divisionSlug}-${index}`,
    divisionId: division.id,
    studyRoomId: getDefaultStudyRoomId(divisionSlug),
    label: seat.label,
    positionX: seat.positionX,
    positionY: seat.positionY,
    isActive: seat.isActive,
    createdAt: now,
    updatedAt: now,
  }));
}

function createInitialTuitionPlans(divisionSlug: string, divisions?: MockDivisionRecord[]) {
  const division = findDivisionRecord(divisionSlug, divisions);

  if (!division) {
    return [];
  }

  const now = new Date().toISOString();

  return getDefaultTuitionPlanTemplates(divisionSlug).map((plan, index) => ({
    id: `mock-tuition-plan-${divisionSlug}-${index}`,
    divisionId: division.id,
    name: plan.name,
    durationDays: plan.durationDays,
    amount: plan.amount,
    description: plan.description ?? null,
    isActive: true,
    displayOrder: index,
    createdAt: now,
    updatedAt: now,
  })) satisfies MockTuitionPlanRecord[];
}

function createInitialPointRules(divisionSlug: string, divisions?: MockDivisionRecord[]) {
  const division = findDivisionRecord(divisionSlug, divisions);

  if (!division) {
    return [];
  }

  const now = new Date().toISOString();

  return DEFAULT_POINT_RULE_TEMPLATES.map((rule, index) => ({
    id: `mock-point-rule-${divisionSlug}-${index}`,
    divisionId: division.id,
    category: rule.category,
    name: rule.name,
    points: rule.points,
    description: rule.description,
    isActive: true,
    displayOrder: index,
    createdAt: now,
    updatedAt: now,
  }));
}

function createInitialPointRecords(divisionSlug: string) {
  const now = new Date().toISOString();
  const students = createInitialStudents(divisionSlug);
  const rules = createInitialPointRules(divisionSlug);
  const studentByNumber = new Map(students.map((student) => [student.studentNumber, student.id]));
  const ruleByName = new Map(rules.map((rule) => [rule.name, rule.id]));

  if (divisionSlug === "police") {
    return [
      {
        id: `mock-point-record-${divisionSlug}-1`,
        studentId: studentByNumber.get("P-2026-001") ?? "",
        ruleId: ruleByName.get("무단결석") ?? null,
        points: -10,
        date: "2026-03-18T09:00:00.000Z",
        notes: "1차 경고 샘플",
        recordedById: "mock-admin-police",
        createdAt: now,
      },
      {
        id: `mock-point-record-${divisionSlug}-2`,
        studentId: studentByNumber.get("P-2026-002") ?? "",
        ruleId: null,
        points: -21,
        date: "2026-03-17T09:00:00.000Z",
        notes: "2차 경고 샘플",
        recordedById: "mock-admin-police",
        createdAt: now,
      },
      {
        id: `mock-point-record-${divisionSlug}-3`,
        studentId: studentByNumber.get("P-2026-003") ?? "",
        ruleId: null,
        points: -25,
        date: "2026-03-16T09:00:00.000Z",
        notes: "면담 대상 샘플",
        recordedById: "mock-admin-police",
        createdAt: now,
      },
      {
        id: `mock-point-record-${divisionSlug}-4`,
        studentId: studentByNumber.get("P-2026-004") ?? "",
        ruleId: null,
        points: -30,
        date: "2026-03-15T09:00:00.000Z",
        notes: "퇴실 대상 샘플",
        recordedById: "mock-admin-police",
        createdAt: now,
      },
    ].filter((record) => record.studentId);
  }

  return [
    {
      id: `mock-point-record-${divisionSlug}-1`,
      studentId: studentByNumber.get("F-2026-001") ?? "",
      ruleId: ruleByName.get("지각") ?? null,
      points: -1,
      date: "2026-03-18T09:00:00.000Z",
      notes: "소방반 샘플",
      recordedById: "mock-admin-fire",
      createdAt: now,
    },
  ].filter((record) => record.studentId);
}

function createInitialPaymentCategories(divisionSlug: string, divisions?: MockDivisionRecord[]) {
  const division = findDivisionRecord(divisionSlug, divisions);

  if (!division) {
    return [];
  }

  const now = new Date().toISOString();
  const categories = ["등록비", "월납부", "교재비", "환불"];

  return categories.map((name, index) => ({
    id: `mock-payment-category-${divisionSlug}-${index}`,
    divisionId: division.id,
    name,
    isActive: true,
    displayOrder: index,
    createdAt: now,
    updatedAt: now,
  }));
}

function createInitialPaymentRecords(divisionSlug: string) {
  const students = createInitialStudents(divisionSlug);
  const categories = createInitialPaymentCategories(divisionSlug);
  const categoryByName = new Map(categories.map((category) => [category.name, category.id]));
  const studentByNumber = new Map(students.map((student) => [student.studentNumber, student.id]));
  const now = new Date().toISOString();

  if (divisionSlug === "police") {
    return [
      {
        id: `mock-payment-record-${divisionSlug}-1`,
        studentId: studentByNumber.get("P-2026-001") ?? "",
        paymentTypeId: categoryByName.get("등록비") ?? "",
        amount: 300000,
        paymentDate: "2026-03-01",
        method: "계좌이체",
        paymentGroupId: null,
        originalPaymentId: null,
        notes: "등록비 납부 완료",
        recordedById: "mock-admin-police",
        createdAt: now,
      },
      {
        id: `mock-payment-record-${divisionSlug}-2`,
        studentId: studentByNumber.get("P-2026-001") ?? "",
        paymentTypeId: categoryByName.get("월납부") ?? "",
        amount: 250000,
        paymentDate: "2026-03-05",
        method: "카드",
        paymentGroupId: null,
        originalPaymentId: null,
        notes: "3월 월납부",
        recordedById: "mock-admin-police",
        createdAt: now,
      },
      {
        id: `mock-payment-record-${divisionSlug}-3`,
        studentId: studentByNumber.get("P-2026-002") ?? "",
        paymentTypeId: categoryByName.get("월납부") ?? "",
        amount: 250000,
        paymentDate: "2026-03-06",
        method: "현금",
        paymentGroupId: null,
        originalPaymentId: null,
        notes: "3월 월납부",
        recordedById: "mock-admin-police",
        createdAt: now,
      },
    ].filter((record) => record.studentId && record.paymentTypeId);
  }

  return [
    {
      id: `mock-payment-record-${divisionSlug}-1`,
      studentId: studentByNumber.get("F-2026-001") ?? "",
      paymentTypeId: categoryByName.get("등록비") ?? "",
      amount: 280000,
      paymentDate: "2026-03-02",
      method: "계좌이체",
      paymentGroupId: null,
      originalPaymentId: null,
      notes: "소방반 등록비",
      recordedById: "mock-admin-fire",
      createdAt: now,
    },
    {
      id: `mock-payment-record-${divisionSlug}-2`,
      studentId: studentByNumber.get("F-2026-002") ?? "",
      paymentTypeId: categoryByName.get("월납부") ?? "",
      amount: 240000,
      paymentDate: "2026-03-07",
      method: "카드",
      paymentGroupId: null,
      originalPaymentId: null,
      notes: "3월 월납부",
      recordedById: "mock-admin-fire",
      createdAt: now,
    },
  ].filter((record) => record.studentId && record.paymentTypeId);
}

function createInitialLeavePermissions(divisionSlug: string) {
  const students = createInitialStudents(divisionSlug);
  const studentByNumber = new Map(students.map((student) => [student.studentNumber, student.id]));
  const now = new Date().toISOString();

  if (divisionSlug === "police") {
    const records: MockLeavePermissionRecord[] = [
      {
        id: `mock-leave-${divisionSlug}-1`,
        studentId: studentByNumber.get("P-2026-001") ?? "",
        type: "HALF_DAY",
        date: "2026-03-19",
        reason: "병원 진료",
        approvedById: "mock-admin-police",
        status: "USED",
        createdAt: now,
      },
      {
        id: `mock-leave-${divisionSlug}-2`,
        studentId: studentByNumber.get("P-2026-003") ?? "",
        type: "HOLIDAY",
        date: "2026-03-12",
        reason: "가족 일정",
        approvedById: "mock-admin-police",
        status: "USED",
        createdAt: now,
      },
      {
        id: `mock-leave-${divisionSlug}-3`,
        studentId: studentByNumber.get("P-2026-002") ?? "",
        type: "OUTING",
        date: "2026-03-25",
        reason: "면접 일정",
        approvedById: "mock-admin-police",
        status: "APPROVED",
        createdAt: now,
      },
    ];

    return records.filter((record) => Boolean(record.studentId));
  }

  const records: MockLeavePermissionRecord[] = [
    {
      id: `mock-leave-${divisionSlug}-1`,
      studentId: studentByNumber.get("F-2026-001") ?? "",
      type: "HEALTH",
      date: "2026-03-18",
      reason: "감기 증상",
      approvedById: "mock-admin-fire",
      status: "USED",
      createdAt: now,
    },
  ];

  return records.filter((record) => Boolean(record.studentId));
}

function createInitialInterviews(divisionSlug: string) {
  const students = createInitialStudents(divisionSlug);
  const studentByNumber = new Map(students.map((student) => [student.studentNumber, student.id]));
  const now = new Date().toISOString();

  if (divisionSlug === "police") {
    const records: MockInterviewRecord[] = [
      {
        id: `mock-interview-${divisionSlug}-1`,
        studentId: studentByNumber.get("P-2026-003") ?? "",
        date: "2026-03-18",
        trigger: "벌점 25점 도달",
        reason: "면담 권장 기준 초과",
        content: "최근 무단결석과 지각 누적으로 학습 흐름이 흔들리고 있습니다.",
        result: "다음 주까지 출석 정상화 계획서를 제출하기로 합의했습니다.",
        resultType: "INTERVIEW",
        createdById: "mock-admin-police",
        createdAt: now,
      },
      {
        id: `mock-interview-${divisionSlug}-2`,
        studentId: studentByNumber.get("P-2026-004") ?? "",
        date: "2026-03-17",
        trigger: "벌점 30점 도달",
        reason: "퇴실 전 최종 면담",
        content: "무단결석 누적과 생활 규정 위반에 대한 최종 확인이 필요했습니다.",
        result: "2주 유예 후 출석 추이를 다시 평가하기로 했습니다.",
        resultType: "WITHDRAWAL",
        createdById: "mock-admin-police",
        createdAt: now,
      },
    ];

    return records.filter((record) => Boolean(record.studentId));
  }

  const records: MockInterviewRecord[] = [
    {
      id: `mock-interview-${divisionSlug}-1`,
      studentId: studentByNumber.get("F-2026-001") ?? "",
      date: "2026-03-19",
      trigger: "벌점 10점 도달",
      reason: "학습 루틴 점검",
      content: "최근 아침 입실 시간이 들쭉날쭉해 루틴 재정비가 필요합니다.",
      result: "다음 주까지 지각 0회를 목표로 관리하기로 했습니다.",
      resultType: "WARNING_1",
      createdById: "mock-admin-fire",
      createdAt: now,
    },
  ];

  return records.filter((record) => Boolean(record.studentId));
}

function createInitialAnnouncements(divisionSlug: string, divisions?: MockDivisionRecord[]) {
  const division = findDivisionRecord(divisionSlug, divisions);

  if (!division) {
    return [];
  }

  if (divisionSlug === "police") {
    return [
      {
        id: "mock-announcement-police-1",
        divisionId: division.id,
        title: "주간 모의고사 안내",
        content:
          "이번 주 토요일 0교시에는 전원 주간 모의고사를 진행합니다. 답안지 마킹 시간을 포함해 08:30까지 착석해 주세요.",
        isPinned: true,
        publishedAt: null,
        createdById: "mock-admin-police",
        createdAt: "2026-03-18T09:00:00.000Z",
        updatedAt: "2026-03-18T09:00:00.000Z",
      },
      {
        id: "mock-announcement-police-2",
        divisionId: division.id,
        title: "출석 기준 재안내",
        content:
          "지각 기준은 교시 시작 후 20분입니다. 조교 확인 전까지는 미처리 상태로 남을 수 있으니 당일 내에 반드시 확인해 주세요.",
        isPinned: true,
        publishedAt: null,
        createdById: "mock-admin-police",
        createdAt: "2026-03-17T09:00:00.000Z",
        updatedAt: "2026-03-17T09:00:00.000Z",
      },
    ] satisfies MockAnnouncementRecord[];
  }

  if (divisionSlug !== "fire") {
    return [
      {
        id: `mock-announcement-${divisionSlug}-1`,
        divisionId: division.id,
        title: `${division.name} 운영 안내`,
        content: `${division.name}은 경찰/소방반과 분리된 독립 지점입니다. 관리자 설정에서 교시, 규칙, 시험, 좌석을 각 지점 기준으로 직접 운영하세요.`,
        isPinned: true,
        publishedAt: null,
        createdById: getDefaultAdminId(divisionSlug),
        createdAt: "2026-03-18T09:00:00.000Z",
        updatedAt: "2026-03-18T09:00:00.000Z",
      },
    ] satisfies MockAnnouncementRecord[];
  }

  return [
    {
      id: "mock-announcement-fire-1",
      divisionId: division.id,
      title: "체력 일정 공지",
      content:
        "이번 주 금요일 오후에는 체력 측정 일정이 있습니다. 오전 수업 출결은 정상 집계됩니다.",
      isPinned: true,
      publishedAt: null,
      createdById: "mock-admin-fire",
      createdAt: "2026-03-18T09:00:00.000Z",
      updatedAt: "2026-03-18T09:00:00.000Z",
    },
  ] satisfies MockAnnouncementRecord[];
}

function createInitialGlobalAnnouncements() {
  return [
    {
      id: "mock-announcement-global-1",
      divisionId: null,
      title: "공통 운영 안내",
      content: "이번 달 말 시스템 점검이 예정되어 있습니다. 점검 당일에는 모바일 출석 저장 후 새로고침을 한 번 더 확인해 주세요.",
      isPinned: true,
      publishedAt: null,
      createdById: "mock-admin-police",
      createdAt: "2026-03-16T09:00:00.000Z",
      updatedAt: "2026-03-16T09:00:00.000Z",
    },
  ] satisfies MockAnnouncementRecord[];
}

function sumMockScores(scores: Record<string, number | null>) {
  const numericScores = Object.values(scores).filter((value): value is number => typeof value === "number");
  return numericScores.length > 0 ? numericScores.reduce((sum, value) => sum + value, 0) : null;
}

function normalizeMockExamSubjectRecord(
  subject: Partial<MockExamSubjectRecord>,
  examTypeId: string,
  index: number,
  now: string,
): MockExamSubjectRecord {
  return {
    id: typeof subject.id === "string" ? subject.id : `mock-exam-subject-${examTypeId}-${index}`,
    examTypeId,
    name: typeof subject.name === "string" ? subject.name : `과목 ${index + 1}`,
    totalItems: typeof subject.totalItems === "number" ? subject.totalItems : null,
    pointsPerItem: typeof subject.pointsPerItem === "number" ? subject.pointsPerItem : null,
    displayOrder: typeof subject.displayOrder === "number" ? subject.displayOrder : index,
    isActive: typeof subject.isActive === "boolean" ? subject.isActive : true,
    createdAt: typeof subject.createdAt === "string" ? subject.createdAt : now,
    updatedAt: typeof subject.updatedAt === "string" ? subject.updatedAt : now,
  };
}

function normalizeMockExamTypeRecord(
  examType: Partial<MockExamTypeRecord>,
  divisionId: string,
  divisionSlug: string,
  index: number,
  now: string,
): MockExamTypeRecord {
  const examTypeId =
    typeof examType.id === "string" ? examType.id : `mock-exam-type-${divisionSlug}-${index}`;

  return {
    id: examTypeId,
    divisionId,
    name: typeof examType.name === "string" ? examType.name : `시험 ${index + 1}`,
    category: examType.category === "MORNING" ? "MORNING" : "REGULAR",
    studyTrack: typeof examType.studyTrack === "string" ? examType.studyTrack : null,
    isActive: typeof examType.isActive === "boolean" ? examType.isActive : true,
    displayOrder: typeof examType.displayOrder === "number" ? examType.displayOrder : index,
    createdAt: typeof examType.createdAt === "string" ? examType.createdAt : now,
    updatedAt: typeof examType.updatedAt === "string" ? examType.updatedAt : now,
    subjects: Array.isArray(examType.subjects)
      ? examType.subjects.map((subject, subjectIndex) =>
          normalizeMockExamSubjectRecord(subject, examTypeId, subjectIndex, now),
        )
      : [],
  };
}

function assignMockExamRanks<T extends { totalScore: number | null }>(records: T[]) {
  const ranked = [...records].sort(
    (left, right) => (right.totalScore ?? -1) - (left.totalScore ?? -1),
  );
  const rankByScore = new Map<number, number>();

  ranked.forEach((record, index) => {
    if (record.totalScore === null || rankByScore.has(record.totalScore)) {
      return;
    }

    rankByScore.set(record.totalScore, index + 1);
  });

  return records.map((record) => {
    if (record.totalScore === null) {
      return {
        ...record,
        rankInClass: null,
      };
    }

    return {
      ...record,
      rankInClass: rankByScore.get(record.totalScore) ?? null,
    };
  });
}

function createInitialExamTypes(divisionSlug: string, divisions?: MockDivisionRecord[]) {
  const division = findDivisionRecord(divisionSlug, divisions);

  if (!division) {
    return [];
  }

  const now = new Date().toISOString();
  const templates =
    divisionSlug === "police"
      ? [
          {
            name: "경찰 공채",
            studyTrack: "경찰",
            subjects: [
              { name: "국어", totalItems: 20, pointsPerItem: 5 },
              { name: "영어", totalItems: 20, pointsPerItem: 5 },
              { name: "한국사", totalItems: 20, pointsPerItem: 5 },
              { name: "형사법", totalItems: 20, pointsPerItem: 5 },
              { name: "경찰학", totalItems: 20, pointsPerItem: 5 },
            ],
          },
        ]
      : divisionSlug === "fire"
        ? [
            {
              name: "소방 공채",
              studyTrack: "소방",
              subjects: [
                { name: "국어", totalItems: 20, pointsPerItem: 5 },
                { name: "영어", totalItems: 20, pointsPerItem: 5 },
                { name: "한국사", totalItems: 20, pointsPerItem: 5 },
                { name: "소방학개론", totalItems: 20, pointsPerItem: 5 },
                { name: "소방관계법규", totalItems: 20, pointsPerItem: 5 },
              ],
            },
          ]
        : [
            {
              name: "주간 모의고사",
              studyTrack: "경찰",
              subjects: [
                { name: "국어", totalItems: 20, pointsPerItem: 5 },
                { name: "영어", totalItems: 20, pointsPerItem: 5 },
                { name: "한국사", totalItems: 20, pointsPerItem: 5 },
                { name: "형사법", totalItems: 20, pointsPerItem: 5 },
                { name: "경찰학", totalItems: 20, pointsPerItem: 5 },
              ],
            },
            {
              name: "주간 모의고사",
              studyTrack: "소방",
              subjects: [
                { name: "국어", totalItems: 20, pointsPerItem: 5 },
                { name: "영어", totalItems: 20, pointsPerItem: 5 },
                { name: "한국사", totalItems: 20, pointsPerItem: 5 },
                { name: "소방학개론", totalItems: 20, pointsPerItem: 5 },
                { name: "소방관계법규", totalItems: 20, pointsPerItem: 5 },
              ],
            },
            {
              name: "월간 실전 모의고사",
              studyTrack: "9급공무원",
              subjects: [
                { name: "국어", totalItems: 20, pointsPerItem: 5 },
                { name: "영어", totalItems: 20, pointsPerItem: 5 },
                { name: "한국사", totalItems: 20, pointsPerItem: 5 },
                { name: "행정법", totalItems: 20, pointsPerItem: 5 },
                { name: "행정학", totalItems: 20, pointsPerItem: 5 },
              ],
            },
            {
              name: "월간 실전 모의고사",
              studyTrack: "행정직",
              subjects: [
                { name: "국어", totalItems: 20, pointsPerItem: 5 },
                { name: "영어", totalItems: 20, pointsPerItem: 5 },
                { name: "한국사", totalItems: 20, pointsPerItem: 5 },
                { name: "행정법", totalItems: 20, pointsPerItem: 5 },
                { name: "행정학", totalItems: 20, pointsPerItem: 5 },
              ],
            },
          ];

  return templates.map((template, examTypeIndex) => {
    const examTypeId = `mock-exam-type-${divisionSlug}-${examTypeIndex}`;

    return {
      id: examTypeId,
      divisionId: division.id,
      name: template.name,
      category: "REGULAR" as MockExamCategory,
      studyTrack: template.studyTrack ?? null,
      isActive: true,
      displayOrder: examTypeIndex,
      createdAt: now,
      updatedAt: now,
      subjects: template.subjects.map((subject, subjectIndex) => ({
        id: `mock-exam-subject-${divisionSlug}-${examTypeIndex}-${subjectIndex}`,
        examTypeId,
        name: subject.name,
        totalItems: subject.totalItems,
        pointsPerItem: subject.pointsPerItem ?? null,
        displayOrder: subjectIndex,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })),
    } satisfies MockExamTypeRecord;
  });
}

function createInitialExamScores(divisionSlug: string) {
  const examTypes = createInitialExamTypes(divisionSlug);
  const examType = examTypes[0];
  const students = createInitialStudents(divisionSlug);

  if (!examType) {
    return [];
  }

  const eligibleStudents = students.filter(
    (student) =>
      !examType.studyTrack ||
      student.studyTrack === examType.studyTrack,
  );
  const studentByNumber = new Map(eligibleStudents.map((student) => [student.studentNumber, student.id]));
  const subjectIds = examType.subjects.map((subject) => subject.id);
  const now = new Date().toISOString();
  const templates =
    divisionSlug === "police"
      ? [
          { studentNumber: "P-2026-001", scores: [80, 76, 72, 84, 0], examRound: 12, examDate: "2026-03-15", notes: "형사법 안정" },
          { studentNumber: "P-2026-002", scores: [88, 80, 78, 86, 0], examRound: 12, examDate: "2026-03-15", notes: "상위권 유지" },
          { studentNumber: "P-2026-003", scores: [72, 68, 74, 70, 0], examRound: 12, examDate: "2026-03-15", notes: "기초 과목 보완 필요" },
          { studentNumber: "P-2026-004", scores: [65, 62, 71, 66, 0], examRound: 12, examDate: "2026-03-15", notes: "지문 분석 훈련 필요" },
        ]
      : divisionSlug === "fire"
        ? [
          { studentNumber: "F-2026-001", scores: [76, 74, 70, 72, 68], examRound: 8, examDate: "2026-03-14", notes: "고른 점수 분포" },
          { studentNumber: "F-2026-002", scores: [82, 79, 76, 74, 71], examRound: 8, examDate: "2026-03-14", notes: "영어 우세" },
          { studentNumber: "F-2026-003", scores: [69, 64, 72, 70, 66], examRound: 8, examDate: "2026-03-14", notes: "법규 복습 필요" },
        ]
        : eligibleStudents.slice(0, 3).map((student, index) => ({
            studentNumber: student.studentNumber,
            scores: [
              Math.max(92 - index * 6, 55),
              Math.max(88 - index * 5, 55),
              Math.max(84 - index * 4, 55),
              Math.max(80 - index * 3, 55),
              Math.max(76 - index * 2, 55),
            ],
            examRound: 4,
            examDate: "2026-03-14",
            notes: `${divisionSlug} 기본 성적 샘플`,
          }));

  return assignMockExamRanks(
    templates
      .map((template, index) => {
        const studentId = studentByNumber.get(template.studentNumber);

        if (!studentId) {
          return null;
        }

        const scores = Object.fromEntries(
          subjectIds.map((subjectId, scoreIndex) => [subjectId, template.scores[scoreIndex] ?? null]),
        );

        return {
          id: `mock-exam-score-${divisionSlug}-${index}`,
          studentId,
          examTypeId: examType.id,
          examRound: template.examRound,
          examDate: template.examDate,
          scores,
          totalScore: sumMockScores(scores),
          rankInClass: null,
          notes: template.notes,
          recordedById: `mock-admin-${divisionSlug}`,
          createdAt: now,
          updatedAt: now,
        } satisfies MockExamScoreRecord;
      })
      .filter(Boolean) as MockExamScoreRecord[],
  );
}

function createInitialScoreTargets() {
  return [] satisfies MockScoreTargetRecord[];
}

function createInitialExamSchedules(divisionSlug: string, divisions?: MockDivisionRecord[]): MockExamScheduleRecord[] {
  const division = findDivisionRecord(divisionSlug, divisions);

  if (!division) {
    return [];
  }

  const now = new Date().toISOString();
  const adminId = getDefaultAdminId(divisionSlug);

  const templates: Array<{ name: string; type: MockExamScheduleType; examDate: string; description?: string }> =
    divisionSlug === "police"
      ? [
          { name: "경찰공채 필기시험", type: "WRITTEN", examDate: "2026-06-20", description: "경찰공무원 공개경쟁채용 필기시험" },
          { name: "경찰공채 체력검사", type: "PHYSICAL", examDate: "2026-08-15", description: "체력검사 및 적성검사" },
          { name: "경찰공채 면접시험", type: "INTERVIEW", examDate: "2026-09-10" },
          { name: "경찰공채 최종합격자 발표", type: "RESULT", examDate: "2026-10-05" },
        ]
      : divisionSlug === "fire"
        ? [
            { name: "소방공채 필기시험", type: "WRITTEN", examDate: "2026-05-30", description: "소방공무원 공개경쟁채용 필기시험" },
            { name: "소방공채 체력시험", type: "PHYSICAL", examDate: "2026-08-01", description: "소방체력검사" },
            { name: "소방공채 면접시험", type: "INTERVIEW", examDate: "2026-09-05" },
            { name: "소방공채 최종합격자 발표", type: "RESULT", examDate: "2026-09-25" },
          ]
        : [
            { name: "공개채용 필기시험", type: "WRITTEN", examDate: "2026-06-15" },
          ];

  return templates.map((template, index) => ({
    id: `mock-exam-schedule-${divisionSlug}-${index}`,
    divisionId: division.id,
    name: template.name,
    type: template.type,
    examDate: template.examDate,
    description: template.description ?? null,
    isActive: true,
    createdById: adminId,
    createdAt: now,
    updatedAt: now,
  }));
}

function createInitialState(): MockState {
  const divisions = getDefaultDivisionRecords();
  const divisionSettingsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createDefaultDivisionSettingsRecord(division)]),
  );
  const admins = createInitialAdmins(divisions);
  const periodsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialPeriods(division.slug, divisions)]),
  );
  const attendanceByDivision = Object.fromEntries(divisions.map((division) => [division.slug, []]));
  const studentsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialStudentsWithDivisions(division.slug)]),
  );
  const studyRoomsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialStudyRooms(division.slug, divisions)]),
  );
  const seatsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialSeats(division.slug, divisions)]),
  );
  const pointRulesByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialPointRules(division.slug, divisions)]),
  );
  const pointRecordsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialPointRecords(division.slug)]),
  );
  const paymentCategoriesByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialPaymentCategories(division.slug, divisions)]),
  );
  const paymentRecordsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialPaymentRecords(division.slug)]),
  );
  const tuitionPlansByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialTuitionPlans(division.slug, divisions)]),
  );
  const leavePermissionsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialLeavePermissions(division.slug)]),
  );
  const interviewsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialInterviews(division.slug)]),
  );
  const announcementsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialAnnouncements(division.slug, divisions)]),
  );
  const globalAnnouncements = createInitialGlobalAnnouncements();
  const examTypesByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialExamTypes(division.slug, divisions)]),
  );
  const examScoresByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialExamScores(division.slug)]),
  );
  const scoreTargetsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialScoreTargets()]),
  );
  const examSchedulesByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, createInitialExamSchedules(division.slug, divisions)]),
  );
  const phoneSubmissionsByDivision = Object.fromEntries(
    divisions.map((division) => [division.slug, [] as MockPhoneSubmissionRecord[]]),
  );

  return {
    deletedDivisionSlugs: [],
    divisions,
    divisionSettingsByDivision,
    admins,
    periodsByDivision,
    attendanceByDivision,
    studentsByDivision,
    studyRoomsByDivision,
    seatsByDivision,
    pointRulesByDivision,
    pointRecordsByDivision,
    paymentCategoriesByDivision,
    paymentRecordsByDivision,
    tuitionPlansByDivision,
    leavePermissionsByDivision,
    interviewsByDivision,
    announcementsByDivision,
    globalAnnouncements,
    examTypesByDivision,
    examScoresByDivision,
    morningExamScoresByDivision: Object.fromEntries(
      divisions.map((d) => [d.slug, [] as MockMorningExamScoreRecord[]]),
    ),
    scoreTargetsByDivision,
    examSchedulesByDivision,
    phoneSubmissionsByDivision,
  };
}

function normalizeMockState(rawState: Partial<MockState> | null | undefined) {
  const state = rawState ?? {};
  const deletedDivisionSlugs = Array.from(
    new Set((state.deletedDivisionSlugs ?? []).filter((slug): slug is string => typeof slug === "string")),
  );
  const deletedDivisionSlugSet = new Set(deletedDivisionSlugs);
  const defaultDivisions = getDefaultDivisionRecords().filter(
    (division) => !deletedDivisionSlugSet.has(division.slug),
  );
  const divisionBySlug = new Map(defaultDivisions.map((division) => [division.slug, division]));

  for (const division of Array.isArray(state.divisions) ? state.divisions : []) {
    if (deletedDivisionSlugSet.has(division.slug)) {
      continue;
    }

    const serialized = serializeDivisionRecord(division);
    divisionBySlug.set(serialized.slug, serialized);
  }

  const normalizedDivisions = Array.from(divisionBySlug.values()).sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );

  const periodsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.periodsByDivision?.[divisionSlug])
        ? state.periodsByDivision?.[divisionSlug]
        : createInitialPeriods(divisionSlug, normalizedDivisions),
    ]),
  );

  const divisionSettingsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => {
      const division = findDivisionRecord(divisionSlug, normalizedDivisions);

      return [
        divisionSlug,
        state.divisionSettingsByDivision?.[divisionSlug] && division
          ? {
              ...createDefaultDivisionSettingsRecord(division),
              ...state.divisionSettingsByDivision[divisionSlug],
              divisionId: division.id,
            }
          : division
            ? createDefaultDivisionSettingsRecord(division)
            : null,
      ];
    }),
  );

  const defaultAdmins: MockAdminRecord[] = createInitialAdmins(normalizedDivisions);
  const adminById = new Map(defaultAdmins.map((admin) => [admin.id, admin]));

  for (const admin of Array.isArray(state.admins) ? state.admins : []) {
    adminById.set(admin.id, admin);
  }

  const admins = Array.from(adminById.values());

  const attendanceByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.attendanceByDivision?.[divisionSlug])
        ? state.attendanceByDivision[divisionSlug].map((record) => ({
            ...record,
            checkInTime: record.checkInTime ?? null,
          }))
        : [],
    ]),
  );

  const studyRoomsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.studyRoomsByDivision?.[divisionSlug]) && state.studyRoomsByDivision?.[divisionSlug]?.length
        ? state.studyRoomsByDivision[divisionSlug].map((room) => ({
            ...room,
            divisionId:
              findDivisionRecord(divisionSlug, normalizedDivisions)?.id ?? room.divisionId,
            columns: Number(room.columns) > 0 ? Number(room.columns) : 9,
            rows: Number(room.rows) > 0 ? Number(room.rows) : 6,
            aisleColumns: Array.isArray(room.aisleColumns)
              ? room.aisleColumns
                  .map((value) => Number(value))
                  .filter((value) => Number.isInteger(value) && value >= 1)
              : [5],
          }))
        : createInitialStudyRooms(divisionSlug, normalizedDivisions),
    ]),
  );

  const studentsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.studentsByDivision?.[divisionSlug])
        ? state.studentsByDivision[divisionSlug].map((student) => {
            const divisionSeats = Array.isArray(state.seatsByDivision?.[divisionSlug])
              ? state.seatsByDivision[divisionSlug]
              : createInitialSeats(divisionSlug, normalizedDivisions);
            const matchedSeat =
              (student.seatId
                ? divisionSeats.find((seat) => seat.id === student.seatId)
                : null) ??
              (student.seatLabel
                ? divisionSeats.find((seat) => seat.label === student.seatLabel)
                : null);

            return {
              ...student,
              seatId: matchedSeat?.id ?? null,
              seatLabel: matchedSeat?.label ?? student.seatLabel ?? null,
              courseStartDate: student.courseStartDate ?? student.enrolledAt.slice(0, 10),
              courseEndDate: student.courseEndDate ?? null,
              tuitionPlanId: student.tuitionPlanId ?? null,
              tuitionAmount: student.tuitionAmount ?? null,
              tuitionExempt: student.tuitionExempt ?? false,
              tuitionExemptReason: student.tuitionExemptReason ?? null,
            };
          })
        : createInitialStudentsWithDivisions(divisionSlug),
    ]),
  );

  const seatsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.seatsByDivision?.[divisionSlug])
        ? state.seatsByDivision[divisionSlug].map((seat) => ({
            ...seat,
            divisionId: findDivisionRecord(divisionSlug, normalizedDivisions)?.id ?? seat.divisionId,
            studyRoomId: seat.studyRoomId ?? studyRoomsByDivision[divisionSlug]?.[0]?.id ?? getDefaultStudyRoomId(divisionSlug),
          }))
        : createInitialSeats(divisionSlug, normalizedDivisions),
    ]),
  );

  const pointRulesByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.pointRulesByDivision?.[divisionSlug])
        ? state.pointRulesByDivision?.[divisionSlug]
        : createInitialPointRules(divisionSlug, normalizedDivisions),
    ]),
  );

  const pointRecordsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.pointRecordsByDivision?.[divisionSlug])
        ? state.pointRecordsByDivision?.[divisionSlug]
        : createInitialPointRecords(divisionSlug),
    ]),
  );

  const paymentCategoriesByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.paymentCategoriesByDivision?.[divisionSlug])
        ? state.paymentCategoriesByDivision?.[divisionSlug]
        : createInitialPaymentCategories(divisionSlug, normalizedDivisions),
    ]),
  );

  const paymentRecordsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.paymentRecordsByDivision?.[divisionSlug])
        ? state.paymentRecordsByDivision[divisionSlug].map((record) => ({
            ...record,
            method: record.method ?? "other",
            paymentGroupId: record.paymentGroupId ?? null,
            originalPaymentId: record.originalPaymentId ?? null,
          }))
        : createInitialPaymentRecords(divisionSlug),
    ]),
  );

  const tuitionPlansByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.tuitionPlansByDivision?.[divisionSlug]) && state.tuitionPlansByDivision?.[divisionSlug]?.length
        ? state.tuitionPlansByDivision[divisionSlug].map((plan, index) => ({
            ...plan,
            divisionId:
              findDivisionRecord(divisionSlug, normalizedDivisions)?.id ?? plan.divisionId,
            displayOrder: Number.isInteger(plan.displayOrder) ? plan.displayOrder : index,
            durationDays:
              typeof plan.durationDays === "number" && Number.isFinite(plan.durationDays)
                ? plan.durationDays
                : null,
            description: plan.description ?? null,
          }))
        : createInitialTuitionPlans(divisionSlug, normalizedDivisions),
    ]),
  );

  const leavePermissionsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.leavePermissionsByDivision?.[divisionSlug])
        ? state.leavePermissionsByDivision?.[divisionSlug]
        : createInitialLeavePermissions(divisionSlug),
    ]),
  );

  const interviewsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.interviewsByDivision?.[divisionSlug])
        ? state.interviewsByDivision?.[divisionSlug]
        : createInitialInterviews(divisionSlug),
    ]),
  );

  const announcementsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.announcementsByDivision?.[divisionSlug])
        ? state.announcementsByDivision?.[divisionSlug].map((announcement) => ({
            ...announcement,
            publishedAt: announcement.publishedAt ?? null,
          }))
        : createInitialAnnouncements(divisionSlug, normalizedDivisions),
    ]),
  );

  const globalAnnouncements = Array.isArray(state.globalAnnouncements)
    ? state.globalAnnouncements.map((announcement) => ({
        ...announcement,
        publishedAt: announcement.publishedAt ?? null,
      }))
    : createInitialGlobalAnnouncements();

  const examTypesByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.examTypesByDivision?.[divisionSlug])
        ? state.examTypesByDivision?.[divisionSlug].map((examType, index) =>
            normalizeMockExamTypeRecord(
              examType,
              findDivisionRecord(divisionSlug, normalizedDivisions)?.id ?? `div-${divisionSlug}`,
              divisionSlug,
              index,
              new Date().toISOString(),
            ),
          )
        : createInitialExamTypes(divisionSlug, normalizedDivisions),
    ]),
  );

  const examScoresByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.examScoresByDivision?.[divisionSlug])
        ? state.examScoresByDivision?.[divisionSlug]
        : createInitialExamScores(divisionSlug),
    ]),
  );

  const scoreTargetsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.scoreTargetsByDivision?.[divisionSlug])
        ? state.scoreTargetsByDivision[divisionSlug].map((target) => ({
            id: target.id,
            studentId: target.studentId,
            examTypeId: target.examTypeId,
            targetScore:
              typeof target.targetScore === "number" && Number.isFinite(target.targetScore)
                ? Math.trunc(target.targetScore)
                : 0,
            note: target.note ?? null,
            createdAt:
              typeof target.createdAt === "string" ? target.createdAt : new Date().toISOString(),
            updatedAt:
              typeof target.updatedAt === "string" ? target.updatedAt : new Date().toISOString(),
          }))
        : createInitialScoreTargets(),
    ]),
  );

  const examSchedulesByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.examSchedulesByDivision?.[divisionSlug])
        ? state.examSchedulesByDivision[divisionSlug]
        : createInitialExamSchedules(divisionSlug, normalizedDivisions),
    ]),
  );

  const phoneSubmissionsByDivision = Object.fromEntries(
    getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
      divisionSlug,
      Array.isArray(state.phoneSubmissionsByDivision?.[divisionSlug])
        ? state.phoneSubmissionsByDivision[divisionSlug].map((record) => {
            const r = record as Record<string, unknown>;
            const status: MockPhoneSubmissionStatus =
              typeof r.status === "string" &&
              (r.status === "SUBMITTED" || r.status === "NOT_SUBMITTED" || r.status === "RENTED")
                ? (r.status as MockPhoneSubmissionStatus)
                : r.submitted === false
                  ? "NOT_SUBMITTED"
                  : "SUBMITTED";
            return {
              ...record,
              periodId: typeof r.periodId === "string" ? r.periodId : "",
              status,
              rentalNote: typeof r.rentalNote === "string" ? r.rentalNote : null,
            } satisfies MockPhoneSubmissionRecord;
          })
        : [],
    ]),
  );

  return {
    deletedDivisionSlugs,
    divisions: normalizedDivisions,
    divisionSettingsByDivision: Object.fromEntries(
      Object.entries(divisionSettingsByDivision).filter((entry): entry is [string, MockDivisionSettingsRecord] => Boolean(entry[1])),
    ),
    admins,
    periodsByDivision,
    attendanceByDivision,
    studentsByDivision,
    studyRoomsByDivision,
    seatsByDivision,
    pointRulesByDivision,
    pointRecordsByDivision,
    paymentCategoriesByDivision,
    paymentRecordsByDivision,
    tuitionPlansByDivision,
    leavePermissionsByDivision,
    interviewsByDivision,
    announcementsByDivision,
    globalAnnouncements,
    examTypesByDivision,
    examScoresByDivision,
    morningExamScoresByDivision: Object.fromEntries(
      getDivisionSlugs({ ...state, divisions: normalizedDivisions, deletedDivisionSlugs }).map((divisionSlug) => [
        divisionSlug,
        Array.isArray(state.morningExamScoresByDivision?.[divisionSlug])
          ? state.morningExamScoresByDivision[divisionSlug]
          : [],
      ]),
    ),
    scoreTargetsByDivision,
    examSchedulesByDivision,
    phoneSubmissionsByDivision,
  } satisfies MockState;
}

async function withMockStateLock<T>(operation: () => Promise<T>) {
  const previous = mockStateQueue;
  let release = () => {};

  mockStateQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await operation();
  } finally {
    release();
  }
}

async function persistMockState(serialized: string) {
  // 원자적 쓰기: 임시파일에 먼저 쓴 뒤 rename으로 교체하여 부분 쓰기 방지
  const tempPath = `${mockStatePath}.tmp`;
  await writeFile(tempPath, serialized, "utf8");
  await writeFile(mockStateBackupPath, serialized, "utf8");
  await rename(tempPath, mockStatePath);
}

async function ensureMockStateFile() {
  await mkdir(mockDirectory, { recursive: true });

  try {
    const content = await readFile(mockStatePath, "utf8");

    if (!content.trim()) {
      throw new Error("empty mock state");
    }

    try {
      await readFile(mockStateBackupPath, "utf8");
    } catch {
      await writeFile(mockStateBackupPath, content, "utf8");
    }
  } catch {
    const serialized = JSON.stringify(createInitialState(), null, 2);
    await persistMockState(serialized);
  }
}

async function readNormalizedMockStateFile() {
  const content = await readFile(mockStatePath, "utf8");

  try {
    return normalizeMockState(JSON.parse(content) as Partial<MockState>);
  } catch {
    try {
      const backupContent = await readFile(mockStateBackupPath, "utf8");
      const normalized = normalizeMockState(JSON.parse(backupContent) as Partial<MockState>);
      await persistMockState(JSON.stringify(normalized, null, 2));
      return normalized;
    } catch {
      const normalized = normalizeMockState(createInitialState());
      await persistMockState(JSON.stringify(normalized, null, 2));
      return normalized;
    }
  }
}

export async function readMockState() {
  return withMockStateLock(async () => {
    await ensureMockStateFile();
    const normalized = await readNormalizedMockStateFile();
    await persistMockState(JSON.stringify(normalized, null, 2));
    return normalized;
  });
}

export async function writeMockState(state: MockState) {
  return withMockStateLock(async () => {
    await ensureMockStateFile();
    await persistMockState(JSON.stringify(normalizeMockState(state), null, 2));
  });
}

export async function updateMockState<T>(updater: (state: MockState) => Promise<T> | T) {
  return withMockStateLock(async () => {
    await ensureMockStateFile();
    const state = await readNormalizedMockStateFile();
    const result = await updater(state);
    await persistMockState(JSON.stringify(normalizeMockState(state), null, 2));
    return result;
  });
}
