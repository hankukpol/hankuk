export type SiteSettingKey =
  | "site.title"
  | "site.heroBadge"
  | "site.heroTitle"
  | "site.heroSubtitle"
  | "site.footerDisclaimer"
  | "site.termsOfService"
  | "site.privacyPolicy"
  | "site.bannerImageUrl"
  | "site.bannerLink"
  | "site.careerExamEnabled"
  | "site.maintenanceMode"
  | "site.maintenanceMessage"
  | "site.mainPageAutoRefresh"
  | "site.mainPageRefreshInterval"
  | "site.mainCardLiveStatsEnabled"
  | "site.mainCardOverviewEnabled"
  | "site.mainCardDifficultyEnabled"
  | "site.mainCardCompetitiveEnabled"
  | "site.mainCardScoreDistributionEnabled"
  | "site.submissionEditLimit"
  | "site.finalPredictionEnabled"
  | "site.autoPassCutEnabled"
  | "site.autoPassCutMode"
  | "site.autoPassCutCheckIntervalSec"
  | "site.autoPassCutThresholdProfile"
  | "site.commentsEnabled"
  | "site.autoPassCutReadyRatioProfile"
  | "site.tabMainEnabled"
  | "site.tabInputEnabled"
  | "site.tabResultEnabled"
  | "site.tabPredictionEnabled"
  | "site.tabNoticesEnabled"
  | "site.tabFaqEnabled"
  | "site.tabLockedMessage"
  | "site.preRegistrationEnabled"
  | "site.answerInputEnabled"
  | "site.preRegistrationClosedMessage";

export type SiteSettingValueType = "string" | "nullable-string" | "boolean" | "number";

export type SiteSettingsMap = Record<SiteSettingKey, string | boolean | number | null>;

export const SITE_SETTING_TYPES: Record<SiteSettingKey, SiteSettingValueType> = {
  "site.title": "string",
  "site.heroBadge": "string",
  "site.heroTitle": "string",
  "site.heroSubtitle": "string",
  "site.footerDisclaimer": "string",
  "site.termsOfService": "string",
  "site.privacyPolicy": "string",
  "site.bannerImageUrl": "nullable-string",
  "site.bannerLink": "nullable-string",
  "site.careerExamEnabled": "boolean",
  "site.maintenanceMode": "boolean",
  "site.maintenanceMessage": "string",
  "site.mainPageAutoRefresh": "boolean",
  "site.mainPageRefreshInterval": "string",
  "site.mainCardLiveStatsEnabled": "boolean",
  "site.mainCardOverviewEnabled": "boolean",
  "site.mainCardDifficultyEnabled": "boolean",
  "site.mainCardCompetitiveEnabled": "boolean",
  "site.mainCardScoreDistributionEnabled": "boolean",
  "site.submissionEditLimit": "number",
  "site.commentsEnabled": "boolean",
  "site.finalPredictionEnabled": "boolean",
  "site.autoPassCutEnabled": "boolean",
  "site.autoPassCutMode": "string",
  "site.autoPassCutCheckIntervalSec": "number",
  "site.autoPassCutThresholdProfile": "string",
  "site.autoPassCutReadyRatioProfile": "string",
  "site.tabMainEnabled": "boolean",
  "site.tabInputEnabled": "boolean",
  "site.tabResultEnabled": "boolean",
  "site.tabPredictionEnabled": "boolean",
  "site.tabNoticesEnabled": "boolean",
  "site.tabFaqEnabled": "boolean",
  "site.tabLockedMessage": "string",
  "site.preRegistrationEnabled": "boolean",
  "site.answerInputEnabled": "boolean",
  "site.preRegistrationClosedMessage": "string",
};

export const SITE_SETTING_DEFAULTS: SiteSettingsMap = {
  "site.title": "한국경찰 합격예측",
  "site.heroBadge": "2026년 한국경찰 1차 필기시험 합격예측",
  "site.heroTitle": "OMR 답안 입력부터\n합격권 예측까지 한 번에 확인하세요.",
  "site.heroSubtitle":
    "응시정보와 OMR 답안을 입력하면 과목별 분석, 예상 점수, 배수권 위치, 합격 가능성 정보를 실시간으로 확인할 수 있습니다.",
  "site.footerDisclaimer":
    "본 서비스는 수험생의 합격 예측을 위한 참고용 분석 도구이며, 실제 합격 여부를 보장하지 않습니다. 최종 결과는 경찰청 및 시도경찰청의 공식 공고를 반드시 확인해 주세요.",
  "site.termsOfService": `제1조 (목적)
이 약관은 한국경찰 합격예측 서비스(이하 "서비스")의 이용 조건과 운영 기준을 정합니다.

제2조 (서비스 이용)
서비스는 응시정보와 OMR 답안을 바탕으로 참고용 분석 결과를 제공합니다.
분석 결과는 실제 시험 결과와 차이가 있을 수 있으며, 최종 합격 여부는 경찰청 및 시도경찰청의 공식 발표를 기준으로 합니다.

제3조 (이용자의 책임)
이용자는 본인 정보를 정확하게 입력해야 하며, 타인의 계정이나 정보를 무단으로 사용해서는 안 됩니다.
서비스가 제공하는 자료와 분석 결과를 무단 복제하거나 재배포해서는 안 됩니다.

제4조 (서비스 변경 및 중단)
운영자는 서비스 개선, 점검, 정책 변경 등의 사유로 서비스 일부를 변경하거나 일시 중단할 수 있습니다.
중요한 변경이 있는 경우 서비스 화면이나 공지사항을 통해 사전에 안내합니다.

제5조 (면책)
서비스는 참고용 분석 도구이며, 분석 결과를 기반으로 한 판단과 책임은 이용자에게 있습니다.`,
  "site.privacyPolicy": `한국경찰 합격예측 서비스는 관련 법령에 따라 이용자의 개인정보를 아래와 같이 처리합니다.

1. 수집 항목
- 필수: 이름, 휴대전화번호, 비밀번호, 응시정보, OMR 답안

2. 이용 목적
- 회원 식별과 로그인 처리
- 성적 분석 및 합격예측 결과 제공
- 부정 이용 방지와 서비스 운영

3. 보관 기간
- 회원 탈퇴 시 지체 없이 삭제를 원칙으로 하며, 법령상 보관 의무가 있는 정보는 해당 기간 동안 보관합니다.

4. 제3자 제공
- 이용자의 개인정보를 별도의 동의 없이 외부에 제공하지 않습니다.

5. 이용자 권리
- 이용자는 언제든지 본인 개인정보의 열람, 정정, 삭제를 요청할 수 있습니다.`,
  "site.bannerImageUrl": null,
  "site.bannerLink": null,
  "site.careerExamEnabled": true,
  "site.maintenanceMode": false,
  "site.maintenanceMessage": "서비스 점검 중입니다.",
  "site.mainPageAutoRefresh": true,
  "site.mainPageRefreshInterval": "60",
  "site.mainCardLiveStatsEnabled": true,
  "site.mainCardOverviewEnabled": true,
  "site.mainCardDifficultyEnabled": true,
  "site.mainCardCompetitiveEnabled": true,
  "site.mainCardScoreDistributionEnabled": true,
  "site.submissionEditLimit": 3,
  "site.commentsEnabled": true,
  "site.finalPredictionEnabled": false,
  "site.autoPassCutEnabled": false,
  "site.autoPassCutMode": "HYBRID",
  "site.autoPassCutCheckIntervalSec": 300,
  "site.autoPassCutThresholdProfile": "BALANCED",
  "site.autoPassCutReadyRatioProfile": "BALANCED",
  "site.tabMainEnabled": true,
  "site.tabInputEnabled": true,
  "site.tabResultEnabled": true,
  "site.tabPredictionEnabled": true,
  "site.tabNoticesEnabled": true,
  "site.tabFaqEnabled": true,
  "site.tabLockedMessage": "시험 정보 준비 중입니다.",
  "site.preRegistrationEnabled": true,
  "site.answerInputEnabled": true,
  "site.preRegistrationClosedMessage":
    "사전등록이 마감되었습니다. 답안 입력 페이지를 다시 이용해 주세요.",
};
