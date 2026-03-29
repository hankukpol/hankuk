import type { SiteSettingKey } from "@/lib/site-settings.constants";
import { asBoolean, asNumber, asString, type SiteSettingsMap } from "./site-settings-client";

export const SITE_FEATURE_FLOW_SETTING_KEYS = [
  "site.careerExamEnabled",
  "site.preRegistrationEnabled",
  "site.answerInputEnabled",
  "site.finalPredictionEnabled",
  "site.commentsEnabled",
] as const;

export const SITE_FEATURE_TAB_SETTING_KEYS = [
  "site.tabMainEnabled",
  "site.tabInputEnabled",
  "site.tabResultEnabled",
  "site.tabPredictionEnabled",
  "site.tabNoticesEnabled",
  "site.tabFaqEnabled",
] as const;

export const SITE_FEATURE_CARD_SETTING_KEYS = [
  "site.mainCardLiveStatsEnabled",
  "site.mainCardOverviewEnabled",
  "site.mainCardDifficultyEnabled",
  "site.mainCardCompetitiveEnabled",
  "site.mainCardScoreDistributionEnabled",
] as const;

export const SITE_FEATURE_SITE_SETTINGS_SETTING_KEYS = [
  "site.adminSiteHubEnabled",
  "site.adminSiteBasicEnabled",
  "site.adminSitePoliciesEnabled",
  "site.adminSiteVisibilityEnabled",
  "site.adminSiteOperationsEnabled",
  "site.adminSiteAutoPassCutEnabled",
] as const;

export const SITE_FEATURE_ADMIN_SETTING_KEYS = [
  "site.adminBannersEnabled",
  "site.adminEventsEnabled",
  "site.adminNoticesEnabled",
  "site.adminFaqsEnabled",
  "site.adminPreRegistrationsEnabled",
  "site.adminSubmissionsEnabled",
  "site.adminStatsEnabled",
  "site.adminVisitorsEnabled",
  "site.adminUsersEnabled",
  "site.adminCommentsEnabled",
  "site.adminExamsEnabled",
  "site.adminAnswersEnabled",
  "site.adminRegionsEnabled",
  "site.adminPassCutEnabled",
  "site.adminMockDataEnabled",
  "site.adminOpenResetEnabled",
  ...SITE_FEATURE_SITE_SETTINGS_SETTING_KEYS,
] as const;

export const SITE_FEATURE_SETTING_KEYS = [
  ...SITE_FEATURE_FLOW_SETTING_KEYS,
  ...SITE_FEATURE_TAB_SETTING_KEYS,
  ...SITE_FEATURE_CARD_SETTING_KEYS,
  ...SITE_FEATURE_ADMIN_SETTING_KEYS,
] as const;

export type SiteSettingsSectionKey =
  | "basic"
  | "policies"
  | "features"
  | "visibility"
  | "operations"
  | "auto-pass-cut";

export type SiteSettingsSection = {
  key: SiteSettingsSectionKey;
  href: string;
  navLabel: string;
  title: string;
  description: string;
  featureSettingKey?: SiteSettingKey;
  settingKeys: readonly SiteSettingKey[];
  getSummary: (settings: SiteSettingsMap) => string[];
};

export type SiteSettingsOverviewItem = {
  label: string;
  value: string;
  description: string;
};

export type SiteSettingsNavItem = {
  key: "overview" | SiteSettingsSectionKey;
  href: string;
  label: string;
};

export const SITE_SETTINGS_OVERVIEW_FEATURE_KEY = "site.adminSiteHubEnabled" as const;

export const SITE_SETTINGS_OVERVIEW_NAV_ITEM: SiteSettingsNavItem = {
  key: "overview",
  href: "/admin/site",
  label: "개요",
};

function describeToggle(enabled: boolean, enabledLabel = "사용", disabledLabel = "중지") {
  return enabled ? enabledLabel : disabledLabel;
}

function describePolicy(value: string) {
  return value.trim().length > 0 ? "작성 완료" : "미작성";
}

function countEnabledSettings(
  settings: SiteSettingsMap,
  keys: readonly SiteSettingKey[],
  fallback = true
) {
  return keys.filter((key) => asBoolean(settings[key], fallback)).length;
}

function describeInputFlow(settings: SiteSettingsMap) {
  const preRegistrationEnabled = asBoolean(settings["site.preRegistrationEnabled"], true);
  const answerInputEnabled = asBoolean(settings["site.answerInputEnabled"], true);

  if (preRegistrationEnabled && answerInputEnabled) {
    return "사전등록 + 답안 입력";
  }

  if (preRegistrationEnabled) {
    return "사전등록만";
  }

  if (answerInputEnabled) {
    return "답안 입력만";
  }

  return "입력 전체 종료";
}

const BASIC_SECTION_SETTING_KEYS = [
  "site.title",
  "site.heroBadge",
  "site.heroTitle",
  "site.heroSubtitle",
  "site.footerDisclaimer",
  "site.bannerImageUrl",
  "site.bannerLink",
] as const satisfies readonly SiteSettingKey[];

const POLICY_SECTION_SETTING_KEYS = [
  "site.termsOfService",
  "site.privacyPolicy",
] as const satisfies readonly SiteSettingKey[];

const FEATURE_SECTION_SETTING_KEYS = [
  ...SITE_FEATURE_SETTING_KEYS,
  "site.preRegistrationClosedMessage",
] as const satisfies readonly SiteSettingKey[];

const VISIBILITY_SECTION_SETTING_KEYS =
  ["site.tabLockedMessage"] as const satisfies readonly SiteSettingKey[];

const OPERATIONS_SECTION_SETTING_KEYS = [
  "site.maintenanceMode",
  "site.maintenanceMessage",
  "site.mainPageAutoRefresh",
  "site.mainPageRefreshInterval",
  "site.submissionEditLimit",
] as const satisfies readonly SiteSettingKey[];

const AUTO_PASS_CUT_SECTION_SETTING_KEYS = [
  "site.autoPassCutEnabled",
  "site.autoPassCutMode",
  "site.autoPassCutCheckIntervalSec",
  "site.autoPassCutThresholdProfile",
  "site.autoPassCutReadyRatioProfile",
] as const satisfies readonly SiteSettingKey[];

export const SITE_SETTINGS_SECTIONS: SiteSettingsSection[] = [
  {
    key: "basic",
    href: "/admin/site/basic",
    navLabel: "기본",
    title: "기본 설정",
    description:
      "사이트명, 히어로 문구, 푸터 안내 문구처럼 기본 브랜딩 문구를 관리합니다.",
    featureSettingKey: "site.adminSiteBasicEnabled",
    settingKeys: BASIC_SECTION_SETTING_KEYS,
    getSummary: (settings) => [
      `사이트명: ${asString(settings["site.title"], "미설정")}`,
      `히어로 배지: ${asString(settings["site.heroBadge"], "미설정")}`,
      `푸터 문구: ${asString(settings["site.footerDisclaimer"]).trim() ? "작성 완료" : "미작성"}`,
    ],
  },
  {
    key: "policies",
    href: "/admin/site/policies",
    navLabel: "정책",
    title: "정책 관리",
    description:
      "이용약관과 개인정보처리방침 본문을 운영 기준에 맞게 직접 수정합니다.",
    featureSettingKey: "site.adminSitePoliciesEnabled",
    settingKeys: POLICY_SECTION_SETTING_KEYS,
    getSummary: (settings) => [
      `이용약관: ${describePolicy(asString(settings["site.termsOfService"]))}`,
      `개인정보처리방침: ${describePolicy(asString(settings["site.privacyPolicy"]))}`,
    ],
  },
  {
    key: "features",
    href: "/admin/site/features",
    navLabel: "기능",
    title: "기능 설정",
    description:
      "입력 흐름, 공개 메뉴, 메인 카드, 관리자 도구를 기능 단위로 켜고 끕니다.",
    settingKeys: FEATURE_SECTION_SETTING_KEYS,
    getSummary: (settings) => [
      `활성 기능: ${countEnabledSettings(settings, SITE_FEATURE_SETTING_KEYS)}/${SITE_FEATURE_SETTING_KEYS.length}`,
      `입력 흐름: ${describeInputFlow(settings)}`,
      `메인 카드: ${countEnabledSettings(settings, SITE_FEATURE_CARD_SETTING_KEYS)}/${SITE_FEATURE_CARD_SETTING_KEYS.length}`,
      `관리자 도구: ${countEnabledSettings(settings, SITE_FEATURE_ADMIN_SETTING_KEYS)}/${SITE_FEATURE_ADMIN_SETTING_KEYS.length}`,
    ],
  },
  {
    key: "visibility",
    href: "/admin/site/visibility",
    navLabel: "잠금 안내",
    title: "잠금 안내 설정",
    description:
      "비활성 메뉴와 직접 접근 차단 시 표시할 안내 문구를 관리합니다.",
    featureSettingKey: "site.adminSiteVisibilityEnabled",
    settingKeys: VISIBILITY_SECTION_SETTING_KEYS,
    getSummary: (settings) => [
      `잠금 안내: ${asString(settings["site.tabLockedMessage"]).trim() ? "설정 완료" : "미설정"}`,
      `사전등록 종료 안내: ${
        asString(settings["site.preRegistrationClosedMessage"]).trim() ? "설정 완료" : "미설정"
      }`,
      `비활성 메뉴: ${
        SITE_FEATURE_TAB_SETTING_KEYS.length -
        countEnabledSettings(settings, SITE_FEATURE_TAB_SETTING_KEYS)
      }개`,
    ],
  },
  {
    key: "operations",
    href: "/admin/site/operations",
    navLabel: "운영",
    title: "운영 설정",
    description:
      "점검 모드, 메인 자동 새로고침, 답안 수정 제한 같은 운영 정책을 관리합니다.",
    featureSettingKey: "site.adminSiteOperationsEnabled",
    settingKeys: OPERATIONS_SECTION_SETTING_KEYS,
    getSummary: (settings) => [
      `점검 모드: ${describeToggle(asBoolean(settings["site.maintenanceMode"], false), "활성", "비활성")}`,
      `메인 자동 새로고침: ${describeToggle(asBoolean(settings["site.mainPageAutoRefresh"], true), "사용", "중지")}`,
      `답안 수정 제한: ${asNumber(settings["site.submissionEditLimit"], 3)}회`,
    ],
  },
  {
    key: "auto-pass-cut",
    href: "/admin/site/auto-pass-cut",
    navLabel: "자동 합격컷",
    title: "자동 합격컷",
    description:
      "자동 발표 사용 여부, 체크 주기, 임계치 프로필을 한 곳에서 관리합니다.",
    featureSettingKey: "site.adminSiteAutoPassCutEnabled",
    settingKeys: AUTO_PASS_CUT_SECTION_SETTING_KEYS,
    getSummary: (settings) => [
      `자동 발표: ${describeToggle(asBoolean(settings["site.autoPassCutEnabled"], false), "활성", "비활성")}`,
      `동작 모드: ${asString(settings["site.autoPassCutMode"], "HYBRID")}`,
      `체크 주기: ${asNumber(settings["site.autoPassCutCheckIntervalSec"], 300)}초`,
    ],
  },
];

const SITE_SETTINGS_SECTION_MAP = Object.fromEntries(
  SITE_SETTINGS_SECTIONS.map((section) => [section.key, section])
) as Record<SiteSettingsSectionKey, SiteSettingsSection>;

export function isSiteSettingsSectionKey(value: string): value is SiteSettingsSectionKey {
  return value in SITE_SETTINGS_SECTION_MAP;
}

export function getSiteSettingsSection(key: SiteSettingsSectionKey) {
  return SITE_SETTINGS_SECTION_MAP[key];
}

export function isSiteSettingsOverviewEnabled(settings: SiteSettingsMap) {
  return asBoolean(settings[SITE_SETTINGS_OVERVIEW_FEATURE_KEY], true);
}

export function isSiteSettingsSectionEnabled(
  settings: SiteSettingsMap,
  key: SiteSettingsSectionKey
) {
  const section = getSiteSettingsSection(key);
  if (!section.featureSettingKey) {
    return true;
  }

  return asBoolean(settings[section.featureSettingKey], true);
}

export function getVisibleSiteSettingsSections(settings: SiteSettingsMap) {
  return SITE_SETTINGS_SECTIONS.filter((section) =>
    isSiteSettingsSectionEnabled(settings, section.key)
  );
}

export function getVisibleSiteSettingsNavItems(settings: SiteSettingsMap): SiteSettingsNavItem[] {
  const navItems: SiteSettingsNavItem[] = [];

  if (isSiteSettingsOverviewEnabled(settings)) {
    navItems.push(SITE_SETTINGS_OVERVIEW_NAV_ITEM);
  }

  navItems.push(
    ...getVisibleSiteSettingsSections(settings).map((section) => ({
      key: section.key,
      href: section.href,
      label: section.navLabel,
    }))
  );

  return navItems;
}

export function getSiteSettingsOverviewItems(settings: SiteSettingsMap): SiteSettingsOverviewItem[] {
  const enabledFeatureCount = countEnabledSettings(settings, SITE_FEATURE_SETTING_KEYS);

  return [
    {
      label: "활성 기능",
      value: `${enabledFeatureCount}/${SITE_FEATURE_SETTING_KEYS.length}`,
      description:
        "입력 흐름, 공개 메뉴, 메인 카드, 관리자 도구 중 현재 활성화된 항목 수입니다.",
    },
    {
      label: "입력 운영",
      value: describeInputFlow(settings),
      description: `${
        asBoolean(settings["site.maintenanceMode"], false) ? "점검 모드 활성" : "정상 운영"
      } / 답안 수정 ${asNumber(settings["site.submissionEditLimit"], 3)}회`,
    },
    {
      label: "자동 합격컷",
      value: asBoolean(settings["site.autoPassCutEnabled"], false) ? "활성" : "비활성",
      description: `모드 ${asString(settings["site.autoPassCutMode"], "HYBRID")} / 체크 ${asNumber(
        settings["site.autoPassCutCheckIntervalSec"],
        300
      )}초`,
    },
  ];
}
