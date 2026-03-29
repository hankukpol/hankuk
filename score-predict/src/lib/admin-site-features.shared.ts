import type { SiteSettingKey } from "@/lib/site-settings.constants";

export type AdminSiteFeatureKey =
  | "banners"
  | "events"
  | "notices"
  | "faqs"
  | "preRegistrations"
  | "submissions"
  | "stats"
  | "visitors"
  | "users"
  | "comments"
  | "exams"
  | "answers"
  | "regions"
  | "passCut"
  | "mockData"
  | "openReset";

export type AdminSiteFeatureState = Record<AdminSiteFeatureKey, boolean>;

export type AdminSiteFeatureGroup =
  | "content"
  | "participants"
  | "operations"
  | "system";

type AdminSiteFeatureDefinition = {
  key: AdminSiteFeatureKey;
  group: AdminSiteFeatureGroup;
  settingKey: SiteSettingKey;
  label: string;
  description: string;
  disabledTitle: string;
  disabledDescription: string;
};

type SiteSettingsLike = Record<
  string,
  string | boolean | number | null | undefined
>;

export const ADMIN_SITE_FEATURES: Record<
  AdminSiteFeatureKey,
  AdminSiteFeatureDefinition
> = {
  banners: {
    key: "banners",
    group: "content",
    settingKey: "site.adminBannersEnabled",
    label: "배너 관리",
    description: "배너 CRUD, 순서, 공개 상태, 업로드 도구를 제어합니다.",
    disabledTitle: "배너 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 배너 관리 도구를 사용할 수 없습니다.",
  },
  events: {
    key: "events",
    group: "content",
    settingKey: "site.adminEventsEnabled",
    label: "이벤트 관리",
    description: "이벤트 CRUD, 순서, 업로드, 공개 상태를 제어합니다.",
    disabledTitle: "이벤트 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 이벤트 관리 도구를 사용할 수 없습니다.",
  },
  notices: {
    key: "notices",
    group: "content",
    settingKey: "site.adminNoticesEnabled",
    label: "공지사항 관리",
    description: "공지 CRUD, 공개 상태, 노출 기간을 제어합니다.",
    disabledTitle: "공지사항 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 공지사항 관리 도구를 사용할 수 없습니다.",
  },
  faqs: {
    key: "faqs",
    group: "content",
    settingKey: "site.adminFaqsEnabled",
    label: "FAQ 관리",
    description: "FAQ CRUD, 순서, 공개 상태를 제어합니다.",
    disabledTitle: "FAQ 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 FAQ 관리 도구를 사용할 수 없습니다.",
  },
  preRegistrations: {
    key: "preRegistrations",
    group: "participants",
    settingKey: "site.adminPreRegistrationsEnabled",
    label: "사전등록 관리",
    description:
      "사전등록 목록, 수정, 삭제, 추첨, 내보내기 도구를 제어합니다.",
    disabledTitle: "사전등록 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 사전등록 도구를 사용할 수 없습니다.",
  },
  submissions: {
    key: "submissions",
    group: "participants",
    settingKey: "site.adminSubmissionsEnabled",
    label: "제출 관리",
    description: "제출 목록, 상세, 수정, 내보내기, 검색 도구를 제어합니다.",
    disabledTitle: "제출 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 제출 관리 도구를 사용할 수 없습니다.",
  },
  stats: {
    key: "stats",
    group: "participants",
    settingKey: "site.adminStatsEnabled",
    label: "참여 통계",
    description: "참여 통계 대시보드와 관리자 통계 API를 제어합니다.",
    disabledTitle: "참여 통계가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 참여 통계를 사용할 수 없습니다.",
  },
  visitors: {
    key: "visitors",
    group: "participants",
    settingKey: "site.adminVisitorsEnabled",
    label: "방문자 통계",
    description: "방문 추이와 유입 통계 화면을 제어합니다.",
    disabledTitle: "방문자 통계가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 방문자 통계를 사용할 수 없습니다.",
  },
  users: {
    key: "users",
    group: "participants",
    settingKey: "site.adminUsersEnabled",
    label: "사용자 관리",
    description: "사용자 검색, 권한 변경, 비밀번호 초기화 도구를 제어합니다.",
    disabledTitle: "사용자 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 사용자 관리 도구를 사용할 수 없습니다.",
  },
  comments: {
    key: "comments",
    group: "participants",
    settingKey: "site.adminCommentsEnabled",
    label: "댓글 관리",
    description: "댓글 검색, 숨김, 삭제, 목록 화면을 제어합니다.",
    disabledTitle: "댓글 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 댓글 관리 도구를 사용할 수 없습니다.",
  },
  exams: {
    key: "exams",
    group: "operations",
    settingKey: "site.adminExamsEnabled",
    label: "시험 관리",
    description: "시험 생성, 수정, 활성화 화면을 제어합니다.",
    disabledTitle: "시험 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 시험 운영 도구를 사용할 수 없습니다.",
  },
  answers: {
    key: "answers",
    group: "operations",
    settingKey: "site.adminAnswersEnabled",
    label: "정답 관리",
    description: "정답 입력, 미리보기, 로그, CSV 업로드, 재채점 도구를 제어합니다.",
    disabledTitle: "정답 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 정답 관리 도구를 사용할 수 없습니다.",
  },
  regions: {
    key: "regions",
    group: "operations",
    settingKey: "site.adminRegionsEnabled",
    label: "지역/모집인원 관리",
    description: "지역 모집인원과 수험번호 범위 설정을 제어합니다.",
    disabledTitle: "지역/모집인원 관리가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 지역/모집인원 도구를 사용할 수 없습니다.",
  },
  passCut: {
    key: "passCut",
    group: "operations",
    settingKey: "site.adminPassCutEnabled",
    label: "합격컷 발표",
    description: "합격컷 발표 이력과 공개 상태를 제어합니다.",
    disabledTitle: "합격컷 발표가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 합격컷 발표 도구를 사용할 수 없습니다.",
  },
  mockData: {
    key: "mockData",
    group: "system",
    settingKey: "site.adminMockDataEnabled",
    label: "목업 데이터",
    description: "목업 데이터 생성과 초기화 도구를 제어합니다.",
    disabledTitle: "목업 데이터 도구가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 목업 데이터 도구를 사용할 수 없습니다.",
  },
  openReset: {
    key: "openReset",
    group: "system",
    settingKey: "site.adminOpenResetEnabled",
    label: "전체 초기화",
    description: "이 지점에서 전체 운영 초기화 API를 허용할지 제어합니다.",
    disabledTitle: "전체 초기화가 비활성화되었습니다.",
    disabledDescription:
      "이 지점에서는 기능을 다시 켜기 전까지 전체 초기화 도구를 사용할 수 없습니다.",
  },
};

export const ADMIN_SITE_FEATURE_KEYS = Object.keys(
  ADMIN_SITE_FEATURES
) as AdminSiteFeatureKey[];

export const ADMIN_SITE_FEATURE_LIST = ADMIN_SITE_FEATURE_KEYS.map(
  (featureKey) => ADMIN_SITE_FEATURES[featureKey]
);

export const ADMIN_SITE_CONTENT_FEATURE_LIST = ADMIN_SITE_FEATURE_LIST.filter(
  (feature) => feature.group === "content"
);

export const ADMIN_SITE_PARTICIPANT_FEATURE_LIST =
  ADMIN_SITE_FEATURE_LIST.filter((feature) => feature.group === "participants");

export const ADMIN_SITE_OPERATION_FEATURE_LIST = ADMIN_SITE_FEATURE_LIST.filter(
  (feature) => feature.group === "operations"
);

export const ADMIN_SITE_SYSTEM_FEATURE_LIST = ADMIN_SITE_FEATURE_LIST.filter(
  (feature) => feature.group === "system"
);

export const ADMIN_SITE_FEATURE_DEFAULTS: AdminSiteFeatureState = {
  banners: true,
  events: true,
  notices: true,
  faqs: true,
  preRegistrations: true,
  submissions: true,
  stats: true,
  visitors: true,
  users: true,
  comments: true,
  exams: true,
  answers: true,
  regions: true,
  passCut: true,
  mockData: true,
  openReset: true,
};

export function resolveAdminSiteFeatureState(
  settings: SiteSettingsLike
): AdminSiteFeatureState {
  const nextState = { ...ADMIN_SITE_FEATURE_DEFAULTS };

  for (const feature of ADMIN_SITE_FEATURE_LIST) {
    const rawValue = settings[feature.settingKey];
    nextState[feature.key] = typeof rawValue === "boolean" ? rawValue : true;
  }

  return nextState;
}
