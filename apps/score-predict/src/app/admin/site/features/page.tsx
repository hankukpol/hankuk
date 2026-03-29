"use client";

import ConfirmModal from "@/components/admin/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_SITE_CONTENT_FEATURE_LIST,
  ADMIN_SITE_FEATURE_LIST,
  ADMIN_SITE_OPERATION_FEATURE_LIST,
  ADMIN_SITE_PARTICIPANT_FEATURE_LIST,
  ADMIN_SITE_SYSTEM_FEATURE_LIST,
} from "@/lib/admin-site-features.shared";
import { asBoolean, asString, type SettingValue } from "../_lib/site-settings-client";
import { useSiteSettingsManager } from "../_lib/use-site-settings-manager";
import SiteSettingsSectionCard from "../_components/SiteSettingsSectionCard";

type ToggleField = {
  key: string;
  label: string;
  description: string;
  defaultValue: boolean;
};

const DEFAULT_PRE_REGISTRATION_CLOSED_MESSAGE =
  "사전등록이 마감되었습니다. 답안 입력 페이지를 다시 이용해 주세요.";

const FLOW_TOGGLES: ToggleField[] = [
  {
    key: "site.careerExamEnabled",
    label: "경력채용 시험",
    description: "경력채용 유형과 관련 통계를 공개합니다.",
    defaultValue: true,
  },
  {
    key: "site.preRegistrationEnabled",
    label: "사전등록",
    description: "응시정보 입력 전에 이름, 연락처, 수험번호를 미리 등록할 수 있습니다.",
    defaultValue: true,
  },
  {
    key: "site.answerInputEnabled",
    label: "답안 입력",
    description: "OMR 답안 입력과 채점 흐름을 공개합니다.",
    defaultValue: true,
  },
  {
    key: "site.finalPredictionEnabled",
    label: "최종 예상 컷",
    description: "최종 예상 컷 공개와 관련 API를 활성화합니다.",
    defaultValue: false,
  },
  {
    key: "site.commentsEnabled",
    label: "실시간 댓글",
    description: "댓글 영역과 댓글 API를 공개합니다.",
    defaultValue: true,
  },
];

const TAB_TOGGLES: ToggleField[] = [
  {
    key: "site.tabMainEnabled",
    label: "메인 탭",
    description: "메인 요약 탭과 직접 접근 페이지를 노출합니다.",
    defaultValue: true,
  },
  {
    key: "site.tabInputEnabled",
    label: "입력 탭",
    description: "입력 탭과 입력 페이지 직접 접근을 허용합니다.",
    defaultValue: true,
  },
  {
    key: "site.tabResultEnabled",
    label: "결과 탭",
    description: "성적 분석 탭과 결과 페이지 직접 접근을 허용합니다.",
    defaultValue: true,
  },
  {
    key: "site.tabPredictionEnabled",
    label: "합격 예측 탭",
    description: "합격 예측 정보 탭과 안내 페이지 직접 접근을 허용합니다.",
    defaultValue: true,
  },
  {
    key: "site.tabNoticesEnabled",
    label: "공지사항 탭",
    description: "공지사항 탭과 공지 페이지 직접 접근을 허용합니다.",
    defaultValue: true,
  },
  {
    key: "site.tabFaqEnabled",
    label: "FAQ 탭",
    description: "FAQ 탭과 FAQ 페이지 직접 접근을 허용합니다.",
    defaultValue: true,
  },
];

const CARD_TOGGLES: ToggleField[] = [
  {
    key: "site.mainCardLiveStatsEnabled",
    label: "실시간 참여 현황 카드",
    description: "메인 상단의 실시간 참여 집계를 노출합니다.",
    defaultValue: true,
  },
  {
    key: "site.mainCardOverviewEnabled",
    label: "집계 개요 카드",
    description: "메인 통계 API 기반 개요 카드를 노출합니다.",
    defaultValue: true,
  },
  {
    key: "site.mainCardDifficultyEnabled",
    label: "체감 난이도 카드",
    description: "과목별 체감 난이도 집계 카드를 노출합니다.",
    defaultValue: true,
  },
  {
    key: "site.mainCardCompetitiveEnabled",
    label: "경쟁률 TOP5 카드",
    description: "경쟁률 비교 카드를 노출합니다.",
    defaultValue: true,
  },
  {
    key: "site.mainCardScoreDistributionEnabled",
    label: "점수 분포 카드",
    description: "점수 분포 차트 카드를 노출합니다.",
    defaultValue: true,
  },
];

const ADMIN_CONTENT_TOGGLES: ToggleField[] = ADMIN_SITE_CONTENT_FEATURE_LIST.map((feature) => ({
  key: feature.settingKey,
  label: feature.label,
  description: feature.description,
  defaultValue: true,
}));

const ADMIN_PARTICIPANT_TOGGLES: ToggleField[] =
  ADMIN_SITE_PARTICIPANT_FEATURE_LIST.map((feature) => ({
    key: feature.settingKey,
    label: feature.label,
    description: feature.description,
    defaultValue: true,
  }));

const ADMIN_OPERATION_TOGGLES: ToggleField[] = ADMIN_SITE_OPERATION_FEATURE_LIST.map(
  (feature) => ({
    key: feature.settingKey,
    label: feature.label,
    description: feature.description,
    defaultValue: true,
  })
);

const ADMIN_SYSTEM_TOGGLES: ToggleField[] = ADMIN_SITE_SYSTEM_FEATURE_LIST.map((feature) => ({
  key: feature.settingKey,
  label: feature.label,
  description: feature.description,
  defaultValue: true,
}));

const SITE_SETTINGS_TOGGLES: ToggleField[] = [
  {
    key: "site.adminSiteHubEnabled",
    label: "사이트 설정 개요",
    description: "사이트 설정 허브와 개요 카드 진입을 허용합니다.",
    defaultValue: true,
  },
  {
    key: "site.adminSiteBasicEnabled",
    label: "기본 설정 탭",
    description: "사이트 제목, 히어로 문구, 브랜딩 문구 설정 탭을 엽니다.",
    defaultValue: true,
  },
  {
    key: "site.adminSitePoliciesEnabled",
    label: "정책 탭",
    description: "이용약관과 개인정보처리방침 설정 탭을 엽니다.",
    defaultValue: true,
  },
  {
    key: "site.adminSiteVisibilityEnabled",
    label: "잠금 안내 탭",
    description: "비활성 메뉴와 직접 접근 차단 안내 문구를 관리합니다.",
    defaultValue: true,
  },
  {
    key: "site.adminSiteOperationsEnabled",
    label: "운영 탭",
    description: "점검 모드, 자동 새로고침, 수정 제한 같은 운영 정책 탭을 엽니다.",
    defaultValue: true,
  },
  {
    key: "site.adminSiteAutoPassCutEnabled",
    label: "자동 합격컷 탭",
    description: "자동 합격컷 정책과 체크 주기 설정 탭을 엽니다.",
    defaultValue: true,
  },
];

function FeatureToggleItem({
  field,
  checked,
  onChange,
}: {
  field: ToggleField;
  checked: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="space-y-1">
        <span className="block text-sm font-medium text-slate-900">{field.label}</span>
        <span className="block text-xs leading-5 text-slate-500">{field.description}</span>
      </span>
    </label>
  );
}

function FeatureToggleGroup({
  title,
  description,
  fields,
  settings,
  updateSetting,
}: {
  title: string;
  description: string;
  fields: ToggleField[];
  settings: Record<string, string | boolean | number | null>;
  updateSetting: (key: string, value: SettingValue) => void;
}) {
  function setAll(enabled: boolean) {
    for (const field of fields) {
      updateSetting(field.key, enabled);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setAll(true)}>
            전체 켜기
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAll(false)}>
            전체 끄기
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {fields.map((field) => (
          <FeatureToggleItem
            key={field.key}
            field={field}
            checked={asBoolean(settings[field.key], field.defaultValue)}
            onChange={(nextValue) => updateSetting(field.key, nextValue)}
          />
        ))}
      </div>
    </div>
  );
}

export default function AdminSiteFeaturesPage() {
  const { settings, updateSetting, isLoading, isSaving, notice, handleSave, modalProps } =
    useSiteSettingsManager({
      section: "features",
      loadErrorMessage: "기능 설정을 불러오지 못했습니다.",
      saveErrorMessage: "기능 설정 저장에 실패했습니다.",
      successMessage: "기능 설정이 저장되었습니다.",
      confirmTitle: "기능 설정 저장",
      confirmDescription: "기능 활성화 상태를 저장하시겠습니까?",
      buildPayload: (currentSettings) => {
        const preRegistrationClosedMessage = asString(
          currentSettings["site.preRegistrationClosedMessage"],
          DEFAULT_PRE_REGISTRATION_CLOSED_MESSAGE
        ).trim();

        if (!preRegistrationClosedMessage) {
          throw new Error("사전등록 종료 안내 메시지를 입력해 주세요.");
        }

        const adminFeaturePayload = Object.fromEntries(
          ADMIN_SITE_FEATURE_LIST.map((feature) => [
            feature.settingKey,
            asBoolean(currentSettings[feature.settingKey], true),
          ])
        ) as Record<string, SettingValue>;

        const siteSettingsAccessPayload = Object.fromEntries(
          SITE_SETTINGS_TOGGLES.map((field) => [
            field.key,
            asBoolean(currentSettings[field.key], field.defaultValue),
          ])
        ) as Record<string, SettingValue>;

        return {
          "site.careerExamEnabled": asBoolean(currentSettings["site.careerExamEnabled"], true),
          "site.preRegistrationEnabled": asBoolean(
            currentSettings["site.preRegistrationEnabled"],
            true
          ),
          "site.answerInputEnabled": asBoolean(currentSettings["site.answerInputEnabled"], true),
          "site.finalPredictionEnabled": asBoolean(
            currentSettings["site.finalPredictionEnabled"],
            false
          ),
          "site.commentsEnabled": asBoolean(currentSettings["site.commentsEnabled"], true),
          "site.tabMainEnabled": asBoolean(currentSettings["site.tabMainEnabled"], true),
          "site.tabInputEnabled": asBoolean(currentSettings["site.tabInputEnabled"], true),
          "site.tabResultEnabled": asBoolean(currentSettings["site.tabResultEnabled"], true),
          "site.tabPredictionEnabled": asBoolean(
            currentSettings["site.tabPredictionEnabled"],
            true
          ),
          "site.tabNoticesEnabled": asBoolean(currentSettings["site.tabNoticesEnabled"], true),
          "site.tabFaqEnabled": asBoolean(currentSettings["site.tabFaqEnabled"], true),
          ...adminFeaturePayload,
          ...siteSettingsAccessPayload,
          "site.mainCardLiveStatsEnabled": asBoolean(
            currentSettings["site.mainCardLiveStatsEnabled"],
            true
          ),
          "site.mainCardOverviewEnabled": asBoolean(
            currentSettings["site.mainCardOverviewEnabled"],
            true
          ),
          "site.mainCardDifficultyEnabled": asBoolean(
            currentSettings["site.mainCardDifficultyEnabled"],
            true
          ),
          "site.mainCardCompetitiveEnabled": asBoolean(
            currentSettings["site.mainCardCompetitiveEnabled"],
            true
          ),
          "site.mainCardScoreDistributionEnabled": asBoolean(
            currentSettings["site.mainCardScoreDistributionEnabled"],
            true
          ),
          "site.preRegistrationClosedMessage": preRegistrationClosedMessage,
        } satisfies Record<string, SettingValue>;
      },
    });

  if (isLoading) {
    return <p className="text-sm text-slate-600">기능 설정을 불러오는 중입니다...</p>;
  }

  return (
    <>
      <SiteSettingsSectionCard
        title="기능 설정"
        description="지점 운영 정책에 맞게 기능을 범주별로 켜고 끄면 공개 화면과 관리자 도구에 즉시 반영됩니다."
        notice={notice}
        footer={
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "저장 중..." : "기능 설정 저장"}
          </Button>
        }
      >
        <FeatureToggleGroup
          title="시험/입력 흐름"
          description="응시자 참여 흐름과 공개 시험 기능을 제어합니다."
          fields={FLOW_TOGGLES}
          settings={settings}
          updateSetting={updateSetting}
        />

        <div className="space-y-2">
          <Label htmlFor="pre-registration-closed-message">사전등록 종료 안내 메시지</Label>
          <Input
            id="pre-registration-closed-message"
            value={asString(
              settings["site.preRegistrationClosedMessage"],
              DEFAULT_PRE_REGISTRATION_CLOSED_MESSAGE
            )}
            onChange={(event) =>
              updateSetting("site.preRegistrationClosedMessage", event.target.value)
            }
            placeholder={DEFAULT_PRE_REGISTRATION_CLOSED_MESSAGE}
          />
          <p className="text-xs text-slate-500">
            사전등록만 닫고 답안 입력은 유지할 때 입력 화면에서 보여 줄 안내 문구입니다.
          </p>
        </div>

        <FeatureToggleGroup
          title="공개 메뉴"
          description="메뉴 노출과 직접 접근 허용 여부를 한 번에 제어합니다."
          fields={TAB_TOGGLES}
          settings={settings}
          updateSetting={updateSetting}
        />

        <FeatureToggleGroup
          title="참여자/통계 도구"
          description="사전등록, 제출, 통계, 사용자, 댓글 관련 관리자 도구를 기능 단위로 제어합니다."
          fields={ADMIN_PARTICIPANT_TOGGLES}
          settings={settings}
          updateSetting={updateSetting}
        />

        <FeatureToggleGroup
          title="관리자 콘텐츠 도구"
          description="배너, 이벤트, 공지사항, FAQ 관리 화면과 API를 개별적으로 켜고 끕니다."
          fields={ADMIN_CONTENT_TOGGLES}
          settings={settings}
          updateSetting={updateSetting}
        />

        <FeatureToggleGroup
          title="사이트 설정 섹션"
          description="기능 설정은 복구 경로로 유지하고, 나머지 사이트 설정 섹션은 지점 정책에 맞게 제어합니다."
          fields={SITE_SETTINGS_TOGGLES}
          settings={settings}
          updateSetting={updateSetting}
        />

        <FeatureToggleGroup
          title="시험 운영 도구"
          description="시험, 정답, 지역 모집인원, 합격컷 발표 등 운영 도구를 기능 단위로 제어합니다."
          fields={ADMIN_OPERATION_TOGGLES}
          settings={settings}
          updateSetting={updateSetting}
        />

        <FeatureToggleGroup
          title="시스템 도구"
          description="목업 데이터 생성과 전체 초기화 같은 시스템성 도구를 제어합니다."
          fields={ADMIN_SYSTEM_TOGGLES}
          settings={settings}
          updateSetting={updateSetting}
        />

        <FeatureToggleGroup
          title="메인 분석 카드"
          description="랜딩 페이지와 메인 통계 API에서 사용하는 카드 노출 범위를 제어합니다."
          fields={CARD_TOGGLES}
          settings={settings}
          updateSetting={updateSetting}
        />
      </SiteSettingsSectionCard>

      <ConfirmModal {...modalProps} />
    </>
  );
}
