export const DIVISION_FEATURES = [
  {
    key: "attendanceManagement",
    label: "출결 관리",
    description: "관리자와 조교의 출결 체크, 학생 출결 상세 화면을 사용합니다.",
  },
  {
    key: "announcements",
    label: "공지 사항",
    description: "지점 공지 등록과 노출을 관리합니다.",
  },
  {
    key: "phoneSubmissions",
    label: "휴대폰 관리",
    description: "휴대폰 제출 체크와 제출 이력 관리를 사용합니다.",
  },
  {
    key: "studentManagement",
    label: "학생 관리",
    description: "학생 목록, 신규 등록, 학생 상세 관리 화면을 사용합니다.",
  },
  {
    key: "seatManagement",
    label: "좌석 관리",
    description: "좌석 현황과 좌석 배치 설정을 사용합니다.",
  },
  {
    key: "pointManagement",
    label: "상벌점",
    description: "상벌점 지급과 규칙 관리를 사용합니다.",
  },
  {
    key: "leaveManagement",
    label: "외출/휴가",
    description: "외출, 반가, 병가, 휴가 관리를 사용합니다.",
  },
  {
    key: "warningManagement",
    label: "경고 대상자",
    description: "경고 단계와 대상자 관리를 사용합니다.",
  },
  {
    key: "interviewManagement",
    label: "면담 기록",
    description: "학생 면담 기록과 면담 필요 대상 관리를 사용합니다.",
  },
  {
    key: "examManagement",
    label: "시험 관리",
    description: "시험 성적 입력과 시험 유형 설정을 사용합니다.",
  },
  {
    key: "examScheduleManagement",
    label: "시험 일정",
    description: "시험 일정 등록과 D-Day 노출을 사용합니다.",
  },
  {
    key: "paymentManagement",
    label: "수납 관리",
    description: "수납 내역과 수납 카테고리 관리를 사용합니다.",
  },
  {
    key: "reporting",
    label: "통계/보고서",
    description: "지점 리포트와 내보내기 기능을 사용합니다.",
  },
  {
    key: "staffManagement",
    label: "직원 관리",
    description: "관리자와 조교 계정을 지점 단위로 관리합니다.",
  },
] as const;

export type DivisionFeatureKey = (typeof DIVISION_FEATURES)[number]["key"];
export type DivisionFeatureFlags = Record<DivisionFeatureKey, boolean>;

export const DEFAULT_DIVISION_FEATURE_FLAGS: DivisionFeatureFlags = Object.freeze(
  Object.fromEntries(DIVISION_FEATURES.map(({ key }) => [key, true])) as DivisionFeatureFlags,
);

export function normalizeDivisionFeatureFlags(value: unknown): DivisionFeatureFlags {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    DIVISION_FEATURES.map(({ key }) => [
      key,
      typeof source[key] === "boolean" ? source[key] : DEFAULT_DIVISION_FEATURE_FLAGS[key],
    ]),
  ) as DivisionFeatureFlags;
}
