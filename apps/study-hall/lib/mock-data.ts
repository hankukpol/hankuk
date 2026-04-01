import { DEFAULT_DIVISION_FEATURE_FLAGS, type DivisionFeatureFlags } from "@/lib/division-features";
import { DEFAULT_POINT_CATEGORIES } from "@/lib/point-meta";

export type MockDivision = {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  color: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
};

export type MockStudentStatus = "ACTIVE" | "ON_LEAVE" | "WITHDRAWN" | "GRADUATED";

export type MockStudent = {
  id: string;
  divisionId: string;
  divisionSlug: string;
  name: string;
  studentNumber: string;
  studyTrack: string | null;
  phone: string | null;
  seatId?: string | null;
  seatLabel: string | null;
  courseStartDate?: string | null;
  courseEndDate?: string | null;
  tuitionPlanId?: string | null;
  tuitionAmount?: number | null;
  tuitionExempt?: boolean;
  tuitionExemptReason?: string | null;
  status: MockStudentStatus;
  enrolledAt: string;
  withdrawnAt: string | null;
  withdrawnNote: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MockDivisionSettings = {
  divisionId: string;
  warnLevel1: number;
  warnLevel2: number;
  warnInterview: number;
  warnWithdraw: number;
  warnMsgLevel1: string;
  warnMsgLevel2: string;
  warnMsgInterview: string;
  warnMsgWithdraw: string;
  tardyMinutes: number;
  assistantPastEditAllowed: boolean;
  assistantPastEditDays: number;
  holidayLimit: number;
  halfDayLimit: number;
  healthLimit: number;
  holidayUnusedPts: number;
  halfDayUnusedPts: number;
  perfectAttendancePtsEnabled: boolean;
  perfectAttendancePts: number;
  expirationWarningDays: number;
  operatingDays: Record<string, boolean>;
  studyTracks: string[];
  pointCategories: string[];
  featureFlags: DivisionFeatureFlags;
  updatedAt: Date;
};

export type MockAdminRole = "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";

const createdAt = new Date("2026-03-20T00:00:00+09:00");
const createdAtIso = createdAt.toISOString();

function getDefaultStudyTracks(divisionSlug: string) {
  switch (divisionSlug) {
    case "police":
      return ["경찰"];
    case "fire":
      return ["소방"];
    case "allpass":
    case "hankyung-sparta":
      return ["경찰", "소방", "9급공무원", "행정직", "기타"];
    default:
      return [];
  }
}

function getDefaultWarnMessageTemplate(stageLabel: string) {
  return `안녕하세요. {학원명}입니다.\n{직렬명} {학생이름} 학생의 벌점이 {벌점}점으로 ${stageLabel} 대상입니다.`;
}

function createDefaultSettings(divisionId: string, divisionSlug: string): MockDivisionSettings {
  return {
    divisionId,
    warnLevel1: 10,
    warnLevel2: 20,
    warnInterview: 25,
    warnWithdraw: 30,
    warnMsgLevel1: getDefaultWarnMessageTemplate("1차 경고"),
    warnMsgLevel2: getDefaultWarnMessageTemplate("2차 경고"),
    warnMsgInterview: getDefaultWarnMessageTemplate("면담"),
    warnMsgWithdraw: getDefaultWarnMessageTemplate("퇴실"),
    tardyMinutes: 20,
    assistantPastEditAllowed: false,
    assistantPastEditDays: 0,
    holidayLimit: 1,
    halfDayLimit: 2,
    healthLimit: 1,
    holidayUnusedPts: 5,
    halfDayUnusedPts: 2,
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
    studyTracks: getDefaultStudyTracks(divisionSlug),
    pointCategories: [...DEFAULT_POINT_CATEGORIES],
    featureFlags: { ...DEFAULT_DIVISION_FEATURE_FLAGS },
    updatedAt: createdAt,
  };
}

export const MOCK_DIVISIONS: MockDivision[] = [
  {
    id: "div-police",
    slug: "police",
    name: "경찰",
    fullName: "시간통제 경찰학원",
    color: "#1B4FBB",
    isActive: true,
    displayOrder: 0,
    createdAt,
  },
  {
    id: "div-fire",
    slug: "fire",
    name: "소방",
    fullName: "시간통제 소방학원",
    color: "#C55A11",
    isActive: true,
    displayOrder: 1,
    createdAt,
  },
  {
    id: "div-allpass",
    slug: "allpass",
    name: "올패스독학원",
    fullName: "올패스독학원",
    color: "#0F766E",
    isActive: true,
    displayOrder: 2,
    createdAt,
  },
  {
    id: "div-hankyung-sparta",
    slug: "hankyung-sparta",
    name: "한경스파르타",
    fullName: "한경스파르타",
    color: "#2F5D50",
    isActive: true,
    displayOrder: 3,
    createdAt,
  },
];

export const MOCK_DIVISION_SETTINGS: Record<string, MockDivisionSettings> = {
  police: createDefaultSettings("div-police", "police"),
  fire: createDefaultSettings("div-fire", "fire"),
  allpass: createDefaultSettings("div-allpass", "allpass"),
  "hankyung-sparta": createDefaultSettings("div-hankyung-sparta", "hankyung-sparta"),
};

export const MOCK_STUDENTS: MockStudent[] = [
  {
    id: "student-police-001",
    divisionId: "div-police",
    divisionSlug: "police",
    name: "김지훈",
    studentNumber: "P-2026-001",
    studyTrack: "경찰",
    phone: "010-1111-0001",
    seatLabel: "A-01",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: "경찰 공채 준비",
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-police-002",
    divisionId: "div-police",
    divisionSlug: "police",
    name: "박도윤",
    studentNumber: "P-2026-002",
    studyTrack: "경찰",
    phone: "010-1111-0002",
    seatLabel: "A-02",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: null,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-police-003",
    divisionId: "div-police",
    divisionSlug: "police",
    name: "이서준",
    studentNumber: "P-2026-003",
    studyTrack: "경찰",
    phone: "010-1111-0003",
    seatLabel: "A-03",
    status: "ON_LEAVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: "개인 사정으로 일시 중단",
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-police-004",
    divisionId: "div-police",
    divisionSlug: "police",
    name: "최하린",
    studentNumber: "P-2026-004",
    studyTrack: "경찰",
    phone: "010-1111-0004",
    seatLabel: "B-01",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: null,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-fire-001",
    divisionId: "div-fire",
    divisionSlug: "fire",
    name: "정소민",
    studentNumber: "F-2026-001",
    studyTrack: "소방",
    phone: "010-2222-0001",
    seatLabel: "A-01",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: "소방 공채 준비",
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-fire-002",
    divisionId: "div-fire",
    divisionSlug: "fire",
    name: "윤현우",
    studentNumber: "F-2026-002",
    studyTrack: "소방",
    phone: "010-2222-0002",
    seatLabel: "A-02",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: null,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-fire-003",
    divisionId: "div-fire",
    divisionSlug: "fire",
    name: "서하린",
    studentNumber: "F-2026-003",
    studyTrack: "소방",
    phone: "010-2222-0003",
    seatLabel: "A-03",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: null,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-allpass-001",
    divisionId: "div-allpass",
    divisionSlug: "allpass",
    name: "강민재",
    studentNumber: "A-2026-001",
    studyTrack: "9급공무원",
    phone: "010-3333-0001",
    seatLabel: "A-01",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: "9급 일반행정 준비",
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-allpass-002",
    divisionId: "div-allpass",
    divisionSlug: "allpass",
    name: "문태윤",
    studentNumber: "A-2026-002",
    studyTrack: "경찰",
    phone: "010-3333-0002",
    seatLabel: "A-02",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: null,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-hankyung-sparta-001",
    divisionId: "div-hankyung-sparta",
    divisionSlug: "hankyung-sparta",
    name: "조예준",
    studentNumber: "H-2026-001",
    studyTrack: "행정직",
    phone: "010-4444-0001",
    seatLabel: "A-01",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: "행정직 집중반",
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
  {
    id: "student-hankyung-sparta-002",
    divisionId: "div-hankyung-sparta",
    divisionSlug: "hankyung-sparta",
    name: "최서윤",
    studentNumber: "H-2026-002",
    studyTrack: "소방",
    phone: "010-4444-0002",
    seatLabel: "A-02",
    status: "ACTIVE",
    enrolledAt: createdAtIso,
    withdrawnAt: null,
    withdrawnNote: null,
    memo: null,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  },
];

export function isMockMode() {
  return process.env.MOCK_MODE === "true";
}

export function getMockDivisionBySlug(slug: string) {
  return MOCK_DIVISIONS.find((division) => division.slug === slug) ?? null;
}

export function getMockAdminSession(
  divisionSlug = "police",
  role: MockAdminRole = "ADMIN",
  name?: string,
) {
  const division = getMockDivisionBySlug(divisionSlug) ?? MOCK_DIVISIONS[0];
  const sessionId =
    role === "SUPER_ADMIN"
      ? "mock-super-admin"
      : role === "ASSISTANT"
        ? `mock-assistant-${division.slug}`
        : `mock-admin-${division.slug}`;
  const userId =
    role === "SUPER_ADMIN"
      ? "mock-user-super-admin"
      : role === "ASSISTANT"
        ? `mock-user-${division.slug}-assistant`
        : `mock-user-${division.slug}-admin`;

  return {
    id: sessionId,
    userId,
    name:
      name ??
      (role === "ASSISTANT"
        ? `테스트 ${division.name} 조교`
        : role === "SUPER_ADMIN"
          ? "테스트 슈퍼관리자"
          : `테스트 ${division.name} 관리자`),
    role,
    divisionId: role === "SUPER_ADMIN" ? null : division.id,
    divisionSlug: role === "SUPER_ADMIN" ? null : division.slug,
  };
}
